// Canonical, shape-independent linked-profile catalog sync.
//
// Background (v2.9.16-v2.9.18 bug):
// BattleMage serves V1-shaped configs (`provider`, `tool_call`, `modalities`,
// object `variants`). Studio wrote `opencode.json` via `compat.forWrite()`
// (which converts to V2 shape on OpenCode V2 and reorders keys / moves
// `options.baseURL` -> `api` on V1), while saving raw V1 `remoteConfig` as
// `lastSyncedCatalog`. Subsequent syncs compared `JSON.stringify(localM)` vs
// `JSON.stringify(baseM)` — always returning `false`, flagging every untouched
// model as a user override, never removing retired models, and poisoning
// `lastSyncedCatalog` with newer catalogs while stale models remained on disk.
//
// Fix (syncSchemaVersion = 2):
// 1. Canonicalize local, remote, and baseline configs through
//    `compat.normalizeToCanonical()` before diffing, strip volatile fields
//    (`apiKey`, `live_status`), and compare with key-order-independent
//    `stableStringify()`.
// 2. Store canonicalized `lastSyncedCatalog` + `syncSchemaVersion: 2` in
//    `.ocs-linked-source.json`.
// 3. Automatically run a one-time managed-provider refresh when upgrading
//    profiles with `syncSchemaVersion < 2` so poisoned v2.9.16-v2.9.18
//    profiles self-heal on first launch while preserving API keys, unmanaged
//    providers, MCP servers, agents, commands, skills, and settings.
// 4. Support `opencode.jsonc` (via jsonc-parser) and dual `.json` + `.jsonc`
//    profile directories so stale models in a sibling `.jsonc` cannot shadow
//    synced updates.
'use strict';

const fs = require('fs');
const path = require('path');
const compat = require('./opencode-compat');

const LINKED_SYNC_SCHEMA_VERSION = 2;

const isPlainObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

const deepClone = (v) => {
    if (v === undefined) return undefined;
    return JSON.parse(JSON.stringify(v));
};

function canonicalizeValue(v) {
    if (Array.isArray(v)) {
        return v.map(canonicalizeValue);
    }
    if (isPlainObject(v)) {
        const out = {};
        for (const key of Object.keys(v).sort()) {
            if (v[key] !== undefined) {
                out[key] = canonicalizeValue(v[key]);
            }
        }
        return out;
    }
    return v;
}

function stableStringify(value) {
    return JSON.stringify(canonicalizeValue(value));
}

function canonicalEqual(a, b) {
    return stableStringify(a) === stableStringify(b);
}

function providerApiKeyOf(prov) {
    if (!isPlainObject(prov)) return undefined;
    if (isPlainObject(prov.settings) && typeof prov.settings.apiKey === 'string' && prov.settings.apiKey.length > 0) {
        return prov.settings.apiKey;
    }
    if (isPlainObject(prov.options) && typeof prov.options.apiKey === 'string' && prov.options.apiKey.length > 0) {
        return prov.options.apiKey;
    }
    return undefined;
}

function stripVolatileModel(model) {
    if (!isPlainObject(model)) return deepClone(model);
    const clone = deepClone(model);
    delete clone.live_status;
    return clone;
}

function stripVolatileProvider(prov) {
    if (!isPlainObject(prov)) return deepClone(prov);
    const clone = deepClone(prov);
    if (isPlainObject(clone.settings)) {
        delete clone.settings.apiKey;
        if (Object.keys(clone.settings).length === 0) delete clone.settings;
    }
    if (isPlainObject(clone.options)) {
        delete clone.options.apiKey;
        if (Object.keys(clone.options).length === 0) delete clone.options;
    }
    if (isPlainObject(clone.models)) {
        const cleanModels = {};
        for (const [mid, m] of Object.entries(clone.models)) {
            cleanModels[mid] = stripVolatileModel(m);
        }
        clone.models = cleanModels;
    }
    return clone;
}

function stripVolatileCanonical(config) {
    if (!isPlainObject(config)) return {};
    const canonical = compat.normalizeToCanonical(config);
    const clone = deepClone(canonical);
    if (isPlainObject(clone.providers)) {
        const cleanProviders = {};
        for (const [pid, prov] of Object.entries(clone.providers)) {
            cleanProviders[pid] = stripVolatileProvider(prov);
        }
        clone.providers = cleanProviders;
    }
    return clone;
}

function needsSchemaHealing(source) {
    if (!isPlainObject(source)) return true;
    return typeof source.syncSchemaVersion !== 'number' || source.syncSchemaVersion < LINKED_SYNC_SCHEMA_VERSION;
}

