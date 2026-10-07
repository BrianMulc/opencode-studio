const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const configProviders = require('./config-providers');

const parseAgentMarkdown = (content) => {
    const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, body: content };
    let data = {};
    try {
        data = yaml.load(match[1]) || {};
    } catch {
        data = {};
    }
    return { data, body: match[2] || '' };
};

const buildAgentMarkdown = (frontmatter, body) => {
    const yamlText = yaml.dump(frontmatter, { lineWidth: 120, noRefs: true, quotingType: '"' });
    const content = body || '';
    return `---\n${yamlText}---\n\n${content}`;
};

// V1 -> V2 action renames (bash->shell, task->subagent, write/patch->edit).
const V1_TO_V2_ACTION = { bash: 'shell', task: 'subagent', write: 'edit', patch: 'edit' };
const renameActionToV2 = (rule) => {
    if (rule && typeof rule === 'object' && typeof rule.action === 'string' && V1_TO_V2_ACTION[rule.action]) {
        return { ...rule, action: V1_TO_V2_ACTION[rule.action] };
    }
    return rule;
};

const permissionMapToRules = (map) => {
    const rules = [];
    if (!map || typeof map !== 'object' || Array.isArray(map)) return rules;
    for (const [rawAction, value] of Object.entries(map)) {
        const action = V1_TO_V2_ACTION[rawAction] || rawAction;
        if (value === undefined || value === null) continue;
        if (typeof value === 'string') {
            rules.push({ action, resource: '*', effect: value });
            continue;
        }
        if (typeof value !== 'object') continue;
        const keys = Object.keys(value);
        if (keys.every((k) => k === 'allow' || k === 'deny')) {
            for (const p of value.allow || []) rules.push({ action, resource: p, effect: 'allow' });
            for (const p of value.deny || []) rules.push({ action, resource: p, effect: 'deny' });
            continue;
        }
        for (const [resource, effect] of Object.entries(value)) {
            if (typeof effect === 'string') rules.push({ action, resource, effect });
        }
    }
    return rules;
};

const joinModelVariant = (model, variant) => {
    if (!model || !variant || String(model).includes('#')) return model;
    return `${model}#${variant}`;
};

const OMO_BASENAMES = [
    'oh-my-openagent.json',
    'oh-my-openagent.jsonc',
    'oh-my-opencode.json',
    'oh-my-opencode.jsonc'
];

const findActiveOmoPath = (activeConfigDir) => {
    if (!activeConfigDir) return null;
    for (const basename of OMO_BASENAMES) {
        const candidate = path.join(activeConfigDir, basename);
        if (fs.existsSync(candidate)) {
            try {
                if (fs.statSync(candidate).isFile()) return candidate;
            } catch {}
        }
    }
    return null;
};

// The oh-my-openagent plugin is only active when listed in opencode.json's `plugin` array.
// The oh-my-openagent.json file is just a config file for the plugin — it's inert when the
// plugin isn't installed/enabled. This lets users keep the config file in a profile directory
// without OMO agents leaking into the agent list.
const isOhMyOpenAgentPluginEnabled = (activeConfigDir) => {
    if (!activeConfigDir) return false;
    const configPath = path.join(activeConfigDir, 'opencode.json');
    if (!fs.existsSync(configPath)) return false;
    try {
        const content = configProviders.loadConfigFileSync(configPath);
        if (!Array.isArray(content.plugin)) return false;
        return content.plugin.some((p) =>
            typeof p === 'string' && p.startsWith('oh-my-openagent')
        );
    } catch {
        return false;
    }
};

