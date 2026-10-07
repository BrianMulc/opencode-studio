import { describe, it, expect } from 'vitest';

import * as c from './opencode-compat.js';

describe('permissions compat', () => {
    it('converts v1 permission map to v2 rules with renamed actions', () => {
        const rules = c.readPermissions({ permission: { bash: 'ask', edit: 'allow', task: { general: 'deny' } }, tools: { websearch: false } });
        expect(rules).toContainEqual({ action: 'shell', resource: '*', effect: 'ask' });
        expect(rules).toContainEqual({ action: 'edit', resource: '*', effect: 'allow' });
        expect(rules).toContainEqual({ action: 'subagent', resource: 'general', effect: 'deny' });
        expect(rules).toContainEqual({ action: 'websearch', resource: '*', effect: 'deny' });
    });

    it('native v2 wins over legacy (appended last)', () => {
        const rules = c.readPermissions({ permission: { bash: 'allow' }, permissions: [{ action: 'shell', resource: '*', effect: 'deny' }] });
        expect(rules[rules.length - 1]).toEqual({ action: 'shell', resource: '*', effect: 'deny' });
    });

    it('round-trips v2 array to v1 map', () => {
        const v1 = c.denormalizeToV1({ permissions: [{ action: 'shell', resource: 'git push *', effect: 'ask' }] });
        expect(v1.permission.bash['git push *']).toBe('ask');
        expect(v1.permissions).toBeUndefined();
    });
});

describe('mcp compat', () => {
    it('nests flat map under servers, flips enabled, splits timeout, snake_cases oauth', () => {
        const canonical = c.normalizeToCanonical({
            mcp: { playwright: { type: 'local', command: ['npx', 'x'], enabled: true, timeout: 30000, oauth: { clientId: 'a', callbackPort: 1 } } },
            experimental: { mcp_timeout: 5000 },
        });
        expect(canonical.mcp.servers.playwright.disabled).toBe(false);
        expect(canonical.mcp.servers.playwright.timeout).toEqual({ catalog: 30000, execution: 30000 });
        expect(canonical.mcp.servers.playwright.oauth.client_id).toBe('a');
        expect(canonical.mcp.servers.playwright.oauth.callback_port).toBe(1);
        expect(canonical.mcp.timeout.catalog).toBe(5000);
    });

    it('v2 servers input passes through', () => {
        const canonical = c.normalizeToCanonical({ mcp: { servers: { a: { type: 'remote', url: 'https://x', disabled: true } } } });
        expect(canonical.mcp.servers.a.disabled).toBe(true);
    });
});

describe('providers compat', () => {
    it('renames provider->providers, npm->package with aisdk prefix, api->settings.baseURL', () => {
        const canonical = c.normalizeToCanonical({
            provider: { acme: { npm: '@ai-sdk/openai-compatible', api: 'https://x/v1', options: { apiKey: 'k' } } },
        });
        expect(canonical.providers.acme.package).toBe('aisdk:@ai-sdk/openai-compatible');
        expect(canonical.providers.acme.settings.baseURL).toBe('https://x/v1');
        expect(canonical.providers.acme.settings.apiKey).toBe('k');
        expect(canonical.provider).toBeUndefined();
    });

    it('canonicalizes retired provider ids', () => {
        const canonical = c.normalizeToCanonical({ provider: { 'azure-cognitive-services': {} } });
        expect(canonical.providers.azure).toBeDefined();
    });

    it('normalizes model fields', () => {
        const canonical = c.normalizeToCanonical({
            providers: { openai: { models: { m: { id: 'gpt-1', tool_call: false, cost: { input: 1, output: 2, cache_read: 1 }, variants: { high: {} } } } } },
        });
        const m = canonical.providers.openai.models.m;
        expect(m.modelID).toBe('gpt-1');
        expect(m.capabilities.tools).toBe(false);
        expect(m.cost.cache.read).toBe(1);
        expect(Array.isArray(m.variants)).toBe(true);
        expect(m.variants[0].id).toBe('high');
    });
});

