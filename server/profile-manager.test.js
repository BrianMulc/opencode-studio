import { describe, it, expect } from 'vitest';

import {
    assertSafeExistingProfileName,
    validateProfileName,
} from './profile-manager.js';

describe('profile name safety', () => {
    it('accepts normal direct-child profile names', () => {
        for (const name of ['work', 'personal', 'my.profile', 'p_1-2']) {
            expect(assertSafeExistingProfileName(name)).toBe(name);
        }
    });

    it('rejects traversal, separators, and dot names', () => {
        for (const bad of ['.', '..', '../evil', 'a/b', '..\\..', '/etc/passwd', '', null, undefined, 42]) {
            expect(() => assertSafeExistingProfileName(bad), `should reject ${JSON.stringify(bad)}`).toThrow();
        }
    });

    it('rejects windows reserved names', () => {
        expect(() => assertSafeExistingProfileName('CON')).toThrow();
        expect(() => assertSafeExistingProfileName('nul')).toThrow();
    });

    it('validateProfileName still rejects unsafe creation names', () => {
        expect(validateProfileName('../escape').valid).toBe(false);
        expect(validateProfileName('a/b').valid).toBe(false);
        expect(validateProfileName('..').valid).toBe(false);
    });
});