const aggregateAgents = ({ roots = [], agentDirs = [], activeConfigDir = null } = {}) => {
    const agentMap = new Map();

    const omoEnabled = isOhMyOpenAgentPluginEnabled(activeConfigDir);
    const activeOmoPath = omoEnabled ? findActiveOmoPath(activeConfigDir) : null;

    const toCanonicalEntry = (name, agentConfig) => {
        // Malformed (non-object) entries pass through verbatim — never spread
        // them, since spreading a string yields char-index garbage.
        if (!agentConfig || typeof agentConfig !== 'object' || Array.isArray(agentConfig)) return agentConfig;
        const entry = { ...agentConfig };
        // V1 JSON aliases -> V2 canonical (v2 translates legacy automatically;
        // canonicalizing here keeps the UI on one shape).
        if (entry.prompt !== undefined && entry.system === undefined) entry.system = entry.prompt;
        delete entry.prompt;
        if (entry.disable !== undefined && entry.disabled === undefined) entry.disabled = entry.disable;
        delete entry.disable;
        if (entry.maxSteps !== undefined && entry.steps === undefined) entry.steps = entry.maxSteps;
        delete entry.maxSteps;
        if (entry.variant !== undefined) {
            entry.model = joinModelVariant(entry.model, entry.variant);
            delete entry.variant;
        }
        if (entry.temperature !== undefined || entry.top_p !== undefined || entry.options !== undefined) {
            const body = { ...(entry.request && entry.request.body ? entry.request.body : {}) };
            if (entry.temperature !== undefined) body.temperature = entry.temperature;
            if (entry.top_p !== undefined) body.top_p = entry.top_p;
            if (entry.options && typeof entry.options === 'object') Object.assign(body, entry.options);
            entry.request = { ...(entry.request || {}), body };
            delete entry.temperature;
            delete entry.top_p;
            delete entry.options;
        }
        const perm = entry.permission || entry.permissions;
        if (perm !== undefined) {
            entry.permissions = Array.isArray(perm) ? perm.map(renameActionToV2) : permissionMapToRules(perm);
            delete entry.permission;
        }
        if (entry.tools && typeof entry.tools === 'object') {
            const denyRules = Object.entries(entry.tools)
                .filter(([, enabled]) => enabled === false)
                .map(([tool]) => ({ action: renameActionToV2(tool), resource: '*', effect: 'deny' }));
            entry.permissions = [...(entry.permissions || []), ...denyRules];
            delete entry.tools;
        }
        delete entry.name;
        return entry;
    };

    for (const root of roots) {
        const configPath = path.join(root, 'opencode.json');
        if (fs.existsSync(configPath)) {
            try {
                const content = configProviders.loadConfigFileSync(configPath);
                // V1 `agent` + deprecated `mode` merge into V2 `agents`; V2 wins.
                const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
                const merged = { ...(isObj(content.mode) ? content.mode : {}), ...(isObj(content.agent) ? content.agent : {}), ...(isObj(content.agents) ? content.agents : {}) };
                for (const [name, agentConfig] of Object.entries(merged)) {
                    if (!agentMap.has(name)) {
                        const canonical = toCanonicalEntry(name, agentConfig);
                        if (!isObj(canonical)) {
                            // Malformed entry: keep the raw value visible, never spread it.
                            agentMap.set(name, {
                                name,
                                raw: canonical,
                                source: 'json',
                                sourceProvider: 'opencode',
                                configPath,
                                active: true
                            });
                            continue;
                        }
                        // Entries from the old `mode` map become primary agents.
                        if (content.mode && content.mode[name] && !content.agent?.[name] && !content.agents?.[name] && !canonical.mode) {
                            canonical.mode = 'primary';
                        }
                        agentMap.set(name, {
                            name,
                            ...canonical,
                            // `prompt` alias so older clients keep working; canonical is `system`.
                            prompt: canonical.system ?? canonical.prompt,
                            system: canonical.system ?? canonical.prompt,
                            permission: canonical.permissions,
                            permissions: canonical.permissions,
                            source: 'json',
                            sourceProvider: 'opencode',
                            configPath,
                            active: true
                        });
                    }
                }
            } catch (err) {
                console.error(`Failed to read agent config from ${configPath}:`, err.message);
            }
        }
    }

    if (activeOmoPath) {
        try {
            const rawText = fs.readFileSync(activeOmoPath, 'utf8');
            const content = configProviders.parseJsonText(rawText);
            const configAgents = content.agents || {};
            for (const [name, agentConfig] of Object.entries(configAgents)) {
                if (!agentMap.has(name)) {
                    const isObjEntry = !!agentConfig && typeof agentConfig === 'object' && !Array.isArray(agentConfig);
                    agentMap.set(name, {
                        name,
                        ...(isObjEntry ? agentConfig : { raw: agentConfig }),
                        permission: agentConfig.permission || agentConfig.permissions,
                        permissions: agentConfig.permission || agentConfig.permissions,
                        source: 'json',
                        sourceProvider: 'oh-my-openagent',
                        configPath: activeOmoPath,
                        active: true
                    });
                }
            }
        } catch (err) {
            console.error(`Failed to read OMO agent config from ${activeOmoPath}:`, err.message);
        }
    }

    for (const dir of agentDirs) {
        if (!fs.existsSync(dir)) continue;
        const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
        files.forEach((file) => {
            const fp = path.join(dir, file);
            const content = fs.readFileSync(fp, 'utf8');
            const { data, body } = parseAgentMarkdown(content);
            const name = path.basename(file, '.md');

            if (!agentMap.has(name)) {
                // Normalize legacy frontmatter (disable->disabled, permission
                // map->permissions array, model+variant join, temp->request).
                // Scalar frontmatter (a bare string, not a map) has no fields.
                const frontmatter = (data && typeof data === 'object' && !Array.isArray(data)) ? data : {};
                const canonical = toCanonicalEntry(name, { ...frontmatter, prompt: undefined, system: undefined });
                // Files under a V1 mode/ directory represent primary agents.
                const fromModeDir = /[\\/]modes?[\\/]?$/.test(path.dirname(fp)) || /(^|[\\/])modes?[\\/]/.test(fp);
                agentMap.set(name, {
                    name,
                    path: fp,
                    disabled: canonical.disabled ?? frontmatter.disable ?? false,
                    description: frontmatter.description ?? canonical.description,
                    mode: frontmatter.mode || canonical.mode || (fromModeDir ? 'primary' : undefined),
                    model: frontmatter.model && frontmatter.variant ? joinModelVariant(frontmatter.model, frontmatter.variant) : (frontmatter.model ?? canonical.model),
                    system: body,
                    permissions: canonical.permissions ?? (frontmatter.permission ? permissionMapToRules(frontmatter.permission) : undefined),
                    permission: canonical.permissions ?? (frontmatter.permission ? permissionMapToRules(frontmatter.permission) : undefined),
                    steps: frontmatter.steps ?? frontmatter.maxSteps ?? canonical.steps,
                    hidden: frontmatter.hidden ?? canonical.hidden,
                    color: frontmatter.color ?? canonical.color,
                    request: canonical.request,
                    prompt: body,
                    system: body,
                    source: 'markdown',
                    configPath: fp,
                    active: true
                });
            }
        });
    }

    // Built-in fallback policies mirror the documented V2 defaults
    // (base policy + per-agent additions). V2 has no built-in `scout` agent;
    // doom_loop/lsp are not V2 permission actions.
    [
        {
            name: 'build',
            mode: 'primary',
            description: 'Default primary agent with all tools enabled for development work.',
            permission: { '*': 'allow', external_directory: 'ask', read: { '*.env': 'ask', '*.env.*': 'ask', '*.env.example': 'allow' }, question: 'allow' },
        },
        {
            name: 'plan',
            mode: 'primary',
            description: 'Restricted agent for planning and analysis. File edits and shell require approval by default.',
            permission: {
                '*': 'allow',
                external_directory: 'ask',
                read: { '*.env': 'ask', '*.env.*': 'ask', '*.env.example': 'allow' },
                edit: { '*': 'deny', '~/.opencode/plan/**': 'allow' },
                shell: 'ask',
                question: 'allow',
            },
        },
        {
            name: 'general',
            mode: 'subagent',
            description: 'General-purpose agent for researching complex questions and executing multi-step tasks. Cannot ask questions or launch subagents.',
            permission: {
                '*': 'allow',
                external_directory: 'ask',
                read: { '*.env': 'ask', '*.env.*': 'ask', '*.env.example': 'allow' },
                question: 'deny',
                subagent: 'deny',
            },
        },
        {
            name: 'explore',
            mode: 'subagent',
            description: 'Fast, read-only agent for exploring codebases. Cannot modify files.',
            permission: {
                '*': 'deny',
                external_directory: 'ask',
                read: { '*': 'allow', '*.env': 'ask', '*.env.*': 'ask', '*.env.example': 'allow' },
                glob: 'allow',
                grep: 'allow',
                webfetch: 'allow',
                websearch: 'allow',
            },
        },
    ].forEach(({ name, mode, description, permission }) => {
        if (!agentMap.has(name)) {
            const rules = permissionMapToRules(permission);
            agentMap.set(name, {
                name,
                source: 'builtin',
                mode,
                description,
                permission: rules,
                permissions: rules,
                active: true,
                disabled: false,
            });
        }
    });

    return Array.from(agentMap.values());
};

module.exports = { aggregateAgents, parseAgentMarkdown, buildAgentMarkdown };