describe('agents/commands compat', () => {
    it('merges agent+mode, renames prompt/disable/variant', () => {
        const agents = c.readAgents({
            agent: { reviewer: { prompt: 'hi', disable: false, model: 'a/b', variant: 'high', temperature: 0.2, permission: { edit: 'deny' } } },
            mode: { old: { prompt: 'x' } },
        });
        expect(agents.reviewer.system).toBe('hi');
        expect(agents.reviewer.disabled).toBe(false);
        expect(agents.reviewer.model).toBe('a/b#high');
        expect(agents.reviewer.request.body.temperature).toBe(0.2);
        expect(agents.old.mode).toBe('primary');
    });

    it('renames command->commands, subtask->subagent', () => {
        const cmds = c.readCommands({ command: { review: { template: 't', subtask: true, model: 'a/b', variant: 'high' } } });
        expect(cmds.review.subagent).toBe(true);
        expect(cmds.review.model).toBe('a/b#high');
    });
});

describe('top-level misc compat', () => {    it('handles snapshot/attachment/skills/reference/plugin/autoupdate/subagent_depth', () => {
        const canonical = c.normalizeToCanonical({
            snapshot: false,
            attachment: { image: { auto_resize: true } },
            skills: { paths: ['./a'], urls: ['https://b'] },
            reference: { docs: '../docs' },
            plugin: ['p', ['./l.ts', { enabled: true }]],
            autoupdate: false,
            subagent_depth: 2,
        });
        expect(canonical.snapshots).toBe(false);
        expect(canonical.media.image.auto_resize).toBe(true);
        expect(canonical.skills).toEqual(['./a', 'https://b']);
        expect(canonical.references.docs).toBe('../docs');
        expect(canonical.plugins).toEqual(['p', { package: './l.ts', options: { enabled: true } }]);
        expect(canonical.update).toBe('disable');
        expect(canonical.experimental.subagent_depth).toBe(2);
        expect(canonical.snapshot).toBeUndefined();
        expect(canonical.subagent_depth).toBeUndefined();
    });
});

describe('preservation (no silent data loss)', () => {
    it('keeps v2-ignored fields verbatim instead of stripping them', () => {
        const canonical = c.normalizeToCanonical({
            logLevel: 'DEBUG',
            server: { port: 4096 },
            compaction: { prune: true, tail_turns: 3 },
            providers: {
                openai: {
                    id: 'openai',
                    whitelist: ['a'],
                    models: {
                        m: { id: 'gpt-1', release_date: '2025-01-01', reasoning: true, status: 'beta' },
                    },
                },
            },
        });
        expect(canonical.logLevel).toBe('DEBUG');
        expect(canonical.server.port).toBe(4096);
        expect(canonical.compaction.prune).toBe(true);
        const m = canonical.providers.openai.models.m;
        expect(m.release_date).toBe('2025-01-01');
        expect(m.reasoning).toBe(true);
        expect(m.status).toBe('beta');
        expect(canonical.providers.openai.whitelist).toEqual(['a']);
    });

    it('merges legacy plugin + native plugins with native winning conflicts', () => {
        const canonical = c.normalizeToCanonical({
            plugin: ['a', 'b'],
            plugins: ['b', { package: './c.ts', options: { x: 1 } }],
        });
        expect(canonical.plugins).toContain('a');
        expect(canonical.plugins).toContain('b');
        expect(canonical.plugins).toContainEqual({ package: './c.ts', options: { x: 1 } });
        expect(canonical.plugin).toBeUndefined();
    });

    it('dedups the same plugin across string and object forms', () => {
        const canonical = c.normalizeToCanonical({
            plugin: ['my-p'],
            plugins: [{ package: 'my-p', options: { strict: true } }],
        });
        expect(canonical.plugins).toEqual([{ package: 'my-p', options: { strict: true } }]);
    });

    it('native model settings/capabilities win over legacy options/tool_call', () => {
        const canonical = c.normalizeToCanonical({
            providers: {
                openai: {
                    options: { apiKey: 'legacy', baseURL: 'https://legacy' },
                    settings: { baseURL: 'https://native' },
                    models: {
                        m: {
                            tool_call: true,
                            capabilities: { tools: false },
                            options: { temperature: 0.1 },
                            settings: { custom: 1 },
                        },
                    },
                },
            },
        });
        const p = canonical.providers.openai;
        expect(p.settings.baseURL).toBe('https://native');
        expect(p.settings.apiKey).toBe('legacy');
        expect(p.settings.custom).toBeUndefined();
        const m = p.models.m;
        expect(m.capabilities.tools).toBe(false);
        expect(m.settings).toEqual({ temperature: 0.1, custom: 1 });
    });

    it('strips model.providers nesting and preserves unknown mcp keys', () => {
        const canonical = c.normalizeToCanonical({
            model: { providers: { anthropic: {} } },
            mcp: { future_flag: true, servers: { a: { type: 'local', command: ['x'] } } },
            skills: { paths: 'oops-not-an-array' },
        });
        expect(canonical.providers.anthropic).toBeDefined();
        expect(canonical.model).toBeUndefined();
        expect(canonical.mcp.servers.a).toBeDefined();
        expect(canonical.mcp.future_flag).toBe(true);
        expect(canonical.skills).toEqual([]);
    });

    it('forWrite targets v1 legacy shape and v2 native shape', () => {        const canonical = {
            permissions: [{ action: 'shell', resource: '*', effect: 'ask' }],
            agents: { r: { system: 'hi', disabled: false } },
            snapshots: true,
            update: 'auto',
        };
        const v1 = c.forWrite(canonical, 'v1');
        expect(v1.permission.bash).toBe('ask');
        expect(v1.agent.r.prompt).toBe('hi');
        expect(v1.snapshot).toBe(true);
        expect(v1.autoupdate).toBe(true);
        const v2 = c.forWrite(v1, 'v2');
        expect(v2.permissions).toContainEqual({ action: 'shell', resource: '*', effect: 'ask' });
        expect(v2.agents.r.system).toBe('hi');
    });
});

