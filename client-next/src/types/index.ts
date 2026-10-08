export interface McpOAuthConfig {
  // V1 camelCase (fallback) + V2 snake_case (native). Both accepted on read.
  clientId?: string;
  clientSecret?: string;
  scope?: string;
  callbackPort?: number;
  redirectUri?: string;
  client_id?: string;
  client_secret?: string;
  callback_port?: number;
  redirect_uri?: string;
  auth_server_metadata_url?: string;
}

export interface McpTimeoutConfig {
  startup?: number;
  catalog?: number;
  execution?: number;
}

export interface MCPConfig {
  command?: string[];
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  // V1 `enabled` (fallback) + V2 `disabled` (native). Server sends both.
  enabled?: boolean;
  disabled?: boolean;
  type: 'local' | 'remote';
  timeout?: number | McpTimeoutConfig;
  cwd?: string;
  environment?: Record<string, string>;
  headers?: Record<string, string>;
  oauth?: McpOAuthConfig | false;
  codemode?: boolean;
  protocol?: 'legacy' | 'auto' | '2026-07-28';
}

export interface ModelAlias {
  provider: string;
  model: string;
}

export type PermissionValue = 'ask' | 'allow' | 'deny';

export type PermissionEntry =
  | PermissionValue
  | Record<string, PermissionValue>
  | { allow?: string[]; deny?: string[] };

// V2 native ordered permission rule.
export interface PermissionRule {
  action: string;
  resource: string;
  effect: PermissionValue;
}

export interface PermissionConfig {
  '*'?: PermissionValue;
  read?: PermissionEntry;
  edit?: PermissionEntry;
  glob?: PermissionEntry;
  grep?: PermissionEntry;
  list?: PermissionEntry;
  // V2 native actions:
  shell?: PermissionEntry;
  subagent?: PermissionEntry;
  // V1 fallbacks (renamed in V2: bash->shell, task->subagent):
  bash?: PermissionEntry;
  task?: PermissionEntry;
  // V1 aliases collapsed into `edit` in V2 (write/patch->edit):
  write?: PermissionEntry;
  patch?: PermissionEntry;
  skill?: PermissionEntry;
  lsp?: PermissionEntry;
  todoread?: PermissionValue;
  todowrite?: PermissionValue;
  webfetch?: PermissionValue;
  websearch?: PermissionValue;
  question?: PermissionValue;
  external_directory?: PermissionEntry;
  doom_loop?: PermissionValue;
  // V2 allows plugin-defined and per-MCP-server actions (<server>_<tool>).
  [tool: string]: PermissionEntry | PermissionValue | undefined;
}

export type PermissionToolKey = keyof PermissionConfig;

export interface AgentConfig {
  model?: string;
  // V1 fallbacks (folded into `model` as provider/model#variant in V2):
  variant?: string;
  temperature?: number;
  top_p?: number;
  options?: Record<string, unknown>;
  // V2 native system prompt (V1 JSON used `prompt`; markdown body works in both):
  system?: string;
  prompt?: string;
  tools?: Record<string, boolean>;
  permissions?: PermissionConfig | PermissionRule[];
  permission?: PermissionConfig | PermissionRule[];
  description?: string;
  color?: string;
  steps?: number;
  // V1 fallback (renamed to `steps` in V2):
  maxSteps?: number;
  mode?: 'subagent' | 'primary' | 'all';
  // V2 native (V1 used `disable`):
  disabled?: boolean;
  disable?: boolean;
  hidden?: boolean;
  // V2 per-agent request overlays (replaces top-level temperature/top_p/options):
  request?: {
    headers?: Record<string, string>;
    body?: Record<string, unknown>;
  };
}

export type AgentSource = 'json' | 'markdown' | 'builtin';

export interface AgentInfo extends AgentConfig {
  name: string;
  source: AgentSource;
  sourceProvider?: 'opencode' | 'oh-my-openagent';
  configPath?: string;
  active?: boolean;
  disabled?: boolean;
}

