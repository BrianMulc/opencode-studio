// Compatibility layer: OpenCode v2 primary, v1 fallback.
//
// V2 normalizes supported V1 fields in-memory without rewriting source files.
// This module mirrors that behavior so OpenCode Studio can read either shape,
// present a canonical (V2-native) model to the UI, and write back in the
// shape matching the detected OpenCode major version.
//
// Reference: https://opencode.ai/v2/docs/migrate-v1/
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const V1_TO_V2_ACTION = Object.freeze({
    bash: 'shell',
    task: 'subagent',
    write: 'edit',
    patch: 'edit',
});

const V2_TO_V1_ACTION = Object.freeze({
    shell: 'bash',
    subagent: 'task',
});

const V1_TO_V2_PROVIDER_ID = Object.freeze({
    'azure-cognitive-services': 'azure',
    'google-vertex-anthropic': 'google-vertex',
});

const V1_TO_V2_OAUTH = Object.freeze({
    clientId: 'client_id',
    clientSecret: 'client_secret',
    callbackPort: 'callback_port',
    redirectUri: 'redirect_uri',
});

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const deepClone = (v) => {
    if (v === undefined) return undefined;
    try {
        return JSON.parse(JSON.stringify(v));
    } catch {
        return v;
    }
};

// ---------------------------------------------------------------------------
// Version detection
// ---------------------------------------------------------------------------
let versionCache = { at: 0, result: null };
const VERSION_CACHE_TTL_MS = 60000;

function parseMajor(raw) {
    if (!raw) return null;
    const m = String(raw).match(/(\d+)\.(\d+)\.(\d+)/);
    if (!m) return null;
    return parseInt(m[1], 10);
}

function detectOpencodeVersion({ force = false } = {}) {
    if (!force && versionCache.result && Date.now() - versionCache.at < VERSION_CACHE_TTL_MS) {
        return versionCache.result;
    }
    let raw = null;
    let available = false;
    try {
        raw = execSync('opencode --version', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 8000,
            // Never flash a console window on Windows console-less servers.
            windowsHide: true,
        }).toString().trim();
        available = true;
    } catch {
        available = false;
    }
    const major = parseMajor(raw);
    const result = {
        available,
        raw,
        major: major ?? null,
        // v2 primary, v1 fallback. Unknown binary -> assume v2 (forward-looking).
        target: major === 1 ? 'v1' : 'v2',
        isV1: major === 1,
        isV2: major !== 1,
    };
    versionCache = { at: Date.now(), result };
    return result;
}

function getTargetShape(override) {
    if (override === 'v1' || override === 'v2') return override;
    return detectOpencodeVersion().target;
}

// ---------------------------------------------------------------------------
// Desktop GUI version detection
//
// The `opencode` CLI is not the only runtime: the OpenCode Desktop app reads
// the same opencode.json but ships its own version (currently v1 for this
// user: Desktop 1.18.35 while no working CLI exists on PATH at all). Probing
// only the CLI therefore misses the runtime that actually matters, so Studio
// also probes the well-known Desktop install locations.
// ---------------------------------------------------------------------------
let desktopCache = { at: 0, result: null };
const DESKTOP_CACHE_TTL_MS = 60000;

function desktopCandidateDirs() {
    const dirs = [];
    try {
        const home = typeof os.homedir === 'function' ? os.homedir() : null;
        if (process.platform === 'win32') {
            const localAppData = process.env.LOCALAPPDATA || (home ? path.join(home, 'AppData', 'Local') : null);
            if (localAppData) dirs.push(path.join(localAppData, 'Programs', '@opencode-aidesktop'));
            if (process.env.PROGRAMFILES) dirs.push(path.join(process.env.PROGRAMFILES, '@opencode-aidesktop'));
            if (process.env['PROGRAMFILES(X86)']) dirs.push(path.join(process.env['PROGRAMFILES(X86)'], '@opencode-aidesktop'));
        } else if (process.platform === 'darwin') {
            dirs.push('/Applications/OpenCode.app/Contents');
            if (home) dirs.push(path.join(home, 'Applications', 'OpenCode.app', 'Contents'));
        } else {
            dirs.push('/opt/OpenCode', '/usr/lib/opencode-desktop', '/opt/opencode-desktop');
            if (home) dirs.push(path.join(home, '.local', 'share', 'opencode-desktop'));
        }
    } catch { /* ignore — no candidates */ }
    return dirs;
}

