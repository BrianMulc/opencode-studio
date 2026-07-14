const fs = require('fs');
const path = require('path');

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

        // Check if this primary agent has task permission (can delegate)
        const perm = primary.permission || primary.permissions || {};
        const taskPerm = perm.task;
        const canDelegate = taskPerm === 'allow' || (typeof taskPerm === 'object' && taskPerm['*'] === 'allow');
        if (!canDelegate) continue;

        for (const sub of subAgents) {
            // If the primary explicitly denied this subagent, no violation
            if (typeof taskPerm === 'object' && taskPerm[sub.name] === 'deny') continue;

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
// This plugin hooks into tool.execute.before and blocks local→cloud delegation at runtime.
function generateGuardrailPlugin(policy) {
    const localProviders = JSON.stringify([...(policy.localProviders || DEFAULT_LOCAL_PROVIDERS), ...(policy.customLocalProviders || [])]);
    const cloudProviders = JSON.stringify([...(policy.cloudProviders || DEFAULT_CLOUD_PROVIDERS), ...(policy.customCloudProviders || [])]);

    return `// Auto-generated by OpenCode Studio - Delegation Guard Plugin
// Prevents local models from delegating to cloud models (data exfiltration prevention)
// DO NOT EDIT - re-generated when model policy is updated in OpenCode Studio
const LOCAL_PROVIDERS = ${localProviders};
const CLOUD_PROVIDERS = ${cloudProviders};

function extractProvider(modelString) {
  if (!modelString || typeof modelString !== 'string') return null;
  const parts = modelString.split('/');
  return parts.length > 1 ? parts[0] : modelString;
}

function isLocalByBaseUrl(providerConfig) {
  if (!providerConfig) return false;
  const url = providerConfig.baseUrl || providerConfig.base_url || providerConfig.url || '';
  if (!url) return false;
  return /https?:\\/+\\/(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\])/i.test(url);
}

function classifyModel(modelString, providersConfig) {
  const provider = extractProvider(modelString);
  if (!provider) return 'cloud';
  if (LOCAL_PROVIDERS.includes(provider)) return 'local';
  if (CLOUD_PROVIDERS.includes(provider)) return 'cloud';
  if (providersConfig && providersConfig[provider] && isLocalByBaseUrl(providersConfig[provider])) return 'local';
  return 'cloud';
}

export const DelegationGuardPlugin = async ({ project, client, $, directory, worktree }) => {
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');

  // Load opencode config to get agent model mappings and provider configs
  function loadConfig() {
    const home = os.homedir();
    const candidates = [
      path.join(home, '.config', 'opencode', 'opencode.json'),
      path.join(home, '.config', 'opencode', 'opencode.jsonc'),
      path.join(home, '.local', 'share', 'opencode', 'opencode.json'),
      path.join(home, '.opencode', 'opencode.json'),
    ];
    if (process.platform === 'win32' && process.env.APPDATA) {
      candidates.push(path.join(process.env.APPDATA, 'opencode', 'opencode.json'));
    }
    // Also check project-local config
    if (directory) {
      candidates.unshift(path.join(directory, 'opencode.json'));
      candidates.unshift(path.join(directory, '.opencode', 'opencode.json'));
    }
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8');
          return JSON.parse(raw.replace(/\\/\\/.*$/gm, '').replace(/\\/\\*[\\s\\S]*?\\*\\//g, ''));
        }
      } catch {}
    }
    return {};
  }

  function getAgentModelMap(config) {
    const agents = {};
    // From agent config
    if (config.agent) {
      for (const [name, agentConfig] of Object.entries(config.agent)) {
        agents[name] = agentConfig.model || null;
      }
    }
    // Built-in defaults
    if (!agents['build']) agents['build'] = config.model?.default || null;
    // From model policy config
    if (config.modelPolicy && config.modelPolicy.agentModels) {
      Object.assign(agents, config.modelPolicy.agentModels);
    }
    return agents;
  }

  function getProvidersConfig(config) {
    if (config.model && config.model.providers) return config.model.providers;
    if (config.providers) return config.providers;
    if (config.provider) return config.provider;
    return {};
  }

  return {
    event: async ({ event }) => {
      if (event.type !== 'tool.execute.before') return;
      if (event.tool.name !== 'task') return;

      const config = loadConfig();
      const providersConfig = getProvidersConfig(config);
      const agentModels = getAgentModelMap(config);

      // Determine the current agent (the one doing the delegating)
      const currentAgentName = event.metadata?.agent || event.session?.agent || event.agent || 'build';
      const currentModel = agentModels[currentAgentName] || config.model?.default || null;
      const currentClass = classifyModel(currentModel, providersConfig);

      // Determine the target subagent
      const input = event.tool.input || {};
      const targetAgent = input.subagent_type || input.agent || input.type || input.subagent || 'general';
      const targetModel = agentModels[targetAgent] || null;
      const targetClass = classifyModel(targetModel, providersConfig);

      // Zero data crossover: local can only delegate to local, cloud can only delegate to cloud
      if (currentClass !== targetClass) {
        const reason = 'BLOCKED: Agent ' + currentAgentName + ' is using a ' + currentClass + ' model (' + (currentModel || 'default') + ') and cannot delegate to agent ' + targetAgent + ' which uses a ' + targetClass + ' model (' + (targetModel || 'default') + '). This prevents data crossover between local and cloud models. To change this, update the model policy in OpenCode Studio settings.';
        console.error('[DelegationGuard]', reason);
        return { abort: true, reason };
      }
    },
  };
};
`;

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