export interface AgentsResponse {
  agents: AgentInfo[];
}

export interface AgentsConfig {
  plan?: AgentConfig;
  build?: AgentConfig;
  general?: AgentConfig;
  explore?: AgentConfig;
  title?: AgentConfig;
  summary?: AgentConfig;
  compaction?: AgentConfig;
}

export interface ProviderOptions {
  apiKey?: string;
  baseURL?: string;
  enterpriseUrl?: string;
  setCacheKey?: boolean;
  timeout?: number | false;
  headerTimeout?: number | false;
  chunkTimeout?: number | false;
}

export interface ProviderModelConfig {
  // V2 native model ID sent to the provider (V1 used `id`):
  modelID?: string;
  id?: string;
  name?: string;
  family?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  temperature?: boolean;
  tool_call?: boolean;
  interleaved?: true | { field: 'reasoning' | 'reasoning_content' | 'reasoning_details' };
  limit?: {
    context?: number;
    input?: number;
    output?: number;
  };
  cost?: {
    input: number;
    output: number;
    cache_read?: number;
    cache_write?: number;
    cache?: { read?: number; write?: number };
  };
  modalities?: {
    input: string[];
    output: string[];
  };
  // V2 native capabilities (replaces tool_call/modalities):
  capabilities?: {
    tools?: boolean;
    input?: string[];
    output?: string[];
  };
  experimental?: boolean;
  status?: 'alpha' | 'beta' | 'deprecated' | 'active';
  disabled?: boolean;
  provider?: {
    npm?: string;
    api?: string;
  };
  // V1 object form { high: {...} } or V2 array form [{ id: 'high', ... }]:
  variants?: Record<string, ModelVariantConfig> | ModelVariantConfig[];
  headers?: Record<string, string>;
  // V2 native request settings (V1 used `options`):
  settings?: Record<string, unknown>;
  body?: Record<string, unknown>;
  options?: {
    thinkingConfig?: {
      thinkingLevel?: 'low' | 'medium' | 'high' | 'minimal';
      thinkingBudget?: number;
      includeThoughts?: boolean;
    };
  };
}

export interface ModelVariantConfig {
  id?: string;
  disabled?: boolean;
  reasoning?: boolean;
  settings?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  options?: {
    thinkingConfig?: {
      thinkingLevel?: 'low' | 'medium' | 'high' | 'minimal';
      thinkingBudget?: number;
      includeThoughts?: boolean;
    };
  };
}

export interface ProviderConfig {
  // V1 `api` -> V2 settings.baseURL; V1 `npm` -> V2 `package` (aisdk: prefix for AI SDK packages).
  api?: string;
  name?: string;
  env?: string[];
  id?: string;
  npm?: string;
  package?: string;
  canonical?: string;
  models?: Record<string, ProviderModelConfig>;
  whitelist?: string[];
  blacklist?: string[];
  options?: ProviderOptions;
  // V2 native request split:
  settings?: ProviderOptions & Record<string, unknown>;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
}

export type ConfigProviderId = 'opencode' | 'oh-my-openagent' | 'oh-my-opencode-slim';

export interface ConfigProviderDiagnosticDetails {
  path?: string | null;
  paths?: string[];
  expectedPaths?: string[];
  routeProvider?: string;
  payloadProvider?: string;
  [key: string]: unknown;
}

export interface ConfigProviderDiagnostic {
  severity: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  path?: string | null;
  details?: ConfigProviderDiagnosticDetails | string | null;
}

export interface ConfigProviderCapabilities {
  canDetect: boolean;
  canLoad: boolean;
  canValidate: boolean;
  canSave: boolean;
  canCreate: boolean;
  canImportConfig: boolean;
  canExportConfig: boolean;
}

export interface ConfigProviderSummary {
  id: ConfigProviderId;
  displayName: string;
  paths: string[];
  exists: boolean;
  activePath: string | null;
  capabilities: ConfigProviderCapabilities;
  diagnostics: ConfigProviderDiagnostic[];
}

