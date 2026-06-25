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
        const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
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

    for (const root of roots) {
        const configPath = path.join(root, 'opencode.json');
        if (fs.existsSync(configPath)) {
            try {
                const content = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const configAgents = content.agent || {};
                for (const [name, agentConfig] of Object.entries(configAgents)) {
                    if (!agentMap.has(name)) {
                        agentMap.set(name, {
                            name,
                            ...agentConfig,
                            permission: agentConfig.permission || agentConfig.permissions,
                            permissions: agentConfig.permission || agentConfig.permissions,
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
                    agentMap.set(name, {
                        name,
                        ...agentConfig,
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
                agentMap.set(name, {
                    name,
                    path: fp,
                    disabled: false,
                    description: data.description,
                    mode: data.mode,
                    model: data.model,
                    temperature: data.temperature,
                    tools: data.tools,
                    permission: data.permission,
                    permissions: data.permission,
                    steps: data.steps ?? data.maxSteps,
                    maxSteps: data.maxSteps,
                    disable: data.disable,
                    hidden: data.hidden,
                    prompt: body,
                    source: 'markdown',
                    configPath: fp,
                    active: true
                });
            }
        });
    }

    [
        {
            name: 'build',
            mode: 'primary',
            description: 'Default primary agent with all tools enabled for development work.',
            permission: { '*': 'allow', doom_loop: 'ask', question: 'allow' },
        },
        {
            name: 'plan',
            mode: 'primary',
            description: 'Restricted agent for planning and analysis. File edits and bash require approval by default.',
            permission: {
                '*': 'allow',
                edit: { '*': 'deny' },
                bash: 'ask',
                todowrite: 'ask',
                task: { general: 'deny' },
                question: 'allow',
                doom_loop: 'ask',
            },
        },
        {
            name: 'general',
            mode: 'subagent',
            description: 'General-purpose agent for researching complex questions and executing multi-step tasks. Full tool access except todo.',
            permission: { '*': 'allow', todowrite: 'deny', doom_loop: 'ask' },
        },
        {
            name: 'explore',
            mode: 'subagent',
            description: 'Fast, read-only agent for exploring codebases. Cannot modify files.',
            permission: {
                '*': 'deny',
                read: 'allow',
                glob: 'allow',
                grep: 'allow',
                list: 'allow',
                lsp: 'allow',
                task: 'allow',
                doom_loop: 'ask',
            },
        },
        {
            name: 'scout',
            mode: 'subagent',
            description: 'Read-only agent for external docs and dependency research. Clones dependency repos into a managed cache.',
            permission: {
                '*': 'deny',
                read: 'allow',
                glob: 'allow',
                grep: 'allow',
                list: 'allow',
                bash: 'allow',
                webfetch: 'allow',
                websearch: 'allow',
                task: 'allow',
                doom_loop: 'ask',
            },
        },
    ].forEach(({ name, mode, description, permission }) => {
        if (!agentMap.has(name)) {
            agentMap.set(name, {
                name,
                source: 'builtin',
                mode,
                description,
                permission,
                permissions: permission,
                active: true,
                disabled: false,
            });
        }
    });

    return Array.from(agentMap.values());
};

module.exports = { aggregateAgents, parseAgentMarkdown, buildAgentMarkdown };