describe('triple-check hardening (F1-F5)', () => {
    it('F1: malformed string agent/mode entries pass through verbatim, never char-spread', () => {
        const canonical = c.normalizeToCanonical({ agent: { a: 'str' }, mode: { m: 'str' } });
        expect(canonical.agents.a).toBe('str');
        expect(canonical.agents.m).toBe('str');
        // v1 write of the same shape must not corrupt either.
        const v1 = c.forWrite({ agents: { a: 'str' } }, 'v1');
        expect(v1.agent.a).toBe('str');
    });

    it('F2: plugin:null does not materialize plugins:[null]', () => {
        const canonical = c.normalizeToCanonical({ plugin: null });
        expect(canonical.plugins ?? []).not.toContain(null);
        expect(canonical.plugins === undefined || Array.isArray(canonical.plugins)).toBe(true);
    });

    it('F3: global numeric mcp.timeout maps to catalog+execution defaults', () => {
        const canonical = c.normalizeToCanonical({ mcp: { timeout: 5000 } });
        expect(canonical.mcp.timeout).toEqual({ catalog: 5000, execution: 5000 });
        // Round-trips back to the v1 number form (plus experimental default).
        const v1 = c.forWrite(canonical, 'v1');
        expect(v1.mcp.timeout).toBe(5000);
        expect(v1.experimental.mcp_timeout).toBe(5000);
    });

    it('F4: v1 variants object values nest package options under settings', () => {
        const canonical = c.normalizeToCanonical({
            providers: { p: { models: { m: { variants: { high: { reasoningEffort: 'high' } } } } } },
        });
        const entry = canonical.providers.p.models.m.variants[0];
        expect(entry.id).toBe('high');
        expect(entry.settings).toEqual({ reasoningEffort: 'high' });
        expect(entry.reasoningEffort).toBeUndefined();
        // Array -> object flattens settings back so object->array->object is stable.
        const back = c.forWrite(canonical, 'v1');
        expect(back.provider.p.models.m.variants).toEqual({ high: { reasoningEffort: 'high' } });
        const canon2 = c.normalizeToCanonical(JSON.parse(JSON.stringify(back)));
        expect(canon2.providers.p.models.m.variants).toEqual(canonical.providers.p.models.m.variants);
    });

    it('F5: options.headers/body hoist to top-level on read, fold back on v1 write', () => {        const canonical = c.normalizeToCanonical({
            providers: { p: { options: { apiKey: 'k', headers: { 'X-T': '1' }, body: { tier: 'flex' } } } },
        });
        expect(canonical.providers.p.headers).toEqual({ 'X-T': '1' });
        expect(canonical.providers.p.body).toEqual({ tier: 'flex' });
        expect(canonical.providers.p.settings.apiKey).toBe('k');
        expect(canonical.providers.p.settings.headers).toBeUndefined();
        const v1 = c.forWrite(canonical, 'v1');
        expect(v1.provider.p.options.headers).toEqual({ 'X-T': '1' });
        expect(v1.provider.p.options.body).toEqual({ tier: 'flex' });
        // Model-level bags behave the same.
        const mCanon = c.normalizeToCanonical({
            providers: { p: { models: { m: { options: { headers: { 'X-M': '2' } } } } } },
        });
        expect(mCanon.providers.p.models.m.headers).toEqual({ 'X-M': '2' });
    });

    it('malformed scalar entries in providers/mcp/commands pass through verbatim', () => {
        const canonical = c.normalizeToCanonical({
            providers: { p: 'x' },
            mcp: { servers: { s: 'y' } },
            commands: { c: 42 },
        });
        expect(canonical.providers.p).toBe('x');
        expect(canonical.mcp.servers.s).toBe('y');
        expect(canonical.commands.c).toBe(42);
    });
});

