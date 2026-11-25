import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import compat from './opencode-compat.js';
import linkedSync from './linked-sync.js';

function makeRemoteCatalog({ models, enabledProviders } = {}) {
    const cfg = {
        $schema: 'https://opencode.ai/config.json',
        provider: {
            battlemage: {
                npm: '@ai-sdk/openai-compatible',
                name: 'Battlemage (all models)',
                options: {
                    baseURL: 'http://100.91.253.103:8800/v1',
                    apiKey: '',
                    timeout: 1800000,
                    chunkTimeout: 1800000,
                },
                models,
            },
        },
    };
    if (enabledProviders) cfg.enabled_providers = enabledProviders;
    return cfg;
}

const OLD_MODELS = {
    'dsv4-flash': {
        name: 'DeepSeek-V4-Flash',
        tool_call: true,
        reasoning: true,
        interleaved: { field: 'reasoning_content' },
        vision: false,
        modalities: { input: ['text'], output: ['text'] },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
        limit: { context: 98304, output: 32768 },
        live_status: 'idle',
    },
    'bonsai-27b': {
        name: 'Ternary Bonsai 27B',
        tool_call: true,
        reasoning: true,
        interleaved: { field: 'reasoning_content' },
        vision: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
        limit: { context: 262144, output: 32768 },
        live_status: 'idle',
    },
    'sage-a15': {
        name: 'Sage-A1.5',
        tool_call: true,
        reasoning: true,
        interleaved: { field: 'reasoning_content' },
        vision: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
        limit: { context: 115712, output: 32768 },
        live_status: 'serving',
    },
};

const NEW_MODELS = {
    'dsv41-flash': {
        name: 'DeepSeek-V4.1-Flash-1017',
        tool_call: true,
        reasoning: true,
        interleaved: { field: 'reasoning_content' },
        vision: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
        limit: { context: 131072, output: 32768 },
        live_status: 'idle',
    },
    'bonsai-27b': {
        name: 'Ternary Bonsai 2 27B',
        tool_call: true,
        reasoning: true,
        interleaved: { field: 'reasoning_content' },
        vision: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
        limit: { context: 262144, output: 32768 },
        live_status: 'idle',
    },
    'sage-a15': {
        name: 'Sage-A1.5',
        tool_call: true,
        reasoning: true,
        interleaved: { field: 'reasoning_content' },
        vision: true,
        modalities: { input: ['text', 'image'], output: ['text'] },
        variants: { low: { reasoningEffort: 'low' }, high: { reasoningEffort: 'high' } },
        limit: { context: 115712, output: 32768 },
        live_status: 'idle', // flipped serving -> idle
    },
};

