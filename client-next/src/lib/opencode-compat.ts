// Frontend dual-shape helpers: OpenCode v2 primary, v1 fallback.
// The Studio server speaks canonical V2 on the wire, but configs loaded from
// profiles, backups, or older servers may still use V1 shapes. These helpers
// read either shape so the UI never breaks on legacy data.

import type {
  AgentConfig,
  CommandConfig,
  MCPConfig,
  OpencodeConfig,
  PermissionConfig,
  PermissionEntry,
  PermissionRule,
  ProviderConfig,
} from '@/types';

export const V1_TO_V2_ACTION: Record<string, string> = {
  bash: 'shell',
  task: 'subagent',
  write: 'edit',
  patch: 'edit',
};

export const V2_TO_V1_ACTION: Record<string, string> = {
  shell: 'bash',
  subagent: 'task',
};

export function v1ActionToV2(action: string): string {
  return V1_TO_V2_ACTION[action] ?? action;
}

// --- Permissions ---

function permissionMapToRules(map: PermissionConfig | undefined): PermissionRule[] {
  const rules: PermissionRule[] = [];
  if (!map || typeof map !== 'object' || Array.isArray(map)) return rules;
  for (const [rawAction, value] of Object.entries(map)) {
    const action = v1ActionToV2(rawAction);
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') {
      rules.push({ action, resource: '*', effect: value });
      continue;
    }
    if (Array.isArray(value)) continue;
    if (typeof value === 'object') {
      const v = value as Record<string, unknown> & { allow?: string[]; deny?: string[] };
      const keys = Object.keys(value);
      if (keys.every((k) => k === 'allow' || k === 'deny')) {
        for (const p of v.allow ?? []) rules.push({ action, resource: p, effect: 'allow' });
        for (const p of v.deny ?? []) rules.push({ action, resource: p, effect: 'deny' });
        continue;
      }
      for (const [resource, effect] of Object.entries(value)) {
        if (typeof effect === 'string') rules.push({ action, resource, effect: effect as PermissionRule['effect'] });
      }
    }
  }
  return rules;
}

function toolsMapToRules(tools: Record<string, boolean> | undefined): PermissionRule[] {
  if (!tools || typeof tools !== 'object') return [];
  return Object.entries(tools)
    .filter(([, enabled]) => enabled === false)
    .map(([tool]) => ({ action: v1ActionToV2(tool), resource: '*', effect: 'deny' as const }));
}

/** Ordered V2 rules from either shape (legacy first, native last = native wins). */
export function getPermissionRules(config: OpencodeConfig | AgentConfig | undefined | null): PermissionRule[] {
  if (!config || typeof config !== 'object') return [];
  const out: PermissionRule[] = [];
  const legacy = (config as { permission?: PermissionConfig }).permission;
  out.push(...permissionMapToRules(legacy));
  const cfg = config as { tools?: Record<string, boolean> };
  out.push(...toolsMapToRules(cfg.tools));
  const native = (config as { permissions?: PermissionConfig | PermissionRule[] }).permissions;
  if (Array.isArray(native)) {
    for (const r of native) {
      if (r && typeof r === 'object' && 'action' in r && 'effect' in r) {
        out.push({ action: v1ActionToV2((r as PermissionRule).action), resource: (r as PermissionRule).resource ?? '*', effect: (r as PermissionRule).effect });
      }
    }
  } else {
    out.push(...permissionMapToRules(native as PermissionConfig));
  }
  return out;
}

/** Permission map merged from either shape (for the legacy map editor). */
export function getPermissionMap(config: OpencodeConfig | AgentConfig | undefined | null): PermissionConfig {
  const map: PermissionConfig = {};
  for (const rule of getPermissionRules(config)) {
    const action = rule.action;
    if (rule.resource === '*') {
      (map as Record<string, PermissionEntry>)[action] = rule.effect;
      continue;
    }
    const existing = (map as Record<string, PermissionEntry>)[action];
    if (typeof existing === 'string') {
      (map as Record<string, PermissionEntry>)[action] = { '*': existing, [rule.resource]: rule.effect } as PermissionEntry;
    } else if (existing && typeof existing === 'object' && !Array.isArray(existing) && !('allow' in existing)) {
      (existing as Record<string, string>)[rule.resource] = rule.effect;
    } else if (!existing) {
      (map as Record<string, PermissionEntry>)[action] = { [rule.resource]: rule.effect } as PermissionEntry;
    }
  }
  return map;
}

