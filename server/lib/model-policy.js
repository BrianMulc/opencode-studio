const fs = require('fs');
const path = require('path');
const configProviders = require('./config-providers');

// Providers that are known to be local (data never leaves the machine).
// Users can override this list via the modelPolicy config in opencode.json.
const DEFAULT_LOCAL_PROVIDERS = [
    'ollama',
    'lmstudio',
    'lm-studio',
    'local',
    'vllm',
    'llama-cpp',
    'koboldcpp',
    'text-generation-webui',
    'oobabooga',
    'gpt4all',
    'llamacpp',
    'mlx',
    'custom-local',
];

// Providers that are known to be cloud (data is sent to an external API).
const DEFAULT_CLOUD_PROVIDERS = [
    'openai',
    'anthropic',
    'google',
    'gemini',
    'claude',
    'xai',
    'grok',
    'openrouter',
    'together',
    'mistral',
    'deepseek',
    'amazon-bedrock',
    'bedrock',
    'azure',
    'azure-openai',
    'github-copilot',
    'copilot',
    'groq',
    'fireworks',
    'anyscale',
    'perplexity',
    'cohere',
    'ai21',
    'replicate',
    'huggingface',
    'opencode',
    'antigravity',
];

// Heuristic: if a provider config has a baseUrl/base_url pointing at localhost or 127.0.0.1,
// it's almost certainly a local model regardless of the provider name.
function isLocalByBaseUrl(providerConfig) {
    if (!providerConfig) return false;
    const url = providerConfig.baseUrl || providerConfig.base_url || providerConfig.url || '';
    if (!url) return false;
    return /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(url);
}

// Extract the provider name from a model string like "ollama/llama3" or "anthropic/claude-sonnet-4".
// If there's no slash, the whole string is the provider (e.g. for built-in providers).
function extractProvider(modelString) {
    if (!modelString || typeof modelString !== 'string') return null;
    const parts = modelString.split('/');
    return parts.length > 1 ? parts[0] : modelString;
}

// Classify a model as 'local' or 'cloud' based on the policy config and provider heuristics.
function classifyModel(modelString, policy = {}, providersConfig = {}) {
    const provider = extractProvider(modelString);
    if (!provider) return 'cloud'; // unknown = treat as cloud for safety

    const localProviders = policy.localProviders || DEFAULT_LOCAL_PROVIDERS;
    const cloudProviders = policy.cloudProviders || DEFAULT_CLOUD_PROVIDERS;
    const customLocalProviders = policy.customLocalProviders || [];
    const customCloudProviders = policy.customCloudProviders || [];

    // User overrides take highest priority
    if (customLocalProviders.includes(provider)) return 'local';
    if (customCloudProviders.includes(provider)) return 'cloud';

    // Check baseUrl heuristic
    const providerConfig = providersConfig[provider];
    if (isLocalByBaseUrl(providerConfig)) return 'local';

    // Check default lists
    if (localProviders.includes(provider)) return 'local';
    if (cloudProviders.includes(provider)) return 'cloud';

    // If the provider is in the opencode provider config with a local URL, treat as local
    if (providerConfig && isLocalByBaseUrl(providerConfig)) return 'local';

    // Unknown provider = treat as cloud for safety (fail-safe)
    return 'cloud';
}

// The core rule: zero data crossover between local and cloud.
// Local can only delegate to local. Cloud can only delegate to cloud.
function isDelegationAllowed(sourceClassification, targetClassification) {
    return sourceClassification === targetClassification;
}

// Validate all agents against the delegation policy.
// Returns an array of violations: { primaryAgent, primaryModel, primaryClass, subagent, subagentModel, subagentClass }
function validateDelegationPolicy(agents, policy, providersConfig) {
    const violations = [];

    const primaryAgents = agents.filter(a => a.mode === 'primary' && !a.disabled);
    const subAgents = agents.filter(a => a.mode === 'subagent' && !a.disabled);

    for (const primary of primaryAgents) {
        const primaryClass = classifyModel(primary.model, policy, providersConfig);

        // Check if this primary agent has delegation permission (can launch subagents).
        // V1 map form uses `task`; V2 uses `subagent` (map or ordered array).
        const perm = primary.permission || primary.permissions || {};
        let taskPerm;
        let canDelegate = false;
        let denySet = new Set();
        if (Array.isArray(perm)) {
            // V2 ordered array: last matching subagent rule decides.
            let last = undefined;
            for (const rule of perm) {
                if (!rule || typeof rule !== 'object') continue;
                const action = rule.action === 'task' ? 'subagent' : rule.action;
                if (action !== 'subagent' && action !== '*') continue;
                if (rule.resource === '*' || rule.resource === undefined) last = rule.effect;
            }
            canDelegate = last === 'allow' || last === 'ask';
            if (last === 'deny') continue;
            for (const rule of perm) {
                if (rule && (rule.action === 'subagent' || rule.action === 'task') && rule.effect === 'deny' && rule.resource && rule.resource !== '*') {
                    denySet.add(rule.resource);
                }
            }
        } else {
            taskPerm = perm.subagent ?? perm.task;
            canDelegate = taskPerm === 'allow' || taskPerm === 'ask' || (typeof taskPerm === 'object' && (taskPerm['*'] === 'allow' || taskPerm['*'] === 'ask'));
            if (!canDelegate) continue;
        }
        void taskPerm;

        for (const sub of subAgents) {
            // If the primary explicitly denied this subagent, no violation
            if (denySet.has(sub.name)) continue;
            if (!Array.isArray(perm) && typeof (perm.subagent ?? perm.task) === 'object' && (perm.subagent ?? perm.task)[sub.name] === 'deny') continue;

            const subClass = classifyModel(sub.model, policy, providersConfig);
            if (!isDelegationAllowed(primaryClass, subClass)) {
                violations.push({
                    primaryAgent: primary.name,
                    primaryModel: primary.model || '(default)',
                    primaryClass,
                    subagent: sub.name,
                    subagentModel: sub.model || '(default)',
                    subagentClass: subClass,
                });
            }
        }
    }

    return violations;
}