describe('linked-sync canonical diffing (v2.9.19 regression fixes)', () => {
    it.each(['v1', 'v2'])('removes retired models and updates changed models cleanly on %s target without false overrides', (target) => {
        const remoteOld = makeRemoteCatalog({ models: OLD_MODELS, enabledProviders: ['battlemage'] });
        const remoteNew = makeRemoteCatalog({ models: NEW_MODELS, enabledProviders: ['battlemage'] });

        // Simulate Sync #1: written to disk via compat.forWrite(target)
        const writtenDisk = compat.forWrite(remoteOld, target);
        const savedBaseline = linkedSync.stripVolatileCanonical(remoteOld);

        // Simulate Sync #2 with identical remote (even if live_status flipped): zero overrides, zero spurious diffs
        const noop = linkedSync.mergeRemoteConfig(writtenDisk, remoteOld, savedBaseline);
        expect(noop.overrides.count).toBe(0);
        expect(noop.removedModels).toEqual([]);
        expect(noop.addedModels).toEqual([]);
        expect(linkedSync.canonicalEqual(compat.forWrite(noop.merged, target), writtenDisk)).toBe(true);

        // Simulate Sync #3 after BattleMage retires dsv4-flash, updates bonsai-27b, adds dsv41-flash
        const res = linkedSync.mergeRemoteConfig(writtenDisk, remoteNew, savedBaseline);
        expect(res.overrides.count).toBe(0);
        expect(res.removedModels).toEqual(['dsv4-flash']);
        expect(res.addedModels).toEqual(['dsv41-flash']);
        expect(res.updatedModels).toEqual(['bonsai-27b']);
        expect(res.merged.providers.battlemage.models['dsv4-flash']).toBeUndefined();
        expect(res.merged.providers.battlemage.models['dsv41-flash'].name).toBe('DeepSeek-V4.1-Flash-1017');
        expect(res.merged.providers.battlemage.models['bonsai-27b'].name).toBe('Ternary Bonsai 2 27B');
        expect(res.merged.enabled_providers).toEqual(['battlemage']);
        expect(res.modelCount).toBe(3);
    });

    it('handles V1-shaped disk file compared against V2 canonical baseline (runtime upgrade V1->V2)', () => {
        const remoteOld = makeRemoteCatalog({ models: OLD_MODELS });
        const remoteNew = makeRemoteCatalog({ models: NEW_MODELS });
        const diskV1 = compat.forWrite(remoteOld, 'v1');
        // Even if the baseline was stored in raw V1 shape (legacy) or V2 shape:
        const res = linkedSync.mergeRemoteConfig(diskV1, remoteNew, remoteOld);
        expect(res.overrides.count).toBe(0);
        expect(res.merged.providers.battlemage.models['dsv4-flash']).toBeUndefined();
        expect(res.merged.providers.battlemage.models['dsv41-flash']).toBeDefined();
        expect(res.merged.providers.battlemage.models['bonsai-27b'].name).toBe('Ternary Bonsai 2 27B');
    });

    it('heals poisoned v2.9.16-v2.9.18 profiles while preserving apiKey, unmanaged providers, MCPs, agents, and settings', () => {
        const remoteOld = makeRemoteCatalog({ models: OLD_MODELS });
        const remoteNew = makeRemoteCatalog({ models: NEW_MODELS });

        // User's poisoned v2.9.18 disk config: old models stuck in V2 shape + user's own settings
        const poisonedDisk = compat.forWrite({
            ...compat.normalizeToCanonical(remoteOld),
            theme: 'catppuccin',
            mcp: { servers: { asana: { type: 'remote', url: 'https://mcp.asana.com/v2/mcp' } } },
            agents: { reviewer: { system: 'Review carefully', mode: 'subagent' } },
        }, 'v2');
        poisonedDisk.providers.battlemage.settings.apiKey = 'bm-user-secret-key';
        poisonedDisk.providers.openai = { settings: { apiKey: 'sk-custom' }, models: { 'gpt-custom': { name: 'Custom' } } };

        // Poisoned legacy marker (no syncSchemaVersion, lastSyncedCatalog already overwritten with remoteNew!)
        const legacySource = { configUrl: 'https://battlemage.tail06281.ts.net/opencode-studio/public.json', lastSyncedCatalog: remoteNew };
        expect(linkedSync.needsSchemaHealing(legacySource)).toBe(true);

        const healed = linkedSync.mergeRemoteConfig(poisonedDisk, remoteNew, legacySource.lastSyncedCatalog, {
            forceManagedProviders: true,
        });

        expect(healed.merged.providers.battlemage.models['dsv4-flash']).toBeUndefined();
        expect(healed.merged.providers.battlemage.models['dsv41-flash']).toBeDefined();
        expect(healed.merged.providers.battlemage.models['bonsai-27b'].name).toBe('Ternary Bonsai 2 27B');
        // Preserved user state:
        expect(healed.merged.providers.battlemage.settings.apiKey).toBe('bm-user-secret-key');
        expect(healed.merged.providers.openai.settings.apiKey).toBe('sk-custom');
        expect(healed.merged.mcp.servers.asana.url).toBe('https://mcp.asana.com/v2/mcp');
        expect(healed.merged.agents.reviewer.system).toBe('Review carefully');
        expect(healed.merged.theme).toBe('catppuccin');
    });

    it('preserves genuine user overrides on syncSchemaVersion=2 while still syncing untouched models', () => {
        const remoteOld = makeRemoteCatalog({ models: OLD_MODELS });
        const remoteNew = makeRemoteCatalog({ models: NEW_MODELS });
        const baseline = linkedSync.stripVolatileCanonical(remoteOld);

        const localV2 = compat.forWrite(remoteOld, 'v2');
        // User intentionally tweaks sage-a15 context limit and adds a custom model
        localV2.providers.battlemage.models['sage-a15'].limit.context = 65536;
        localV2.providers.battlemage.models['my-custom-lora'] = { name: 'My Custom LoRA', limit: { context: 32768, output: 4096 } };
        localV2.providers.battlemage.settings.apiKey = 'bm-my-key';

        const res = linkedSync.mergeRemoteConfig(localV2, remoteNew, baseline, { forceManagedProviders: false });
        expect(res.overrides.count).toBe(2);
        // Untouched retired model removed:
        expect(res.merged.providers.battlemage.models['dsv4-flash']).toBeUndefined();
        // Untouched updated model updated:
        expect(res.merged.providers.battlemage.models['bonsai-27b'].name).toBe('Ternary Bonsai 2 27B');
        // New catalog model added:
        expect(res.merged.providers.battlemage.models['dsv41-flash']).toBeDefined();
        // Genuine user edits preserved:
        expect(res.merged.providers.battlemage.models['sage-a15'].limit.context).toBe(65536);
        expect(res.merged.providers.battlemage.models['my-custom-lora'].name).toBe('My Custom LoRA');
        expect(res.merged.providers.battlemage.settings.apiKey).toBe('bm-my-key');
    });

    it('prunes orphaned catalog models carrying live_status even when baseline omitted them', () => {
        const remoteNew = makeRemoteCatalog({ models: NEW_MODELS });
        const localV2 = compat.forWrite(makeRemoteCatalog({ models: OLD_MODELS }), 'v2');
        // Baseline has no dsv4-flash, simulating a lost baseline, yet dsv4-flash carries live_status
        const res = linkedSync.mergeRemoteConfig(localV2, remoteNew, linkedSync.stripVolatileCanonical(remoteNew), {
            forceManagedProviders: false,
        });
        expect(res.merged.providers.battlemage.models['dsv4-flash']).toBeUndefined();
    });

    it('resolves BattleMage catalog fallback URLs between tailnet and hub.havsys.com', () => {
        expect(linkedSync.resolveCatalogFallbackUrls('https://battlemage.tail06281.ts.net/opencode-studio/public.json')).toEqual([
            'https://battlemage.tail06281.ts.net/opencode-studio/public.json',
            'https://hub.havsys.com/opencode-studio/public.json',
        ]);
        expect(linkedSync.resolveCatalogFallbackUrls('https://battlemage.tail06281.ts.net/opencode-studio/confidential.json')).toEqual([
            'https://battlemage.tail06281.ts.net/opencode-studio/confidential.json',
            'https://hub.havsys.com/opencode-studio/private.json',
        ]);
        expect(linkedSync.resolveCatalogFallbackUrls('https://example.com/custom.json')).toEqual([
            'https://example.com/custom.json',
        ]);
    });

    it('resolves opencode.json, opencode.jsonc, and dual .json/.jsonc profile config paths', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-paths-'));
        try {
            expect(linkedSync.resolveProfileConfigPaths(dir)).toEqual({
                primaryPath: path.join(dir, 'opencode.json'),
                siblingPath: null,
            });
            fs.writeFileSync(path.join(dir, 'opencode.jsonc'), '{}');
            expect(linkedSync.resolveProfileConfigPaths(dir)).toEqual({
                primaryPath: path.join(dir, 'opencode.jsonc'),
                siblingPath: null,
            });
            fs.writeFileSync(path.join(dir, 'opencode.json'), '{}');
            expect(linkedSync.resolveProfileConfigPaths(dir)).toEqual({
                primaryPath: path.join(dir, 'opencode.json'),
                siblingPath: path.join(dir, 'opencode.jsonc'),
            });
        } finally {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });
});