export interface ConfigProviderDetail extends ConfigProviderSummary {
  config: Record<string, unknown> | null;
  raw: string | null;
  revision: ConfigProviderRevision | null;
}

export interface ConfigProviderProfile {
  name: string;
  path: string;
  active: boolean;
  revision: ConfigProviderRevision;
  diagnostics: ConfigProviderDiagnostic[];
}

export interface ConfigProviderProfilesResult {
  profileDir: string | null;
  activePath: string | null;
  profiles: ConfigProviderProfile[];
}

export interface ConfigProviderCreateProfilePayload {
  name: string;
  raw?: string;
}

export interface ConfigProviderCreateProfileResult {
  success: boolean;
  created: boolean;
  profile: ConfigProviderProfile;
  profiles: ConfigProviderProfile[];
  diagnostics?: ConfigProviderDiagnostic[];
}

export interface ConfigProviderSwitchProfilePayload {
  path?: string;
  name?: string;
}

export interface ConfigProviderSwitchProfileResult {
  success: boolean;
  path: string;
  selectedPath: string;
  revision: ConfigProviderRevision | null;
  diagnostics: ConfigProviderDiagnostic[];
  profiles: ConfigProviderProfile[];
}

export interface ConfigProviderRevision {
  algorithm: string;
  hash: string | null;
  size: number;
  mtimeMs: number | null;
}

export interface ConfigProviderContentPayload {
  raw?: string;
  config?: Record<string, unknown> | null;
  path?: string | null;
}

export interface ConfigProviderValidationPayload extends ConfigProviderContentPayload {}

export interface ConfigProviderValidationResult {
  valid: boolean;
  diagnostics: ConfigProviderDiagnostic[];
  config?: Record<string, unknown> | null;
}

export interface ConfigProviderSavePayload extends ConfigProviderContentPayload {
  expectedRevision?: string | ConfigProviderRevision | null;
}

export interface ConfigProviderSaveResult {
  success: boolean;
  id: ConfigProviderId;
  path: string;
  exists: boolean;
  diagnostics: ConfigProviderDiagnostic[];
}

export interface ConfigProviderCreatePayload {
  raw?: string;
  path?: string | null;
}

export interface ConfigProviderCreateResult {
  success: boolean;
  created: boolean;
  path: string;
  diagnostics?: ConfigProviderDiagnostic[];
}

export interface ConfigProviderImportPayload extends ConfigProviderContentPayload {
  id?: ConfigProviderId;
  providerId?: ConfigProviderId;
  provider?: ConfigProviderId;
}

export interface ConfigProviderImportResult {
  success: boolean;
  imported: boolean;
  path: string;
  diagnostics?: ConfigProviderDiagnostic[];
}

export interface ConfigProviderExportResult {
  id: ConfigProviderId;
  path: string | null;
  exists: boolean;
  raw: string | null;
  config: Record<string, unknown> | null;
  diagnostics: ConfigProviderDiagnostic[];
}

export interface TUIConfig {
  scroll_speed?: number;
  scroll_acceleration?: {
    enabled?: boolean;
  };
  diff_style?: 'auto' | 'stacked';
}

export interface KeybindsConfig {
  leader?: string;
  app_exit?: string;
  app_help?: string;
  editor_open?: string;
  session_new?: string;
  session_list?: string;
  session_compact?: string;
  session_interrupt?: string;
  history_prev?: string;
  history_next?: string;
  input_clear?: string;
  input_submit?: string;
  input_paste?: string;
  input_newline?: string;
  messages_scroll_up?: string;
  messages_scroll_down?: string;
  messages_page_up?: string;
  messages_page_down?: string;
  messages_home?: string;
  messages_end?: string;
  messages_copy_last?: string;
  messages_copy_last_code?: string;
  file_tree_toggle?: string;
  file_tree_open?: string;
  file_tree_expand?: string;
  file_tree_collapse?: string;
  file_tree_navigate_up?: string;
  file_tree_navigate_down?: string;
  diagnostics_toggle?: string;
  debug_toggle?: string;
  model_selector?: string;
  [key: string]: string | undefined;
}

