import { describe, it, expect } from 'vitest';

import {
    assertSafeBackupResourceNames,
    isSafeAgentName,
    isSafeAuthProfileName,
    isSafePluginName,
    isSafeSkillName,
} from './resource-names.js';

describe('resource name policy', () => {
    it('accepts normal skill, plugin, and agent names', () => {
        expect(isSafeSkillName('code-review')).toBe(true);
        expect(isSafePluginName('watcher.plugin')).toBe(true);
        expect(isSafePluginName('watcher.ts')).toBe(true);
        expect(isSafeAgentName('Build Agent')).toBe(true);
        expect(isSafeAuthProfileName('jikui.feng+oss@example.com')).toBe(true);
    });

    it('rejects path traversal and path separator names', () => {
        for (const name of ['../escape', '..\\escape', '/tmp/escape', 'nested/plugin', '.', '..']) {
            expect(isSafeSkillName(name), `skill ${name}`).toBe(false);
            expect(isSafePluginName(name), `plugin ${name}`).toBe(false);
            expect(isSafeAgentName(name), `agent ${name}`).toBe(false);
            expect(isSafeAuthProfileName(name), `auth profile ${name}`).toBe(false);
        }
    });

    it('rejects malformed auth profile names', () => {
        for (const name of [' user@example.com', 'user@example.com ', 'profile:name', 'profile*name', '']) {
            expect(isSafeAuthProfileName(name), `auth profile ${name}`).toBe(false);
        }
    });

    it('rejects malformed backup skill and plugin names before restore writes', () => {
        expect(() => {
            assertSafeBackupResourceNames({
                skills: [{ name: 'debugging', content: 'ok' }],
                plugins: [{ name: 'hooks', content: 'ok' }],
            });
        }).not.toThrow();

        expect(
            () => assertSafeBackupResourceNames({ skills: [{ name: '../escape', content: 'bad' }] })
        ).toThrow(/Invalid skill name/);
        expect(
            () => assertSafeBackupResourceNames({ plugins: [{ name: '../escape', content: 'bad' }] })
        ).toThrow(/Invalid plugin name/);
        expect(
            () => assertSafeBackupResourceNames({ skills: { name: 'debugging', content: 'bad' } })
        ).toThrow(/Invalid skills list/);
        expect(
            () => assertSafeBackupResourceNames({ plugins: { name: 'hooks', content: 'bad' } })
        ).toThrow(/Invalid plugins list/);
    });
});