// --- MCP ---

export function isMcpEnabled(entry: MCPConfig | undefined | null): boolean {
  if (!entry) return false;
  if (entry.enabled !== undefined) return entry.enabled;
  return !entry.disabled;
}

export function withMcpEnabled(entry: MCPConfig, enabled: boolean): MCPConfig {
  return { ...entry, enabled, disabled: !enabled };
}

/** Server map from V2 `mcp.servers` or V1 flat `mcp` (V2 wins on conflicts). */
export function getMcpServers(config: OpencodeConfig | undefined | null): Record<string, MCPConfig> {
  const mcp = config?.mcp;
  if (!mcp || typeof mcp !== 'object') return {};
  const out: Record<string, MCPConfig> = {};
  for (const [name, entry] of Object.entries(mcp)) {
    if (name === 'servers' || name === 'timeout') continue;
    // Flat V1 server entries are always objects; unknown scalar keys
    // (future flags, etc.) are preserved, not treated as servers.
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    out[name] = entry as MCPConfig;
  }
  if (mcp.servers && typeof mcp.servers === 'object') {
    for (const [name, entry] of Object.entries(mcp.servers)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      out[name] = { ...(out[name] ?? {}), ...(entry as MCPConfig) };
    }
  }
  return out;
}

export function setMcpServers(config: OpencodeConfig, servers: Record<string, MCPConfig>): OpencodeConfig {
  const mcp = { ...(config.mcp ?? {}) } as Record<string, unknown>;
  if (mcp.servers && typeof mcp.servers === 'object') {
    return { ...config, mcp: { ...mcp, servers } as OpencodeConfig['mcp'] };
  }
  // Preserve whichever shape the config already uses; default to flat (server normalizes on write).
  const hasServers = !!(config.mcp as { servers?: unknown })?.servers;
  if (hasServers) {
    return { ...config, mcp: { ...(config.mcp ?? {}), servers } as OpencodeConfig['mcp'] };
  }
  const next = { ...(config.mcp ?? {}) } as Record<string, unknown>;
  for (const k of Object.keys(next)) {
    if (k !== 'servers' && k !== 'timeout') delete next[k];
  }
  return { ...config, mcp: { ...next, ...servers } as OpencodeConfig['mcp'] };
}

export function getMcpTimeout(entry: MCPConfig | undefined | null): number | undefined {
  const t = entry?.timeout;
  if (typeof t === 'number') return t;
  if (t && typeof t === 'object') return t.catalog ?? t.execution ?? t.startup;
  return undefined;
}

// --- Providers ---

export function getProviders(config: OpencodeConfig | undefined | null): Record<string, ProviderConfig> {
  if (!config) return {};
  const out: Record<string, ProviderConfig> = {};
  if (config.provider) Object.assign(out, config.provider);
  if (config.providers) Object.assign(out, config.providers);
  return out;
}

export function getProviderApiKey(p: ProviderConfig | undefined | null): string {
  return p?.settings?.apiKey ?? p?.options?.apiKey ?? '';
}

export function getProviderBaseURL(p: ProviderConfig | undefined | null): string {
  const s = p?.settings as Record<string, unknown> | undefined;
  return (s?.baseURL as string) ?? p?.options?.baseURL ?? p?.api ?? '';
}

export function getProviderPackage(p: ProviderConfig | undefined | null): string {
  return p?.package ?? p?.npm ?? '';
}

// --- Agents / commands ---

export function getAgents(config: OpencodeConfig | undefined | null): Record<string, AgentConfig> {
  if (!config) return {};
  const out: Record<string, AgentConfig> = {};
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const mode = (config as { mode?: Record<string, AgentConfig> }).mode;
  // Malformed (non-object) entries pass through verbatim — never spread them.
  if (mode) for (const [k, v] of Object.entries(mode)) out[k] = isObj(v) ? { ...(out[k] ?? {}), ...v, mode: 'primary' as const } : v;
  if (config.agent) for (const [k, v] of Object.entries(config.agent as Record<string, AgentConfig>)) out[k] = isObj(v) ? { ...(out[k] ?? {}), ...v } : v;
  if (config.agents) Object.assign(out, config.agents);
  return out;
}