export interface CompactionConfig {
  auto?: boolean;
  // V1 fallbacks (ignored with a warning in V2; use keep/buffer instead):
  prune?: boolean;
  reserved?: number;
  tail_turns?: number;
  preserve_recent_tokens?: number;
  // V2 native retained-context budget + reserve:
  keep?: { tokens?: number };
  buffer?: number;
}

export interface WatcherConfig {
  ignore?: string[];
}

export interface LSPConfig {
  [language: string]: {
    disabled?: boolean;
    command?: string[];
    args?: string[];
    extensions?: string[];
    env?: Record<string, string>;
    initialization?: Record<string, any>;
  };
}

export interface FormatterConfig {
  [language: string]: {
    disabled?: boolean;
    command?: string[];
    args?: string[];
    extensions?: string[];
    environment?: Record<string, string>;
  };
}

export interface HooksConfig {
  pre_tool?: string[];
  post_tool?: string[];
  pre_message?: string[];
  post_message?: string[];
}

export interface ExperimentalConfig {
  hooks?: HooksConfig;
  chatMaxRetries?: number;
  batch_tool?: boolean;
  disable_paste_summary?: boolean;
  primary_tools?: string[];
  continue_loop_on_deny?: boolean;
  mcp_timeout?: number;
  // V2 native: top-level subagent_depth moved here (top-level is ignored in V2).
  subagent_depth?: number;
  portable_shell_scanner?: boolean;
  policies?: { action: string; effect: 'allow' | 'deny'; resource: string }[];
  openTelemetry?: boolean | {
    enabled?: boolean;
    endpoint?: string;
  };
}

export interface ModelConfig {
  aliases?: Record<string, ModelAlias>;
  providers?: Record<string, ProviderConfig>;
}

export interface ServerConfig {
  port?: number;
  hostname?: string;
  mdns?: boolean;
  mdnsDomain?: string;
  cors?: string[];
}

export interface ToolOutputConfig {
  max_lines?: number;
  max_bytes?: number;
}

export interface AttachmentImageConfig {
  auto_resize?: boolean;
  max_width?: number;
  max_height?: number;
  max_base64_bytes?: number;
}

export interface AttachmentConfig {
  image?: AttachmentImageConfig;
}

// V2 native rename of `attachment` (nested image settings are identical).
export interface MediaConfig {
  image?: AttachmentImageConfig;
}

export interface WarmingConfig {
  prompt?: string;
  interval?: string;
  duration?: string;
}

export interface WebsearchConfig {
  provider?: string;
}

export interface WorktreeConfig {
  directory?: string;
}

export interface EnterpriseConfig {
  url?: string;
}

export interface SkillsConfig {
  paths?: string[];
  urls?: string[];
}

// V1 object form { paths, urls } or V2 native array form [...] (both accepted).
export type SkillsConfigValue = SkillsConfig | string[];

export interface CommandConfig {
  template: string;
  description?: string;
  agent?: string;
  model?: string;
  // V1 fallback (joined into `model` as provider/model#variant in V2):
  variant?: string;
  // V2 native (V1 used `subtask`):
  subagent?: boolean;
  subtask?: boolean;
}