function resolveCatalogFallbackUrls(configUrl) {
    if (typeof configUrl !== 'string' || !configUrl.trim()) return [];
    const primary = configUrl.trim();
    const urls = [primary];
    try {
        const parsed = new URL(primary);
        if (parsed.pathname.startsWith('/opencode-studio/')) {
            const filename = parsed.pathname.slice('/opencode-studio/'.length);
            const canonicalFile = filename === 'confidential.json' ? 'private.json' : filename;
            if (parsed.hostname === 'battlemage.tail06281.ts.net') {
                urls.push(`https://hub.havsys.com/opencode-studio/${canonicalFile}`);
            } else if (parsed.hostname === 'hub.havsys.com') {
                urls.push(`https://battlemage.tail06281.ts.net/opencode-studio/${canonicalFile}`);
            }
        }
    } catch {
        // Non-URL or custom scheme: keep primary only
    }
    return [...new Set(urls)];
}

function resolveProfileConfigPaths(profileDir) {
    const jsonPath = path.join(profileDir, 'opencode.json');
    const jsoncPath = path.join(profileDir, 'opencode.jsonc');
    const hasJson = fs.existsSync(jsonPath);
    const hasJsonc = fs.existsSync(jsoncPath);
    if (hasJson && hasJsonc) {
        return { primaryPath: jsonPath, siblingPath: jsoncPath };
    }
    if (hasJsonc) {
        return { primaryPath: jsoncPath, siblingPath: null };
    }
    return { primaryPath: jsonPath, siblingPath: null };
}

function providerHasOnlyCatalogModels(prov) {
    if (!isPlainObject(prov) || !isPlainObject(prov.models)) return false;
    const entries = Object.values(prov.models);
    if (entries.length === 0) return false;
    return entries.every((m) => isPlainObject(m) && m.live_status !== undefined);
}

/**
 * Layered, shape-independent catalog merge in canonical V2 space.
 *
 * Returns `{ merged, overrides: { count }, addedModels, removedModels, updatedModels, modelCount }`
 * where `merged` is in canonical V2 shape (ready for `compat.forWrite(merged, target)`).
 */