export function getAgentSystem(a: AgentConfig | undefined | null): string {
  return a?.system ?? a?.prompt ?? '';
}

export function isAgentDisabled(a: AgentConfig | undefined | null): boolean {
  return !!(a?.disabled ?? a?.disable);
}

export function splitModelVariant(model: string | undefined): { model: string; variant: string } {
  if (!model) return { model: '', variant: '' };
  const idx = model.indexOf('#');
  if (idx < 0) return { model, variant: '' };
  return { model: model.slice(0, idx), variant: model.slice(idx + 1) };
}

export function joinModelVariant(model: string, variant: string): string {
  if (!model || !variant || model.includes('#')) return model;
  return `${model}#${variant}`;
}

export function getCommands(config: OpencodeConfig | undefined | null): Record<string, CommandConfig> {
  if (!config) return {};
  return { ...(config.command ?? {}), ...(config.commands ?? {}) };
}

export function isCommandSubagent(c: CommandConfig | undefined | null): boolean {
  return !!(c?.subagent ?? c?.subtask);
}

// --- Misc top-level ---

export function getUpdatePolicy(config: OpencodeConfig | undefined | null): 'disable' | 'notify' | 'auto' | undefined {
  if (!config) return undefined;
  if (config.update) return config.update;
  if (config.autoupdate === false) return 'disable';
  if (config.autoupdate === 'notify') return 'notify';
  if (config.autoupdate === true) return 'auto';
  return undefined;
}

export function getSnapshotsEnabled(config: OpencodeConfig | undefined | null): boolean | undefined {
  if (config?.snapshots !== undefined) return config.snapshots;
  if (config?.snapshot !== undefined) return config.snapshot;
  return undefined;
}

export function getSubagentDepth(config: OpencodeConfig | undefined | null): number | undefined {
  return config?.experimental?.subagent_depth ?? config?.subagent_depth;
}

export function getSkillsList(skills: OpencodeConfig['skills']): string[] {
  if (!skills) return [];
  if (Array.isArray(skills)) return skills;
  const paths = Array.isArray(skills.paths) ? skills.paths : [];
  const urls = Array.isArray(skills.urls) ? skills.urls : [];
  return [...paths, ...urls];
}

export function getPluginsList(config: OpencodeConfig | undefined | null): (string | { package: string; options?: unknown })[] {
  if (!config) return [];
  // Legacy `plugin` + native `plugins` may coexist; native wins on conflicts.
  const raw: unknown[] = [
    ...((Array.isArray(config.plugin) ? config.plugin : config.plugin !== undefined ? [config.plugin] : []) as unknown[]),
    ...((Array.isArray(config.plugins) ? config.plugins : config.plugins !== undefined ? [config.plugins] : []) as unknown[]),
  ];
  const seen = new Map<string, number>();
  const out: (string | { package: string; options?: unknown })[] = [];
  const push = (entry: unknown) => {
    let canonical: string | { package: string; options?: unknown };
    let id: string;
    if (typeof entry === 'string') { canonical = entry; id = `pkg:${entry}`; }
    else if (Array.isArray(entry)) {
      const [pkg, options] = entry as [string, unknown];
      canonical = options !== undefined ? { package: pkg, options } : pkg;
      id = typeof canonical === 'string' ? `pkg:${canonical}` : `pkg:${canonical.package}`;
    } else if (entry && typeof entry === 'object') {
      canonical = entry as { package: string; options?: unknown };
      id = `pkg:${canonical.package}`;
    } else { return; }
    if (seen.has(id)) { out[seen.get(id)!] = canonical; return; }
    seen.set(id, out.length);
    out.push(canonical);
  };
  raw.forEach(push);
  return out;
}

export function getCompactionKeepTokens(config: OpencodeConfig | undefined | null): number | undefined {
  return config?.compaction?.keep?.tokens ?? config?.compaction?.preserve_recent_tokens;
}

export function getCompactionBuffer(config: OpencodeConfig | undefined | null): number | undefined {
  return config?.compaction?.buffer ?? config?.compaction?.reserved;
}