describe('inferTargetFromConfig (v1 GUI protection)', () => {
    it('native v2 keys pin to v2', () => {
        expect(c.inferTargetFromConfig({ permissions: [] })).toBe('v2');
        expect(c.inferTargetFromConfig({ providers: {} })).toBe('v2');
        expect(c.inferTargetFromConfig({ agents: {} })).toBe('v2');
        expect(c.inferTargetFromConfig({ plugins: [] })).toBe('v2');
        expect(c.inferTargetFromConfig({ mcp: { servers: {} } })).toBe('v2');
    });

    it('legacy v1 keys pin to v1', () => {
        expect(c.inferTargetFromConfig({ permission: {} })).toBe('v1');
        expect(c.inferTargetFromConfig({ provider: {} })).toBe('v1');
        expect(c.inferTargetFromConfig({ agent: {}, mode: {} })).toBe('v1');
        expect(c.inferTargetFromConfig({ command: {} })).toBe('v1');
        expect(c.inferTargetFromConfig({ plugin: [] })).toBe('v1');
        expect(c.inferTargetFromConfig({ snapshot: true })).toBe('v1');
        expect(c.inferTargetFromConfig({ mcp: { myserver: { type: 'local' } } })).toBe('v1');
        expect(c.inferTargetFromConfig({ experimental: { mcp_timeout: 5 } })).toBe('v1');
    });

    it('Studio-written v1 files (update kept next to autoupdate) still infer v1', () => {
        const v1 = c.forWrite({ permissions: [{ action: 'shell', resource: '*', effect: 'ask' }], update: 'auto' }, 'v1');
        expect(v1.update).toBeDefined();
        expect(c.inferTargetFromConfig(v1)).toBe('v1');
    });

    it('empty or signal-free configs default to v2', () => {
        expect(c.inferTargetFromConfig({})).toBe('v2');
        expect(c.inferTargetFromConfig(null)).toBe('v2');
        expect(c.inferTargetFromConfig({ model: 'x', theme: 'dark' })).toBe('v2');
        // Bare `update` alone is ambiguous (v1 writes keep it too) -> v2 default.
        expect(c.inferTargetFromConfig({ update: 'auto' })).toBe('v2');
    });

    it('a v2 user config infers v2 and rewrites to v1 cleanly when forced', () => {
        const userV2 = {
            mcp: { servers: { a: { type: 'remote', url: 'http://x', disabled: false } } },
            permissions: [{ action: 'shell', resource: '*', effect: 'allow' }],
            plugins: ['p'],
        };
        expect(c.inferTargetFromConfig(userV2)).toBe('v2');
        const v1 = c.forWrite(userV2, 'v1');
        expect(c.inferTargetFromConfig(v1)).toBe('v1');
        expect(v1.mcp.a.enabled).toBe(true);
        expect(v1.permission.bash).toBe('allow');
        expect(v1.plugin).toEqual(['p']);
    });
});