export interface OpencodeConfig {
  $schema?: string;
  base_url?: string;
  // NOTE: theme/keybinds/tui inside opencode.json are legacy. V1 auto-migrates
  // them to tui.json; V2 uses one global cli.json owned by the terminal client
  // (see CliConfig + /api/cli-config). Kept for v1 fallback.
  theme?: 'dark' | 'light' | 'auto';
  model?: string | ModelConfig;
  small_model?: string;
  username?: string;
  // V1 `autoupdate` (fallback) + V2 `update` (native). V2 accepts the V1 field
  // without warning, but native UI should prefer `update`.
  autoupdate?: boolean | 'notify';
  update?: 'disable' | 'notify' | 'auto';
  share?: 'manual' | 'auto' | 'disabled';
  // Accepted but unsupported in V2 (ignored with a warning; use env/service flags).
  logLevel?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  server?: ServerConfig;
  // V1 top-level (ignored in V2; use experimental.subagent_depth instead).
  subagent_depth?: number;
  default_agent?: string;
  // V1 `snapshot` (fallback) + V2 `snapshots` (native).
  snapshot?: boolean;
  snapshots?: boolean;
  shell?: string;
  // V1 flat map + V2 { servers, timeout } nesting (both accepted).
  mcp?: (Record<string, MCPConfig> & { servers?: Record<string, MCPConfig>; timeout?: McpTimeoutConfig });
  // V1 map (fallback) + V2 ordered array (native).
  permission?: PermissionConfig;
  permissions?: PermissionRule[];
  // V1 `agent`+`mode` (fallback) + V2 `agents` (native).
  agent?: AgentsConfig;
  agents?: Record<string, AgentConfig>;
  tools?: Record<string, boolean>;
  tui?: TUIConfig;
  keybinds?: KeybindsConfig;
  compaction?: CompactionConfig;
  watcher?: WatcherConfig;
  lsp?: LSPConfig;
  formatter?: FormatterConfig;
  // V1 `command` (fallback) + V2 `commands` (native).
  command?: Record<string, CommandConfig>;
  commands?: Record<string, CommandConfig>;
  // V1 `plugin` (fallback, strings or [pkg, options] tuples) + V2 `plugins` (native).
  plugin?: (string | [string, unknown] | Record<string, unknown>)[];
  plugins?: (string | { package: string; options?: unknown })[];
  skills?: SkillsConfigValue;
  references?: Record<string, string | { repository: string; branch?: string; description?: string; hidden?: boolean } | { path: string; description?: string; hidden?: boolean }>;
  instructions?: string[];
  // V1 `attachment` (fallback) + V2 `media` (native).
  attachment?: AttachmentConfig;
  media?: MediaConfig;
  enterprise?: EnterpriseConfig;
  tool_output?: ToolOutputConfig;
  disabled_providers?: string[];
  enabled_providers?: string[];
  experimental?: ExperimentalConfig;
  // V1 `provider` (fallback) + V2 `providers` (native).
  provider?: Record<string, ProviderConfig>;
  providers?: Record<string, ProviderConfig>;
  // --- V2 native additions (no V1 equivalent) ---
  warming?: WarmingConfig | boolean;
  websearch?: WebsearchConfig | false;
  worktree?: WorktreeConfig;
}

// V2 terminal client configuration: one global file owned by the terminal
// client (auto-migrated from layered v1 tui.json files on first V2 startup).
// The background service does not load it.
export interface CliConfig {
  $schema?: string;
  theme?: string;
  [key: string]: unknown;
}

export interface OpencodeVersionInfo {
  available: boolean;
  raw: string | null;
  major: number | null;
  target: 'v1' | 'v2';
  isV1: boolean;
  isV2: boolean;
  serverVersion?: string;
  // What disk writes actually use (override > runtimes > on-disk shape inference).
  effectiveTarget?: 'v1' | 'v2';
  targetSource?: 'override' | 'binary' | 'desktop' | 'config' | 'default';
  opencodeTargetOverride?: 'auto' | 'v1' | 'v2';
  desktop?: {
    available: boolean;
    raw: string | null;
    major: number | null;
    path?: string | null;
  };
}

export interface SkillFile {
  name: string;
  description: string;
  content: string;
  rawContent: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
}

export interface PluginFile {
  name: string;
  content: string;
}

export interface PluginInfo {
  name: string;
  type: 'file' | 'npm';
  enabled: boolean;
}

export interface PathsInfo {
  detected: string | null;
  manual: string | null;
  current: string | null;
  candidates: string[];
}

export interface AuthCredential {
  id: string;
  name: string;
  type: 'oauth' | 'api';
  isExpired: boolean;
  expiresAt: number | null;
  active?: string | null;
  profiles?: string[];
  hasCurrentAuth?: boolean;
}