function mergeRemoteConfig(localConfig, remoteConfig, lastSyncedCatalog, { forceManagedProviders = false } = {}) {
    const localCanon = isPlainObject(localConfig) ? compat.normalizeToCanonical(localConfig) : {};
    const remoteCanon = isPlainObject(remoteConfig) ? compat.normalizeToCanonical(remoteConfig) : {};
    const baseCanon = isPlainObject(lastSyncedCatalog) ? compat.normalizeToCanonical(lastSyncedCatalog) : null;

    const localProviders = isPlainObject(localCanon.providers) ? localCanon.providers : {};
    const remoteProviders = isPlainObject(remoteCanon.providers) ? remoteCanon.providers : {};
    const baseProviders = isPlainObject(baseCanon?.providers) ? baseCanon.providers : {};

    const managedIds = new Set([
        ...Object.keys(remoteProviders),
        ...Object.keys(baseProviders),
    ]);

    const merged = deepClone(localCanon);
    if (!merged.$schema && remoteCanon.$schema) {
        merged.$schema = remoteCanon.$schema;
    }
    const nextProviders = deepClone(localProviders);

    let overrideCount = 0;
    const addedModels = [];
    const removedModels = [];
    const updatedModels = [];

    for (const id of managedIds) {
        const localProv = localProviders[id];
        const baseProv = baseProviders[id];
        const remoteProv = remoteProviders[id];

        if (!remoteProv) {
            if (!localProv) continue;
            if (forceManagedProviders) {
                delete nextProviders[id];
                for (const mid of Object.keys(localProv.models || {})) {
                    removedModels.push(`${id}/${mid}`);
                }
                continue;
            }
            const unmodifiedFromBase = baseProv
                && canonicalEqual(stripVolatileProvider(localProv), stripVolatileProvider(baseProv));
            const orphanedCatalog = !baseProv && providerHasOnlyCatalogModels(localProv);
            if (unmodifiedFromBase || orphanedCatalog) {
                delete nextProviders[id];
                for (const mid of Object.keys(localProv.models || {})) {
                    removedModels.push(`${id}/${mid}`);
                }
            } else {
                overrideCount++;
            }
            continue;
        }

        const next = deepClone(remoteProv);
        const localKey = providerApiKeyOf(localProv);
        const localModels = isPlainObject(localProv?.models) ? localProv.models : {};
        const baseModels = isPlainObject(baseProv?.models) ? baseProv.models : {};
        const remoteModels = isPlainObject(remoteProv.models) ? remoteProv.models : {};

        if (forceManagedProviders) {
            for (const mid of Object.keys(remoteModels)) {
                if (!localModels[mid]) addedModels.push(mid);
                else if (!canonicalEqual(stripVolatileModel(localModels[mid]), stripVolatileModel(remoteModels[mid]))) {
                    updatedModels.push(mid);
                }
            }
            for (const mid of Object.keys(localModels)) {
                if (!remoteModels[mid]) removedModels.push(mid);
            }
            if (localKey) {
                next.settings = { ...(isPlainObject(next.settings) ? next.settings : {}), apiKey: localKey };
            }
            nextProviders[id] = next;
            continue;
        }

        // Layered model-level merge in canonical V2 space.
        const nextModels = deepClone(remoteModels);
        const allModelIds = new Set([...Object.keys(localModels), ...Object.keys(remoteModels)]);

        for (const modelId of allModelIds) {
            const localM = localModels[modelId];
            const baseM = baseModels[modelId];
            const remoteM = remoteModels[modelId];

            if (!localM) {
                addedModels.push(modelId);
                continue;
            }
            if (!remoteM) {
                const unmodifiedFromBase = baseM
                    && canonicalEqual(stripVolatileModel(localM), stripVolatileModel(baseM));
                const orphanedCatalogModel = !baseM && isPlainObject(localM) && localM.live_status !== undefined;
                if (unmodifiedFromBase || orphanedCatalogModel) {
                    delete nextModels[modelId];
                    removedModels.push(modelId);
                } else {
                    nextModels[modelId] = deepClone(localM);
                    overrideCount++;
                }
                continue;
            }

            const localClean = stripVolatileModel(localM);
            const remoteClean = stripVolatileModel(remoteM);
            const baseClean = baseM ? stripVolatileModel(baseM) : null;

            if (baseClean && canonicalEqual(localClean, baseClean)) {
                nextModels[modelId] = deepClone(remoteM);
                if (!canonicalEqual(remoteClean, baseClean)) {
                    updatedModels.push(modelId);
                }
            } else if (!baseClean && canonicalEqual(localClean, remoteClean)) {
                nextModels[modelId] = deepClone(remoteM);
            } else if (canonicalEqual(localClean, remoteClean)) {
                // Local already matches the new remote exactly — keep remote and do not flag override.
                nextModels[modelId] = deepClone(remoteM);
            } else {
                nextModels[modelId] = deepClone(localM);
                overrideCount++;
            }
        }

        // Provider-level settings merge (canonical V2 `settings` bag).
        const localSettings = isPlainObject(localProv?.settings) ? localProv.settings : {};
        const baseSettings = isPlainObject(baseProv?.settings) ? baseProv.settings : {};
        const remoteSettings = isPlainObject(remoteProv.settings) ? remoteProv.settings : {};
        const nextSettings = { ...remoteSettings };

        for (const [k, v] of Object.entries(localSettings)) {
            if (k === 'apiKey') {
                if (typeof v === 'string' && v.length > 0) {
                    nextSettings.apiKey = v;
                }
                continue;
            }
            if (baseProv && !canonicalEqual(v, baseSettings[k]) && !canonicalEqual(v, remoteSettings[k])) {
                nextSettings[k] = deepClone(v);
                overrideCount++;
            }
        }
        if (localKey) {
            nextSettings.apiKey = localKey;
        }
        if (Object.keys(nextSettings).length > 0) {
            next.settings = nextSettings;
        } else {
            delete next.settings;
        }

        // Preserve user-customized provider headers/body if added locally.
        for (const bagKey of ['headers', 'body']) {
            if (isPlainObject(localProv?.[bagKey])) {
                const baseBag = isPlainObject(baseProv?.[bagKey]) ? baseProv[bagKey] : undefined;
                const remoteBag = isPlainObject(remoteProv[bagKey]) ? remoteProv[bagKey] : undefined;
                if (!canonicalEqual(localProv[bagKey], baseBag) && !canonicalEqual(localProv[bagKey], remoteBag)) {
                    next[bagKey] = deepClone(localProv[bagKey]);
                    overrideCount++;
                }
            }
        }

        next.models = nextModels;
        nextProviders[id] = next;
    }

    merged.providers = nextProviders;
    delete merged.provider;

    // `enabled_providers`: catalog-managed, respecting genuine local overrides unless forced.
    const localEnabled = localCanon.enabled_providers;
    const baseEnabled = baseCanon ? baseCanon.enabled_providers : undefined;
    const remoteEnabled = remoteCanon.enabled_providers;
    if (forceManagedProviders) {
        if (remoteEnabled !== undefined) merged.enabled_providers = deepClone(remoteEnabled);
        else delete merged.enabled_providers;
    } else {
        const localEditedEnabled = localEnabled !== undefined
            && !canonicalEqual(localEnabled, baseEnabled)
            && !canonicalEqual(localEnabled, remoteEnabled);
        if (localEditedEnabled) {
            merged.enabled_providers = deepClone(localEnabled);
        } else if (remoteEnabled !== undefined) {
            merged.enabled_providers = deepClone(remoteEnabled);
        } else {
            delete merged.enabled_providers;
        }
    }

    let modelCount = 0;
    for (const id of Object.keys(remoteProviders)) {
        const p = nextProviders[id];
        if (isPlainObject(p?.models)) {
            modelCount += Object.keys(p.models).length;
        }
    }

    return {
        merged,
        overrides: { count: overrideCount },
        addedModels,
        removedModels,
        updatedModels,
        modelCount,
    };
}

module.exports = {
    LINKED_SYNC_SCHEMA_VERSION,
    stableStringify,
    canonicalEqual,
    stripVolatileModel,
    stripVolatileProvider,
    stripVolatileCanonical,
    needsSchemaHealing,
    resolveCatalogFallbackUrls,
    resolveProfileConfigPaths,
    mergeRemoteConfig,
};