// Generate the guardrail plugin code that gets installed into the user's plugin directory.
// This plugin hooks into tool execution and blocks local<->cloud delegation at runtime.
//
// Version-matched output (v2 primary, v1 fallback):
// - v2: default export via Plugin.define({ id, setup }) registering
//   ctx.tool.hook("execute.before") for the `subagent` tool.
// - v1: named async function export returning a {"tool.execute.before"} hook
//   for the legacy `task` tool.
// Both variants watch `task` and `subagent` tool names so mixed setups stay covered.
function generateGuardrailPlugin(policy, { target } = {}) {
    const shape = target === 'v1' || target === 'v2' ? target : 'v2';
    const localProviders = JSON.stringify([...(policy.localProviders || DEFAULT_LOCAL_PROVIDERS), ...(policy.customLocalProviders || [])]);
    const cloudProviders = JSON.stringify([...(policy.cloudProviders || DEFAULT_CLOUD_PROVIDERS), ...(policy.customCloudProviders || [])]);

    const sharedHelpers = [
        '// Auto-generated by OpenCode Studio - Delegation Guard Plugin',
        '// Prevents local models from delegating to cloud models (data exfiltration prevention)',
        '// DO NOT EDIT - re-generated when model policy is updated in OpenCode Studio',
        'const LOCAL_PROVIDERS = ' + localProviders + ';',
        'const CLOUD_PROVIDERS = ' + cloudProviders + ';',
        '',
        'function extractProvider(modelString) {',
        "  if (!modelString || typeof modelString !== 'string') return null;",
        "  const hash = String(modelString).indexOf('#');",
        "  const clean = hash >= 0 ? String(modelString).slice(0, hash) : String(modelString);",
        "  const parts = clean.split('/');",
        "  return parts.length > 1 ? parts[0] : modelString;",
        '}',
        '',
        'function isLocalByBaseUrl(providerConfig) {',
        '  if (!providerConfig) return false;',
        "  const url = providerConfig.baseUrl || providerConfig.base_url || providerConfig.url || '';",
        '  if (!url) return false;',
        '  return new RegExp("https?://(localhost|127.0.0.1|0.0.0.0|\\[::1\\])", "i").test(url);',
        '}',
        '',
        'function classifyModel(modelString, providersConfig) {',
        '  const provider = extractProvider(modelString);',
        "  if (!provider) return 'cloud';",
        '  if (LOCAL_PROVIDERS.includes(provider)) return ' + "'local';",
        '  if (CLOUD_PROVIDERS.includes(provider)) return ' + "'cloud';",
        '  if (providersConfig && providersConfig[provider] && isLocalByBaseUrl(providersConfig[provider])) return ' + "'local';",
        "  return 'cloud';",
        '}',
        '',
        'function readJsonConfig(fs, p) {',
        '  try {',
        '    if (!fs.existsSync(p)) return null;',
        '    const text = fs.readFileSync(p, ' + "'utf8'" + ');',
        '    try { return JSON.parse(text); } catch (e) {}',
        '    // Tolerate JSONC (whole-line // comments only — never touch URLs in strings).',
        "    const stripped = text.split('\\n').filter((l) => l.trim().indexOf('//') !== 0).join('\\n');",
        '    return JSON.parse(stripped);',
        '  } catch (e) { return null; }',
        '}',
        '',
        'function loadAppConfig(fs, path, os, directory) {',
        '  const home = os.homedir();',
        '  const candidates = [',
        "    path.join(home, '.config', 'opencode', 'opencode.json'),",
        "    path.join(home, '.config', 'opencode', 'opencode.jsonc'),",
        "    path.join(home, '.local', 'share', 'opencode', 'opencode.json'),",
        "    path.join(home, '.opencode', 'opencode.json'),",
        '  ];',
        "  try { if (typeof process !== 'undefined' && process.platform === 'win32' && process.env.APPDATA) { candidates.push(path.join(process.env.APPDATA, 'opencode', 'opencode.json')); } } catch (e) {}",
        "  if (directory) { candidates.unshift(path.join(directory, 'opencode.json')); candidates.unshift(path.join(directory, '.opencode', 'opencode.json')); }",
        '  for (const p of candidates) { const c = readJsonConfig(fs, p); if (c) return c; }',
        '  return {};',
        '}',
        '',
        'function getAgentModelMap(config) {',
        '  const agents = {};',
        '  const merged = { ...((config && config.mode) || {}), ...((config && config.agent) || {}), ...((config && config.agents) || {}) };',
        '  for (const [name, agentConfig] of Object.entries(merged)) {',
        '    if (agentConfig && agentConfig.model) agents[name] = agentConfig.model;',
        '  }',
        "  if (!agents['build']) agents['build'] = (config.model && config.model.default) || null;",
        '  if (config.modelPolicy && config.modelPolicy.agentModels) Object.assign(agents, config.modelPolicy.agentModels);',
        '  return agents;',
        '}',
        '',
        'function getProvidersConfig(config) {',
        '  if (config.providers) return config.providers;',
        '  if (config.provider) return config.provider;',
        '  if (config.model && config.model.providers) return config.model.providers;',
        '  return {};',
        '}',
        '',
        'function checkDelegation(eventLike, deps) {',
        '  const config = loadAppConfig(deps.fs, deps.path, deps.os, deps.directory);',
        '  const providersConfig = getProvidersConfig(config);',
        '  const agentModels = getAgentModelMap(config);',
        "  const currentAgentName = (eventLike.metadata && eventLike.metadata.agent) || (eventLike.session && eventLike.session.agent) || eventLike.agent || 'build';",
        '  const currentModel = agentModels[currentAgentName] || (config.model && config.model.default) || null;',
        '  const currentClass = classifyModel(currentModel, providersConfig);',
        '  const input = eventLike.input || {};',
        "  const targetAgent = input.subagent_type || input.agent || input.type || input.subagent || 'general';",
        '  const targetModel = agentModels[targetAgent] || null;',
        '  const targetClass = classifyModel(targetModel, providersConfig);',
        '  if (currentClass !== targetClass) {',
        "    return 'BLOCKED: Agent ' + currentAgentName + ' is using a ' + currentClass + ' model (' + (currentModel || 'default') + ') and cannot delegate to agent ' + targetAgent + ' which uses a ' + targetClass + ' model (' + (targetModel || 'default') + '). This prevents data crossover between local and cloud models. To change this, update the model policy in OpenCode Studio settings.';",
        '  }',
        '  return null;',
        '}',
        '',
    ].join('\n');

    if (shape === 'v1') {
        return sharedHelpers + [
            'export const DelegationGuardPlugin = async ({ directory } = {}) => {',
            "  const fs = await import('fs');",
            "  const path = await import('path');",
            "  const os = await import('os');",
            '  return {',
            "    event: async ({ event }) => {",
            "      if (event.type !== 'tool.execute.before') return;",
            '      const toolName = event.tool && (event.tool.name || event.tool);',
            "      if (toolName !== 'task' && toolName !== 'subagent') return;",
            '      const reason = checkDelegation({ metadata: event.metadata, session: event.session, agent: event.agent, input: (event.tool && event.tool.input) || {} }, { fs, path, os, directory });',
            '      if (reason) {',
            "        if (typeof console !== 'undefined' && console.error) console.error('[DelegationGuard]', reason);",
            '        return { abort: true, reason };',
            '      }',
            '    },',
            '  };',
            '};',
            '',
        ].join('\n');
    }

    return sharedHelpers + [
        'import { Plugin } from "@opencode/plugin";',
        '',
        'export default Plugin.define({',
        '  id: "studio.delegation-guard",',
        '  async setup(ctx) {',
        '    await ctx.tool.hook("execute.before", async (event) => {',
        '      if (event.tool !== "subagent" && event.tool !== "task") return;',
        '      const fs = await import("node:fs");',
        '      const path = await import("node:path");',
        '      const os = await import("node:os");',
        '      const reason = checkDelegation(',
        '        { metadata: event.metadata, session: event.session, agent: event.agent, input: event.input || {} },',
        '        { fs: fs.default || fs, path: path.default || path, os: os.default || os, directory: ctx.location && ctx.location.directory }',
        '      );',
        '      if (reason) throw new Error(reason);',
        '    });',
        '  },',
        '});',
        '',
    ].join('\n');
}

module.exports = {
    DEFAULT_LOCAL_PROVIDERS,
    DEFAULT_CLOUD_PROVIDERS,
    extractProvider,
    isLocalByBaseUrl,
    classifyModel,
    isDelegationAllowed,
    validateDelegationPolicy,
    generateGuardrailPlugin,
};