export interface AuthInfo {
  credentials: AuthCredential[];
  authFile: string | null;
  message?: string;
  hasGeminiAuthPlugin?: boolean;
  installedGooglePlugins: ('gemini' | 'antigravity')[];
  activeGooglePlugin: 'gemini' | 'antigravity' | null;
}

export interface PluginModelsConfig {
  [plugin: string]: {
    activeModels: string[];
    blacklist: string[];
  };
}

export interface StudioConfig {
  disabledSkills: string[];
  disabledPlugins: string[];
  activeGooglePlugin: 'gemini' | 'antigravity' | null;
  pluginModels: PluginModelsConfig;
  activeProfiles: Record<string, string>;
  presets: Preset[];
}

export interface PresetConfig {
  skills?: string[];
  plugins?: string[];
  mcps?: string[];
  commands?: string[];
}

export interface Preset {
  id: string;
  name: string;
  description?: string;
  config: PresetConfig;
}

export interface SystemToolInfo {
  name: string;
  path?: string;
  available: boolean;
}

export interface RulesResponse {
  content: string;
  source: 'AGENTS.md' | 'CLAUDE.md' | 'none';
  path: string | null;
}


export interface AuthProvider {
  id: string;
  name: string;
  type: 'oauth' | 'api';
  description: string;
}

export interface AuthProfilesInfo {
  [provider: string]: {
    profiles: string[];
    active: string | null;
    hasCurrentAuth: boolean;
  };
}

// Account Pool types for multi-account management
export type AccountStatus = 'active' | 'ready' | 'cooldown' | 'expired';

export interface AccountPoolEntry {
  name: string;
  email: string | null;
  status: AccountStatus;
  lastUsed: number;
  usageCount: number;
  cooldownUntil: number | null;
  createdAt: number;
  projectId?: string | null;
  tier?: string | null;
}

export interface AccountPool {
  provider: string;
  namespace: string;
  accounts: AccountPoolEntry[];
  activeAccount: string | null;
  totalAccounts: number;
  availableAccounts: number;
}

export interface QuotaInfo {
  dailyLimit: number;
  remaining: number;
  used: number;
  resetAt: string;
  percentage: number;
  byAccount: {
    name: string;
    email: string | null;
    used: number;
    limit: number;
  }[];
}

export interface PoolRotationResult {
  success: boolean;
  previousAccount: string | null;
  newAccount: string;
  reason?: string;
}

export interface OhMyThinkingConfig {
  type: 'enabled' | 'disabled';
}

export interface OhMyReasoningConfig {
  effort: 'low' | 'medium' | 'high' | 'xhigh';
}

export interface OhMyModelChoice {
  model: string;
  available: boolean;
  thinking?: OhMyThinkingConfig;
  reasoning?: OhMyReasoningConfig;
}

export interface OhMyAgentPreferences {
  choices: OhMyModelChoice[];
}

export interface OhMyPreferences {
  agents: Record<string, OhMyAgentPreferences>;
}

export interface OhMyConfigResponse {
  path: string | null;
  exists: boolean;
  config: Record<string, unknown> | null;
  preferences: OhMyPreferences;
  warnings?: string[];
}

export interface GitHubBackupConfig {
  owner?: string;
  repo?: string;
  branch?: string;
}

export interface GitHubBackupStatus {
  connected: boolean;
  user?: string;
  config?: GitHubBackupConfig;
  repoExists?: boolean;
  lastUpdated?: string;
  error?: string;
  autoSync?: boolean;
}

export interface GitHubBackupResult {
  success: boolean;
  timestamp?: string;
  commit?: string;
  url?: string;
  error?: string;
}

export interface RulesResponse {
  content: string;
  activeFile?: string;
  files?: string[];
}

export interface SystemToolInfo {
  name: string;
  description?: string;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: 'mcp' | 'agent' | 'system';
  message: string;
  metadata?: Record<string, unknown>;
}