// Some Desktop builds stamp their version into resources/app-update.yml.
function readVersionFromAppUpdateYml(dir) {
    try {
        const text = fs.readFileSync(path.join(dir, 'resources', 'app-update.yml'), 'utf8');
        const m = text.match(/^\s*version\s*:\s*["']?([0-9]+\.[0-9]+\.[0-9]+[^"'\s]*)/m);
        if (m) return m[1].trim();
    } catch { /* ignore */ }
    return null;
}

// Windows: PE product version of the installed exe (e.g. "1.18.35.0").
function readWindowsExeVersion(exePath) {
    try {
        if (!fs.existsSync(exePath)) return null;
        const quoted = `'${String(exePath).replace(/'/g, "''")}'`;
        const out = execSync(
            `powershell -NoProfile -NonInteractive -Command "(Get-Item ${quoted}).VersionInfo.ProductVersion"`,
            { encoding: 'utf8', timeout: 15000, windowsHide: true }
        ).toString().trim();
        const first = out.split('\n')[0].trim();
        if (/[0-9]+\.[0-9]+\.[0-9]+/.test(first)) return first;
    } catch { /* ignore */ }
    return null;
}

// macOS: CFBundleShortVersionString from the app bundle's Info.plist.
function readMacPlistVersion(contentsDir) {
    try {
        const text = fs.readFileSync(path.join(contentsDir, 'Info.plist'), 'utf8');
        const m = text.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/);
        if (m) return m[1].trim();
    } catch { /* ignore */ }
    return null;
}

function detectDesktopVersion({ force = false } = {}) {
    if (!force && desktopCache.result && Date.now() - desktopCache.at < DESKTOP_CACHE_TTL_MS) {
        return desktopCache.result;
    }
    let raw = null;
    let foundPath = null;
    for (const dir of desktopCandidateDirs()) {
        let v = readVersionFromAppUpdateYml(dir);
        if (!v && process.platform === 'win32') v = readWindowsExeVersion(path.join(dir, 'OpenCode.exe'));
        if (!v && process.platform === 'darwin') v = readMacPlistVersion(dir);
        if (!v && process.platform !== 'win32' && process.platform !== 'darwin') {
            for (const bin of ['opencode-desktop', 'opencode', 'OpenCode']) {
                const bp = path.join(dir, bin);
                try {
                    if (fs.existsSync(bp)) {
                        const out = execSync(`"${bp}" --version`, {
                            encoding: 'utf8', timeout: 8000, windowsHide: true,
                        }).toString().trim();
                        const m = out.match(/(\d+)\.(\d+)\.(\d+)/);
                        if (m) { v = m[0]; break; }
                    }
                } catch { /* try next */ }
            }
        }
        if (v) { raw = v; foundPath = dir; break; }
    }
    const major = parseMajor(raw);
    const result = {
        available: raw !== null,
        raw,
        major: major ?? null,
        path: foundPath,
        // Same forward-looking default as the CLI probe when nothing is found.
        target: major === 1 ? 'v1' : 'v2',
        isV1: major === 1,
        isV2: major !== 1,
    };
    desktopCache = { at: Date.now(), result };
    return result;
}

// The config file must satisfy the strictest known runtime: v1 cannot read
// v2, but v2 reads v1 — so any known v1 runtime (CLI or Desktop) pins the
// target to v1. Returns { target, source } or null when nothing is known.
function resolveRuntimeTarget(cli, desktop) {
    const known = [];
    if (cli && cli.available && cli.major !== null && cli.major !== undefined) {
        known.push({ major: cli.major, source: 'binary' });
    }
    if (desktop && desktop.available && desktop.major !== null && desktop.major !== undefined) {
        known.push({ major: desktop.major, source: 'desktop' });
    }
    if (known.length === 0) return null;
    const v1 = known.find((k) => k.major === 1);
    if (v1) return { target: 'v1', source: v1.source };
    return { target: 'v2', source: known[0].source };
}

// Keys that only exist in the native V2 shape. Any one of them on disk pins
// the file to v2 — EXCEPT `update`, which Studio's own v1 writes keep
// alongside `autoupdate`, so it is deliberately not in this list.
const V2_ONLY_KEYS = new Set([
    'permissions', 'providers', 'agents', 'commands', 'plugins',
    'snapshots', 'media', 'references',
]);

// Keys that only exist in the legacy V1 shape. `update` and
// `experimental.subagent_depth` are intentionally absent: Studio's v1 writes
// keep `update` next to `autoupdate`, and both shapes share the experimental
// key, so neither proves anything.
const V1_ONLY_KEYS = new Set([
    'permission', 'provider', 'agent', 'mode', 'command', 'plugin',
    'snapshot', 'attachment', 'reference', 'autoupdate', 'subagent_depth',
]);

// Best-effort guess of which shape an on-disk (RAW, never normalized) config
// is already in. Used only when the opencode binary is missing or its version
// is unparseable, so Studio never clobbers a v1 setup with v2 keys just
// because detection failed. Mixed files resolve to v2 (V2 wins on conflict);
// files with no shape signals default to v2 (forward-looking).
function inferTargetFromConfig(raw) {
    if (!isPlainObject(raw)) return 'v2';
    for (const k of V2_ONLY_KEYS) {
        if (raw[k] !== undefined) return 'v2';
    }
    if (isPlainObject(raw.mcp)) {
        if (isPlainObject(raw.mcp.servers)) return 'v2';
        for (const [name, entry] of Object.entries(raw.mcp)) {
            if (name === 'servers' || name === 'timeout') continue;
            if (isPlainObject(entry)) return 'v1';
        }
    }
    for (const k of V1_ONLY_KEYS) {
        if (raw[k] !== undefined) return 'v1';
    }
    if (isPlainObject(raw.model) && isPlainObject(raw.model.providers)) return 'v1';
    if (isPlainObject(raw.experimental) && typeof raw.experimental.mcp_timeout === 'number') return 'v1';
    return 'v2';
}

// ---------------------------------------------------------------------------
// Permissions: V1 map (+ tools map) <-> V2 ordered array
// ---------------------------------------------------------------------------
function v1ActionToV2(action) {
    return V1_TO_V2_ACTION[action] || action;
}

function v2ActionToV1(action) {
    return V2_TO_V1_ACTION[action] || action;
}

// V1 map form: { bash: "ask" | { "pattern": "allow" } | { allow: [], deny: [] }, ... }
function permissionMapToRules(map) {
    const rules = [];
    if (!isPlainObject(map)) return rules;
    for (const [rawAction, value] of Object.entries(map)) {
        const action = v1ActionToV2(rawAction);
        if (value === undefined || value === null) continue;
        if (typeof value === 'string') {
            rules.push({ action, resource: '*', effect: value });
            continue;
        }
        if (Array.isArray(value)) continue;
        if (isPlainObject(value)) {
            const keys = Object.keys(value);
            const isAllowDenyList = keys.every((k) => k === 'allow' || k === 'deny');
            if (isAllowDenyList) {
                for (const pattern of value.allow || []) {
                    rules.push({ action, resource: pattern, effect: 'allow' });
                }
                for (const pattern of value.deny || []) {
                    rules.push({ action, resource: pattern, effect: 'deny' });
                }
                continue;
            }
            for (const [resource, effect] of Object.entries(value)) {
                if (typeof effect !== 'string') continue;
                rules.push({ action, resource, effect });
            }
        }
    }
    return rules;
}

// tools map { websearch: false } -> deny rules
function toolsMapToRules(tools) {
    const rules = [];
    if (!isPlainObject(tools)) return rules;
    for (const [tool, enabled] of Object.entries(tools)) {
        if (enabled === false) {
            rules.push({ action: v1ActionToV2(tool), resource: '*', effect: 'deny' });
        }
    }
    return rules;
}

// Best-effort reverse: ordered array -> V1 map (lossy for ordering, but fine for v1 fallback).
function permissionRulesToMap(rules) {
    const map = {};
    if (!Array.isArray(rules)) return map;
    for (const rule of rules) {
        if (!isPlainObject(rule)) continue;
        const action = v2ActionToV1(rule.action || '*');
        const resource = rule.resource ?? '*';
        const effect = rule.effect;
        if (!effect) continue;
        if (resource === '*') {
            // Last-match-wins in v2; later scalar overwrites earlier for v1 fallback.
            map[action] = effect;
            continue;
        }
        const existing = map[action];
        if (typeof existing === 'string') {
            map[action] = { '*': existing, [resource]: effect };
        } else if (isPlainObject(existing)) {
            existing[resource] = effect;
        } else {
            map[action] = { [resource]: effect };
        }
    }
    return map;
}

function getPermissionsArray(config) {
    if (!isPlainObject(config)) return [];
    const out = [];
    // Legacy first, native V2 last (V2 wins on conflict / last-match-wins).
    out.push(...permissionMapToRules(config.permission));
    out.push(...toolsMapToRules(config.tools));
    if (Array.isArray(config.permissions)) {
        for (const r of config.permissions) {
            if (isPlainObject(r) && r.action && r.effect) {
                out.push({
                    action: v1ActionToV2(r.action),
                    resource: r.resource ?? '*',
                    effect: r.effect,
                });
            }
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Agents: V1 { agent, mode, prompt, disable, variant, ... } <-> V2 { agents }
// ---------------------------------------------------------------------------
function joinModelVariant(model, variant) {
    if (!model) return model;
    if (!variant) return model;
    if (String(model).includes('#')) return model;
    return `${model}#${variant}`;
}

function splitModelVariant(model) {
    if (typeof model !== 'string') return { model, variant: undefined };
    const idx = model.indexOf('#');
    if (idx < 0) return { model, variant: undefined };
    return { model: model.slice(0, idx), variant: model.slice(idx + 1) || undefined };
}

function normalizeAgentEntryV1ToV2(entry) {
    if (!isPlainObject(entry)) return deepClone(entry) ?? {};
    const out = { ...entry };
    // prompt -> system (file bodies stay as-is; JSON prompt becomes system)
    if (out.prompt !== undefined && out.system === undefined) {
        out.system = out.prompt;
    }
    delete out.prompt;
    // disable -> disabled
    if (out.disable !== undefined && out.disabled === undefined) {
        out.disabled = out.disable;
    }
    delete out.disable;
    // maxSteps -> steps
    if (out.maxSteps !== undefined && out.steps === undefined) {
        out.steps = out.maxSteps;
    }
    delete out.maxSteps;
    // variant joins model
    if (out.variant !== undefined) {
        out.model = joinModelVariant(out.model, out.variant);
        delete out.variant;
    }
    // temperature / top_p / options -> request.body
    const body = { ...(isPlainObject(out.request?.body) ? out.request.body : {}) };
    let movedRequest = false;
    if (out.temperature !== undefined) { body.temperature = out.temperature; delete out.temperature; movedRequest = true; }
    if (out.top_p !== undefined) { body.top_p = out.top_p; delete out.top_p; movedRequest = true; }
    if (isPlainObject(out.options)) {
        Object.assign(body, out.options);
        delete out.options;
        movedRequest = true;
    }
    if (movedRequest && Object.keys(body).length > 0) {
        out.request = { ...(isPlainObject(out.request) ? out.request : {}), body };
    }
    // permission (map) -> permissions (array); tools map -> deny rules
    const legacyRules = [
        ...permissionMapToRules(out.permission),
        ...toolsMapToRules(out.tools),
    ];
    delete out.tools;
    if (legacyRules.length > 0) {
        const native = Array.isArray(out.permissions) ? out.permissions : [];
        // Legacy first, native last so native wins.
        out.permissions = [...legacyRules, ...native.map((r) => ({
            action: v1ActionToV2(r.action),
            resource: r.resource ?? '*',
            effect: r.effect,
        }))].filter((r) => r && r.action && r.effect);
        delete out.permission;
    } else if (out.permission && !out.permissions) {
        out.permissions = permissionMapToRules(out.permission);
        delete out.permission;
    } else if (out.permission) {
        delete out.permission;
    }
    // V1 JSON `name` inside entries has no V2 behavior; preserved verbatim
    // (dropping it would destroy round-trip data for v1 fallback readers).
    return out;
}

function getAgentsMap(config) {
    const out = {};
    if (!isPlainObject(config)) return out;
    // Legacy `mode` entries become primary agents.
    if (isPlainObject(config.mode)) {
        for (const [name, entry] of Object.entries(config.mode)) {
            // Malformed (non-object) entries pass through verbatim — never
            // spread them, since spreading a string yields char-index garbage.
            if (!isPlainObject(entry)) { out[name] = entry; continue; }
            out[name] = { ...normalizeAgentEntryV1ToV2(entry), mode: 'primary' };
        }
    }
    if (isPlainObject(config.agent)) {
        for (const [name, entry] of Object.entries(config.agent)) {
            if (!isPlainObject(entry)) { out[name] = entry; continue; }
            const base = isPlainObject(out[name]) ? out[name] : {};
            out[name] = { ...base, ...normalizeAgentEntryV1ToV2(entry) };
        }
    }
    if (isPlainObject(config.agents)) {
        for (const [name, entry] of Object.entries(config.agents)) {
            if (!isPlainObject(entry)) { out[name] = entry; continue; }
            // Native V2 entries must stay entirely in one format (no recursive inference).
            const normalized = { ...entry };
            if (normalized.system === undefined && normalized.prompt !== undefined) {
                normalized.system = normalized.prompt;
                delete normalized.prompt;
            }
            if (normalized.disabled === undefined && normalized.disable !== undefined) {
                normalized.disabled = normalized.disable;
                delete normalized.disable;
            }
            if (normalized.permissions === undefined && normalized.permission !== undefined) {
                normalized.permissions = permissionMapToRules(normalized.permission);
                delete normalized.permission;
            } else if (normalized.permission !== undefined) {
                delete normalized.permission;
            }
            // `name` inside entries has no V2 behavior but is preserved verbatim
            // so version switches never destroy user data.
            out[name] = { ...(out[name] || {}), ...normalized };
        }
    }
    return out;
}

function agentsMapToV1(agentsV2) {
    const out = {};
    for (const [name, entry] of Object.entries(agentsV2 || {})) {
        if (!isPlainObject(entry)) { out[name] = entry; continue; }
        const v1 = { ...entry };
        if (v1.system !== undefined && v1.prompt === undefined) {
            v1.prompt = v1.system;
            delete v1.system;
        }
        if (v1.disabled !== undefined && v1.disable === undefined) {
            v1.disable = v1.disabled;
            delete v1.disabled;
        }
        // Keep steps as steps (v1 also accepts steps? v1 used maxSteps; write both for safety)
        if (v1.steps !== undefined && v1.maxSteps === undefined) {
            v1.maxSteps = v1.steps;
        }
        const { model, variant } = splitModelVariant(v1.model);
        if (variant !== undefined) {
            v1.model = model;
            v1.variant = variant;
        }
        if (isPlainObject(v1.request?.body)) {
            const { temperature, top_p, ...rest } = v1.request.body;
            if (temperature !== undefined && v1.temperature === undefined) v1.temperature = temperature;
            if (top_p !== undefined && v1.top_p === undefined) v1.top_p = top_p;
            if (Object.keys(rest).length > 0 && v1.options === undefined) v1.options = rest;
            if (Object.keys(v1.request.body).length === Object.keys({ temperature, top_p }).filter((k) => v1.request.body[k] !== undefined).length) {
                delete v1.request;
            }
        }
        if (Array.isArray(v1.permissions) && v1.permission === undefined) {
            v1.permission = permissionRulesToMap(v1.permissions);
        }
        out[name] = v1;
    }
    return out;
}

// ---------------------------------------------------------------------------
// Commands: V1 { command, subtask, variant } <-> V2 { commands, subagent }
// ---------------------------------------------------------------------------
function normalizeCommandEntryV1ToV2(entry) {
    if (typeof entry === 'string') return { template: entry };
    if (!isPlainObject(entry)) return deepClone(entry) ?? {};
    const out = { ...entry };
    if (out.subtask !== undefined && out.subagent === undefined) {
        out.subagent = out.subtask;
    }
    delete out.subtask;
    if (out.variant !== undefined) {
        out.model = joinModelVariant(out.model, out.variant);
        delete out.variant;
    }
    return out;
}

function getCommandsMap(config) {
    const out = {};
    if (!isPlainObject(config)) return out;
    if (isPlainObject(config.command)) {
        for (const [name, entry] of Object.entries(config.command)) {
            out[name] = normalizeCommandEntryV1ToV2(entry);
        }
    }
    if (isPlainObject(config.commands)) {
        for (const [name, entry] of Object.entries(config.commands)) {
            const normalized = normalizeCommandEntryV1ToV2(entry);
            // Malformed (non-object) results pass through verbatim — never spread them.
            if (!isPlainObject(normalized)) { out[name] = normalized; continue; }
            const base = isPlainObject(out[name]) ? out[name] : {};
            out[name] = { ...base, ...normalized };
        }
    }
    return out;
}

function commandsMapToV1(commandsV2) {
    const out = {};
    for (const [name, entry] of Object.entries(commandsV2 || {})) {
        if (!isPlainObject(entry)) { out[name] = entry; continue; }
        const v1 = { ...entry };
        if (v1.subagent !== undefined && v1.subtask === undefined) {
            v1.subtask = v1.subagent;
        }
        const { model, variant } = splitModelVariant(v1.model);
        if (variant !== undefined) {
            v1.model = model;
            v1.variant = variant;
        }
        out[name] = v1;
    }
    return out;
}

// ---------------------------------------------------------------------------
// MCP: V1 flat { name: {..., enabled, timeout: number, oauth camelCase } }
//   <-> V2 { servers: {...}, timeout: {...}, oauth snake_case }
// ---------------------------------------------------------------------------
function normalizeOauthToV2(oauth) {
    if (!isPlainObject(oauth)) return oauth;
    const out = { ...oauth };
    for (const [v1Key, v2Key] of Object.entries(V1_TO_V2_OAUTH)) {
        if (out[v1Key] !== undefined && out[v2Key] === undefined) {
            out[v2Key] = out[v1Key];
        }
        delete out[v1Key];
    }
    return out;
}

function normalizeMcpEntryV1ToV2(entry) {
    if (!isPlainObject(entry)) return deepClone(entry);
    const out = { ...entry };
    if (out.enabled !== undefined && out.disabled === undefined) {
        out.disabled = !out.enabled;
    }
    delete out.enabled;
    if (typeof out.timeout === 'number' && !isPlainObject(out.timeout)) {
        out.timeout = { catalog: out.timeout, execution: out.timeout };
    }
    if (out.oauth !== undefined) {
        out.oauth = normalizeOauthToV2(out.oauth);
    }
    return out;
}

function getMcpServersMap(config) {
    const out = {};
    if (!isPlainObject(config) || !isPlainObject(config.mcp)) return out;
    const mcp = config.mcp;
    // Mixed V1/V2 members within `mcp` are recognized: flat entries are V1,
    // `servers` sub-object is V2. V2 wins on name conflicts.
    for (const [name, entry] of Object.entries(mcp)) {
        if (name === 'servers' || name === 'timeout') continue;
        // Flat V1 server entries are always objects; unknown scalar keys
        // (future flags, etc.) are preserved verbatim, not treated as servers.
        if (!isPlainObject(entry)) continue;
        out[name] = normalizeMcpEntryV1ToV2(entry);
    }
    if (isPlainObject(mcp.servers)) {
        for (const [name, entry] of Object.entries(mcp.servers)) {
            // Malformed (non-object) entries pass through verbatim — never spread them.
            if (!isPlainObject(entry)) { out[name] = entry; continue; }
            const base = isPlainObject(out[name]) ? out[name] : {};
            out[name] = { ...base, ...normalizeMcpEntryV1ToV2(entry) };
        }
    }
    return out;
}

function getMcpTimeoutDefaults(config) {
    const mcp = isPlainObject(config?.mcp) ? config.mcp : {};
    const timeout = isPlainObject(mcp.timeout) ? { ...mcp.timeout } : {};
    // A global numeric `mcp.timeout` (as `forWrite(v1)` emits) maps to both
    // purposes, same as a per-server number or `experimental.mcp_timeout`.
    if (typeof mcp.timeout === 'number') {
        if (timeout.catalog === undefined) timeout.catalog = mcp.timeout;
        if (timeout.execution === undefined) timeout.execution = mcp.timeout;
    }
    // V1 experimental.mcp_timeout becomes default catalog + execution.
    const legacy = config?.experimental?.mcp_timeout;
    if (typeof legacy === 'number') {
        if (timeout.catalog === undefined) timeout.catalog = legacy;
        if (timeout.execution === undefined) timeout.execution = legacy;
    }
    return timeout;
}

// ---------------------------------------------------------------------------
// Providers + models
// ---------------------------------------------------------------------------
function canonicalProviderId(id) {
    return V1_TO_V2_PROVIDER_ID[id] || id;
}

function v1NpmToV2Package(npm) {
    if (typeof npm !== 'string' || !npm) return npm;
    if (npm.startsWith('aisdk:')) return npm;
    if (npm.startsWith('@ai-sdk/')) return `aisdk:${npm}`;
    return npm;
}

function v2PackageToV1Npm(pkg) {
    if (typeof pkg !== 'string' || !pkg) return pkg;
    if (pkg.startsWith('aisdk:')) return pkg.slice('aisdk:'.length);
    return pkg;
}

// Top-level model/variant keys in the V2 shape (providers docs). Any other
// key found in a V1 variants-object value is a package-specific option and
// belongs under that variant's `settings`.
const MODEL_TOP_LEVEL_KEYS = new Set([
    'modelID', 'id', 'name', 'family', 'package', 'npm', 'api',
    'settings', 'headers', 'body', 'capabilities', 'tool_call', 'modalities',
    'compatibility', 'variants', 'cost', 'cache_read', 'cache_write',
    'limit', 'disabled', 'status', 'release_date', 'attachment',
    'reasoning', 'temperature', 'experimental', 'interleaved', 'options',
]);

function normalizeVariantsToV2(variants) {
    if (Array.isArray(variants)) {
        return variants.map((v) => (isPlainObject(v) ? { ...v } : v));
    }
    if (isPlainObject(variants)) {
        return Object.entries(variants).map(([id, v]) => {
            if (!isPlainObject(v)) return { id };
            const normalized = normalizeModelOptionsToSettings(v);
            // V1 variant values are flat option bags; package-specific keys
            // belong under V2 `settings` (per the migrate-v1 variants example).
            // Known top-level model keys stay top-level; everything else nests.
            const entry = { id };
            // Malformed scalar `settings` is kept verbatim (never dropped);
            // customs then stay top-level so nothing is lost.
            const rawSettings = normalized.settings;
            const keepScalarSettings = rawSettings !== undefined && !isPlainObject(rawSettings);
            const settings = isPlainObject(rawSettings) ? { ...rawSettings } : {};
            for (const [k, val] of Object.entries(normalized)) {
                if (k === 'settings') continue;
                if (MODEL_TOP_LEVEL_KEYS.has(k)) entry[k] = val;
                else if (keepScalarSettings) entry[k] = val;
                else if (settings[k] === undefined) settings[k] = val;
            }
            if (!keepScalarSettings && Object.keys(settings).length > 0) entry.settings = settings;
            else if (keepScalarSettings) entry.settings = rawSettings;
            return entry;
        });
    }
    return variants;
}

function normalizeModelOptionsToSettings(model) {
    if (!isPlainObject(model)) return model;
    const out = { ...model };
    if (out.id !== undefined && out.modelID === undefined) {
        out.modelID = out.id;
    }
    delete out.id;
    if (out.tool_call !== undefined) {
        const caps = isPlainObject(out.capabilities) ? { ...out.capabilities } : {};
        // Native V2 `capabilities.tools` wins on conflict; legacy fills gaps.
        if (caps.tools === undefined) caps.tools = out.tool_call !== false;
        out.capabilities = caps;
        delete out.tool_call;
    }
    if (out.modalities !== undefined) {
        const caps = isPlainObject(out.capabilities) ? { ...out.capabilities } : {};
        if (caps.input === undefined) caps.input = out.modalities?.input;
        if (caps.output === undefined) caps.output = out.modalities?.output;
        if (caps.input !== undefined || caps.output !== undefined || caps.tools !== undefined) {
            out.capabilities = caps;
        }
        delete out.modalities;
    }
    if (out.status === 'deprecated' && out.disabled === undefined) {
        out.disabled = true;
    }
    // Non-deprecated `status` has no V2 behavior — preserved verbatim (see above).
    // Cache costs: v1 `cost.cache_read/cache_write` (also tolerate top-level) -> v2 `cost.cache.read/write`.
    for (const [v1Key, v2Key] of [['cache_read', 'read'], ['cache_write', 'write']]) {
        if (out[v1Key] !== undefined) {
            out.cost = isPlainObject(out.cost) ? { ...out.cost } : {};
            out.cost.cache = isPlainObject(out.cost.cache) ? { ...out.cost.cache } : {};
            if (out.cost.cache[v2Key] === undefined) out.cost.cache[v2Key] = out[v1Key];
            delete out[v1Key];
        }
    }
    if (isPlainObject(out.cost)) {
        const cost = { ...out.cost };        if (cost.cache_read !== undefined && cost.cache?.read === undefined) {
            cost.cache = { ...(isPlainObject(cost.cache) ? cost.cache : {}), read: cost.cache_read };
        }
        if (cost.cache_write !== undefined && cost.cache?.write === undefined) {
            cost.cache = { ...(isPlainObject(cost.cache) ? cost.cache : {}), write: cost.cache_write };
        }
        delete cost.cache_read;
        delete cost.cache_write;
        out.cost = cost;
    }
    // V1 `options` fills gaps; native V2 `settings` wins on conflict.
    // `headers`/`body` inside `options` hoist to top-level V2 fields.
    if (isPlainObject(out.options)) {
        for (const bagKey of ['headers', 'body']) {
            if (isPlainObject(out.options[bagKey])) {
                out[bagKey] = { ...out.options[bagKey], ...(isPlainObject(out[bagKey]) ? out[bagKey] : {}) };
                delete out.options[bagKey];
            }
        }
    }
    if (isPlainObject(out.options)) {
        const settings = isPlainObject(out.settings) ? { ...out.settings } : {};
        for (const [k, v] of Object.entries(out.options)) {
            if (settings[k] === undefined) settings[k] = v;
        }
        if (Object.keys(settings).length > 0) out.settings = settings;
        else delete out.settings;
    }
    delete out.options;
    // Accepted-but-unsupported V1 scalars (release_date, attachment, reasoning,
    // temperature, experimental, interleaved, non-deprecated status, ...) have
    // no V2 behavior, but we PRESERVE them verbatim so switching versions or
    // runtimes never destroys user data. V2 itself ignores them with a warning.
    if (out.variants !== undefined) {
        out.variants = normalizeVariantsToV2(out.variants);
    }
    return out;
}

function normalizeProviderEntryV1ToV2(entry) {
    if (!isPlainObject(entry)) return deepClone(entry);
    const out = { ...entry };
    if (out.npm !== undefined && out.package === undefined) {
        out.package = v1NpmToV2Package(out.npm);
    }
    delete out.npm;
    // V1 provider `id`/`whitelist`/`blacklist` have no V2 behavior; preserved
    // verbatim so version switches never destroy user data.
    // V1 `api` -> V2 settings.baseURL ; V1 options -> settings, except
    // `headers`/`body` bags which are top-level V2 fields (native wins).
    const settings = isPlainObject(out.settings) ? { ...out.settings } : {};
    if (typeof out.api === 'string' && settings.baseURL === undefined) {
        settings.baseURL = out.api;
    }
    delete out.api;
    if (isPlainObject(out.options)) {
        for (const bagKey of ['headers', 'body']) {
            if (isPlainObject(out.options[bagKey])) {
                out[bagKey] = { ...out.options[bagKey], ...(isPlainObject(out[bagKey]) ? out[bagKey] : {}) };
                delete out.options[bagKey];
            }
        }
    }
    if (isPlainObject(out.options)) {
        for (const [k, v] of Object.entries(out.options)) {
            if (settings[k] === undefined) settings[k] = v;
        }
    }
    delete out.options;
    if (Object.keys(settings).length > 0) out.settings = settings;
    else delete out.settings;
    if (isPlainObject(out.models)) {
        const models = {};
        for (const [key, model] of Object.entries(out.models)) {
            models[key] = normalizeModelOptionsToSettings(model);
        }
        out.models = models;
    }
    return out;
}

function getProvidersMap(config) {
    const out = {};
    if (!isPlainObject(config)) return out;
    if (isPlainObject(config.provider)) {
        for (const [rawId, entry] of Object.entries(config.provider)) {
            const id = canonicalProviderId(rawId);
            // Malformed (non-object) entries pass through verbatim — never spread them.
            if (!isPlainObject(entry)) { out[id] = entry; continue; }
            const base = isPlainObject(out[id]) ? out[id] : {};
            out[id] = { ...base, ...normalizeProviderEntryV1ToV2(entry) };
        }
    }
    if (isPlainObject(config.providers)) {
        for (const [rawId, entry] of Object.entries(config.providers)) {
            const id = canonicalProviderId(rawId);
            if (!isPlainObject(entry)) { out[id] = entry; continue; }
            const base = isPlainObject(out[id]) ? out[id] : {};
            out[id] = { ...base, ...normalizeProviderEntryV1ToV2(entry) };
        }
    }
    // Legacy model.providers nesting (seen in Studio aggregation) — merge last? No:
    // treat as lowest priority so top-level providers win.
    const nested = isPlainObject(config.model) ? config.model.providers : undefined;
    if (isPlainObject(nested)) {
        for (const [rawId, entry] of Object.entries(nested)) {
            const id = canonicalProviderId(rawId);
            if (!out[id]) out[id] = normalizeProviderEntryV1ToV2(entry);
        }
    }
    return out;
}

// ---------------------------------------------------------------------------
// Top-level canonicalization
// ---------------------------------------------------------------------------
function normalizeSkillsToV2(skills) {
    if (Array.isArray(skills)) return [...skills];
    if (isPlainObject(skills)) {
        const paths = Array.isArray(skills.paths) ? skills.paths : [];
        const urls = Array.isArray(skills.urls) ? skills.urls : [];
        return [...paths, ...urls];
    }
    return skills;
}

function normalizePluginEntryToV2(entry) {
    if (typeof entry === 'string') return entry;
    if (Array.isArray(entry)) {
        const [pkg, options] = entry;
        if (options !== undefined) return { package: pkg, options };
        return { package: pkg };
    }
    if (isPlainObject(entry)) return { ...entry };
    return entry;
}

function pluginIdentity(entry) {
    // Unify string and {package} forms so the same plugin dedups across shapes.
    if (typeof entry === 'string') return `pkg:${entry}`;
    if (isPlainObject(entry)) return `pkg:${entry.package || entry.name || entry.npm || JSON.stringify(entry)}`;
    if (Array.isArray(entry)) return `pkg:${entry[0]}`;
    return `other:${JSON.stringify(entry)}`;
}

function normalizePluginsToV2(config) {
    // Returns `plugins` in V2 native shape or undefined. Legacy `plugin` and
    // native `plugins` may coexist; native wins on conflicts (dedup by identity).
    const legacy = config.plugin;
    const native = config.plugins;
    if (legacy === undefined && native === undefined) return undefined;
    const seen = new Map();
    const out = [];
    const push = (entry) => {
        // Nullish entries carry no plugin identity — skip instead of
        // materializing a `[null]` array out of `plugin: null`.
        if (entry === null || entry === undefined) return;
        const canonical = normalizePluginEntryToV2(entry);
        const id = pluginIdentity(canonical);
        if (seen.has(id)) {
            // Later (native) entries replace earlier ones on conflict.
            out[seen.get(id)] = canonical;
            return;
        }
        seen.set(id, out.length);
        out.push(canonical);
    };
    // Legacy first, native last (native wins on conflicts — dedup by identity).
    if (legacy !== undefined) (Array.isArray(legacy) ? legacy : [legacy]).forEach(push);
    if (native !== undefined) (Array.isArray(native) ? native : [native]).forEach(push);
    return out;
}

function autoupdateToUpdate(autoupdate) {
    if (autoupdate === false) return 'disable';
    if (autoupdate === 'notify') return 'notify';
    if (autoupdate === true) return 'auto';
    return undefined;
}

// Canonical in-memory shape: V2-native keys. Unknown keys are preserved.
function normalizeToCanonical(config) {
    if (!isPlainObject(config)) return config;
    const out = { ...config };

    // Permissions (legacy first, native last). Only strip legacy keys when
    // there was something to canonicalize; otherwise leave them verbatim.
    const permRules = getPermissionsArray(config);
    if (permRules.length > 0 || Array.isArray(config.permissions)) {
        out.permissions = permRules;
        delete out.permission;
        // `tools: false` entries became deny rules above; explicit `true`
        // entries are v1 defaults — preserved verbatim for v1 readers.
        if (isPlainObject(out.tools)) {
            const trues = {};
            for (const [k, v] of Object.entries(out.tools)) {
                if (v !== false) trues[k] = v;
            }
            if (Object.keys(trues).length > 0) out.tools = trues;
            else delete out.tools;
        } else {
            delete out.tools;
        }
    }

    // Agents
    const agents = getAgentsMap(config);
    if (Object.keys(agents).length > 0 || config.agents !== undefined || config.agent !== undefined || config.mode !== undefined) {
        out.agents = agents;
    }
    delete out.agent;
    delete out.mode;

    // Commands
    const commands = getCommandsMap(config);
    if (Object.keys(commands).length > 0 || config.commands !== undefined || config.command !== undefined) {
        out.commands = commands;
    }
    delete out.command;

    // Snapshots
    if (out.snapshot !== undefined && out.snapshots === undefined) {
        out.snapshots = out.snapshot;
    }
    delete out.snapshot;

    // Media
    if (out.attachment !== undefined && out.media === undefined) {
        out.media = out.attachment;
    }
    delete out.attachment;

    // MCP
    if (isPlainObject(out.mcp)) {
        const servers = getMcpServersMap(config);
        const timeout = getMcpTimeoutDefaults(config);
        // Preserve unknown mcp-level keys verbatim; flat V1 server entries
        // move under `servers` (their names are exactly the merged server map).
        const nextMcp = { ...out.mcp };
        // Flat V1 entries move under `servers` (getMcpServersMap never yields
        // the reserved `servers`/`timeout` names, so this is exact).
        for (const name of Object.keys(servers)) {
            delete nextMcp[name];
        }
        delete nextMcp.servers;
        delete nextMcp.timeout;
        nextMcp.servers = servers;
        if (Object.keys(timeout).length > 0) nextMcp.timeout = timeout;
        out.mcp = nextMcp;
    }

    // Skills
    if (out.skills !== undefined) {
        out.skills = normalizeSkillsToV2(out.skills);
    }

    // References
    if (out.reference !== undefined && out.references === undefined) {
        out.references = out.reference;
    }
    delete out.reference;

    // Providers
    const providers = getProvidersMap(config);
    if (Object.keys(providers).length > 0 || config.providers !== undefined || config.provider !== undefined) {
        out.providers = providers;
    }
    delete out.provider;
    if (isPlainObject(out.model) && out.model.providers !== undefined) {
        const m = { ...out.model };
        delete m.providers;
        if (Object.keys(m).length > 0) out.model = m;
        else delete out.model;
    }

    // Plugins
    const plugins = normalizePluginsToV2(config);
    if (plugins !== undefined) out.plugins = plugins;
    delete out.plugin;

    // autoupdate -> update (keep both: V2 accepts V1 syntax without warning for this field)
    if (out.autoupdate !== undefined && out.update === undefined) {
        const mapped = autoupdateToUpdate(out.autoupdate);
        if (mapped !== undefined) out.update = mapped;
    }

    // subagent_depth -> experimental.subagent_depth (top-level is ignored in V2)
    if (out.subagent_depth !== undefined) {
        out.experimental = isPlainObject(out.experimental) ? { ...out.experimental } : {};
        if (out.experimental.subagent_depth === undefined) {
            out.experimental.subagent_depth = out.subagent_depth;
        }
        delete out.subagent_depth;
    }

    // small_model is accepted by V2 without warning; also surface as agents.title.model
    // when the user hasn't set one explicitly (canonical read helper covers it).
    return out;
}

// Reverse: canonical (V2) -> V1 shape for fallback writes.
function denormalizeToV1(canonical) {
    if (!isPlainObject(canonical)) return canonical;
    const out = { ...canonical };

    if (Array.isArray(out.permissions)) {
        out.permission = permissionRulesToMap(out.permissions);
        delete out.permissions;
    }
    if (isPlainObject(out.agents)) {
        out.agent = agentsMapToV1(out.agents);
        delete out.agents;
    }
    if (isPlainObject(out.commands)) {
        out.command = commandsMapToV1(out.commands);
        delete out.commands;
    }
    if (out.snapshots !== undefined && out.snapshot === undefined) {
        out.snapshot = out.snapshots;
        delete out.snapshots;
    }
    if (isPlainObject(out.media) && out.attachment === undefined) {
        out.attachment = out.media;
        delete out.media;
    }
    if (isPlainObject(out.mcp)) {
        const flat = {};
        const servers = isPlainObject(out.mcp.servers) ? out.mcp.servers : {};
        for (const [name, entry] of Object.entries(servers)) {
            flat[name] = denormalizeMcpEntryToV1(entry);
        }
        // Preserve global timeouts: a single catalog==execution value becomes
        // the V1 number form, anything else is kept verbatim (never dropped).
        const timeout = out.mcp.timeout;
        const next = { ...flat };
        if (timeout !== undefined) {
            if (isPlainObject(timeout) && typeof timeout.catalog === 'number' && timeout.catalog === timeout.execution
                && timeout.startup === undefined) {
                next.timeout = timeout.catalog;
            } else {
                next.timeout = deepClone(timeout);
            }
        }
        out.mcp = next;
        if (isPlainObject(timeout) && typeof timeout.catalog === 'number' && timeout.catalog === timeout.execution) {
            // V1 understands a single global number via experimental.mcp_timeout.
            out.experimental = isPlainObject(out.experimental) ? { ...out.experimental } : {};
            if (out.experimental.mcp_timeout === undefined) out.experimental.mcp_timeout = timeout.catalog;
        }
    }
    if (Array.isArray(out.skills)) {
        // V1 skills object: heuristically split URLs vs paths.
        const paths = [];
        const urls = [];
        for (const s of out.skills) {
            if (/^https?:\/\//.test(s)) urls.push(s);
            else paths.push(s);
        }
        out.skills = { paths, urls };
    }
    if (out.references !== undefined && out.reference === undefined) {
        out.reference = out.references;
        delete out.references;
    }
    if (isPlainObject(out.providers)) {
        const provider = {};
        for (const [id, entry] of Object.entries(out.providers)) {
            provider[id] = denormalizeProviderEntryToV1(entry);
        }
        out.provider = provider;
        delete out.providers;
    }
    if (Array.isArray(out.plugins)) {
        out.plugin = out.plugins.map((entry) => {
            if (isPlainObject(entry) && entry.package !== undefined) {
                if (entry.options !== undefined) return [entry.package, entry.options];
                return entry.package;
            }
            return entry;
        });
        delete out.plugins;
    }
    if (out.update !== undefined && out.autoupdate === undefined) {
        if (out.update === 'disable') out.autoupdate = false;
        else if (out.update === 'notify') out.autoupdate = 'notify';
        else if (out.update === 'auto') out.autoupdate = true;
    }
    if (isPlainObject(out.experimental) && out.experimental.subagent_depth !== undefined && out.subagent_depth === undefined) {
        out.subagent_depth = out.experimental.subagent_depth;
    }
    return out;
}

function denormalizeMcpEntryToV1(entry) {
    if (!isPlainObject(entry)) return entry;
    const out = { ...entry };
    if (out.disabled !== undefined && out.enabled === undefined) {
        out.enabled = !out.disabled;
    }
    delete out.disabled;
    if (isPlainObject(out.timeout) && typeof out.timeout.catalog === 'number' && typeof out.timeout.execution === 'number' && out.timeout.catalog === out.timeout.execution) {
        out.timeout = out.timeout.catalog;
    }
    if (isPlainObject(out.oauth)) {
        const reversed = { ...out.oauth };
        for (const [v1Key, v2Key] of Object.entries(V1_TO_V2_OAUTH)) {
            if (reversed[v2Key] !== undefined && reversed[v1Key] === undefined) {
                reversed[v1Key] = reversed[v2Key];
                delete reversed[v2Key];
            }
        }
        out.oauth = reversed;
    }
    return out;
}

function denormalizeProviderEntryToV1(entry) {
    if (!isPlainObject(entry)) return entry;
    const out = { ...entry };
    if (out.package !== undefined && out.npm === undefined) {
        out.npm = v2PackageToV1Npm(out.package);
        delete out.package;
    }
    if (isPlainObject(out.settings)) {
        const { baseURL, apiKey, timeout, headerTimeout, chunkTimeout, setCacheKey, ...rest } = out.settings;
        const options = isPlainObject(out.options) ? { ...out.options } : {};
        if (baseURL !== undefined && out.api === undefined) out.api = baseURL;
        if (apiKey !== undefined && options.apiKey === undefined) options.apiKey = apiKey;
        if (timeout !== undefined && options.timeout === undefined) options.timeout = timeout;
        if (headerTimeout !== undefined && options.headerTimeout === undefined) options.headerTimeout = headerTimeout;
        if (chunkTimeout !== undefined && options.chunkTimeout === undefined) options.chunkTimeout = chunkTimeout;
        if (setCacheKey !== undefined && options.setCacheKey === undefined) options.setCacheKey = setCacheKey;
        Object.assign(options, rest);
        if (Object.keys(options).length > 0) out.options = options;
        delete out.settings;
    }
    // Top-level V2 `headers`/`body` have no V1 field: fold copies into the
    // V1 `options` bag so v1 readers see them (kept verbatim too, never dropped).
    for (const bagKey of ['headers', 'body']) {
        if (isPlainObject(out[bagKey])) {
            out.options = isPlainObject(out.options) ? { ...out.options } : {};
            if (out.options[bagKey] === undefined) out.options[bagKey] = deepClone(out[bagKey]);
        }
    }
    if (isPlainObject(out.models)) {
        const models = {};
        for (const [key, model] of Object.entries(out.models)) {
            models[key] = denormalizeModelToV1(model);
        }
        out.models = models;
    }
    return out;
}

function denormalizeModelToV1(model) {
    if (!isPlainObject(model)) return model;
    const out = { ...model };
    if (out.modelID !== undefined && out.id === undefined) {
        out.id = out.modelID;
        delete out.modelID;
    }
    if (isPlainObject(out.capabilities)) {
        if (out.capabilities.tools !== undefined && out.tool_call === undefined) {
            out.tool_call = out.capabilities.tools !== false;
        }
        if ((out.capabilities.input || out.capabilities.output) && out.modalities === undefined) {
            out.modalities = { input: out.capabilities.input, output: out.capabilities.output };
        }
        delete out.capabilities;
    }
    if (out.disabled === true) {
        out.status = 'deprecated';
        delete out.disabled;
    }
    if (isPlainObject(out.cost) && isPlainObject(out.cost.cache)) {
        if (out.cost.cache.read !== undefined) out.cost.cache_read = out.cost.cache.read;
        if (out.cost.cache.write !== undefined) out.cost.cache_write = out.cost.cache.write;
        delete out.cost.cache;
    }
    // Model `settings` (native) wins; legacy `options` fills gaps.
    if (isPlainObject(out.settings)) {
        const options = isPlainObject(out.options) ? { ...out.options } : {};
        for (const [k, v] of Object.entries(out.settings)) {
            if (options[k] === undefined) options[k] = v;
        }
        if (Object.keys(options).length > 0) out.options = options;
        delete out.settings;
    }
    // Same top-level `headers`/`body` fold as providers (see above).
    for (const bagKey of ['headers', 'body']) {
        if (isPlainObject(out[bagKey])) {
            out.options = isPlainObject(out.options) ? { ...out.options } : {};
            if (out.options[bagKey] === undefined) out.options[bagKey] = deepClone(out[bagKey]);
        }
    }
    if (Array.isArray(out.variants)) {
        const obj = {};
        for (const v of out.variants) {
            if (isPlainObject(v) && v.id) {
                const { id, settings, ...rest } = v;
                // V2 `settings` flattens back into the V1 flat option bag so
                // object→array→object round-trips are stable. Explicit
                // top-level keys win on conflict.
                const flat = isPlainObject(settings) ? { ...settings } : {};
                for (const [k, val] of Object.entries(rest)) {
                    if (flat[k] === undefined) flat[k] = val;
                }
                if (settings !== undefined && !isPlainObject(settings)) flat.settings = settings;
                obj[id] = flat;
            }
        }
        out.variants = obj;
    }
    return out;
}

// Prepare a config object for writing to disk in the target shape.
// - target v2: V2-native keys (legacy aliases removed to avoid precedence confusion).
// - target v1: legacy keys (native keys removed).
// Unknown keys are preserved verbatim.
function forWrite(config, target) {
    const shape = target === 'v1' || target === 'v2' ? target : getTargetShape(target);
    if (shape === 'v1') {
        const canonical = normalizeToCanonical(config);
        return denormalizeToV1(canonical);
    }
    return normalizeToCanonical(config);
}

// Read helpers that accept either shape (for endpoints that peek at one section).
function readPermissions(config) {
    return getPermissionsArray(config);
}

function readMcpServers(config) {
    return getMcpServersMap(config);
}

function readProviders(config) {
    return getProvidersMap(config);
}

function readAgents(config) {
    return getAgentsMap(config);
}

function readCommands(config) {
    return getCommandsMap(config);
}

function readUpdatePolicy(config) {
    if (!isPlainObject(config)) return undefined;
    if (config.update !== undefined) return config.update;
    return autoupdateToUpdate(config.autoupdate);
}

function readSnapshotsEnabled(config) {
    if (!isPlainObject(config)) return undefined;
    if (config.snapshots !== undefined) return config.snapshots;
    if (config.snapshot !== undefined) return config.snapshot;
    return undefined;
}

function readSubagentDepth(config) {
    if (!isPlainObject(config)) return undefined;
    if (isPlainObject(config.experimental) && config.experimental.subagent_depth !== undefined) {
        return config.experimental.subagent_depth;
    }
    return config.subagent_depth;
}

module.exports = {
    V1_TO_V2_ACTION,
    V1_TO_V2_PROVIDER_ID,
    detectOpencodeVersion,
    detectDesktopVersion,
    resolveRuntimeTarget,
    readVersionFromAppUpdateYml,
    getTargetShape,
    inferTargetFromConfig,
    normalizeToCanonical,
    denormalizeToV1,
    forWrite,
    readPermissions,
    readMcpServers,
    readProviders,
    readAgents,
    readCommands,
    readUpdatePolicy,
    readSnapshotsEnabled,
    readSubagentDepth,
    permissionMapToRules,
    permissionRulesToMap,
    toolsMapToRules,
    joinModelVariant,
    splitModelVariant,
    canonicalProviderId,
    v1NpmToV2Package,
    normalizeSkillsToV2,
    normalizePluginsToV2,
    autoupdateToUpdate,
};
