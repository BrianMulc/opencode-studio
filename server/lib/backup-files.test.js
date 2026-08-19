import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect } from 'vitest';

import { collectDirTree, restoreDirTree, sanitizeBackupRelPath } from './backup-files.js';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-backup-test-'));

describe('sanitizeBackupRelPath', () => {
    it('accepts normal relative paths', () => {
        expect(sanitizeBackupRelPath('opencode.json')).toBe('opencode.json');
        expect(sanitizeBackupRelPath('agents/build.md')).toBe('agents/build.md');
        expect(sanitizeBackupRelPath('skills/code-review/SKILL.md')).toBe('skills/code-review/SKILL.md');
        expect(sanitizeBackupRelPath('a\\b\\c.json')).toBe('a/b/c.json'); // windows separators normalize
    });

    it('rejects traversal, absolute, and drive-letter paths', () => {
        const bad = [
            '../escape.json',
            '..\\escape.json',
            'agents/../../escape.json',
            'agents/./weird.json',
            '/etc/passwd',
            'C:/Windows/evil.dll',
            'C:\\Windows\\evil.dll',
            'C:',
            '//server/share/file',
            '',
            'agents//double.json',
            'file\u0000.json',
            'stream:ads.txt',
        ];
        for (const p of bad) {
            expect(sanitizeBackupRelPath(p), `should reject: ${JSON.stringify(p)}`).toBe(null);
        }
    });
});

describe('collectDirTree / restoreDirTree roundtrip', () => {
    it('collects files recursively with posix paths and restores them', () => {
        const src = makeTempDir();
        const dst = makeTempDir();
        try {
            fs.mkdirSync(path.join(src, 'agents'), { recursive: true });
            fs.mkdirSync(path.join(src, 'skills', 'review'), { recursive: true });
            fs.writeFileSync(path.join(src, 'opencode.json'), '{"model":"x"}', 'utf8');
            fs.writeFileSync(path.join(src, 'agents', 'build.md'), '# build agent', 'utf8');
            fs.writeFileSync(path.join(src, 'skills', 'review', 'SKILL.md'), '# review', 'utf8');
            fs.writeFileSync(path.join(src, 'empty.txt'), '', 'utf8');

            const { files } = collectDirTree(src);
            expect(files.map(f => f.path).sort()).toEqual(['agents/build.md', 'empty.txt', 'opencode.json', 'skills/review/SKILL.md']);

            const result = restoreDirTree(dst, files);
            expect(result.restored).toBe(4);
            expect(fs.readFileSync(path.join(dst, 'agents', 'build.md'), 'utf8')).toBe('# build agent');
            expect(fs.readFileSync(path.join(dst, 'skills', 'review', 'SKILL.md'), 'utf8')).toBe('# review');
            expect(fs.existsSync(path.join(dst, 'empty.txt'))).toBe(true);
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
            fs.rmSync(dst, { recursive: true, force: true });
        }
    });

    it('excludes node_modules, .git, locks and runtime noise', () => {
        const src = makeTempDir();
        try {
            fs.mkdirSync(path.join(src, 'node_modules', 'zod'), { recursive: true });
            fs.writeFileSync(path.join(src, 'node_modules', 'zod', 'index.js'), 'module.exports={}', 'utf8');
            fs.mkdirSync(path.join(src, '.git'), { recursive: true });
            fs.writeFileSync(path.join(src, '.git', 'HEAD'), 'ref: x', 'utf8');
            fs.writeFileSync(path.join(src, 'server.lock.json'), '{}', 'utf8');
            fs.writeFileSync(path.join(src, 'update.log'), 'log', 'utf8');
            fs.writeFileSync(path.join(src, 'scratch.tmp'), 'tmp', 'utf8');
            fs.writeFileSync(path.join(src, 'opencode.json'), '{}', 'utf8');

            const { files, skipped } = collectDirTree(src);
            expect(files.map(f => f.path)).toEqual(['opencode.json']);
            expect(skipped.length).toBe(5);
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
        }
    });

    it('keeps bun.lock and package-lock.json (plugin dependency locks)', () => {
        const src = makeTempDir();
        try {
            fs.writeFileSync(path.join(src, 'bun.lock'), '{}', 'utf8');
            fs.writeFileSync(path.join(src, 'package-lock.json'), '{}', 'utf8');
            const { files } = collectDirTree(src);
            expect(files.map(f => f.path).sort()).toEqual(['bun.lock', 'package-lock.json']);
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
        }
    });

    it('encodes binary files as base64 and restores them byte-identical', () => {
        const src = makeTempDir();
        const dst = makeTempDir();
        try {
            const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x0d, 0x0a, 0xff, 0xfe]);
            fs.writeFileSync(path.join(src, 'icon.png'), binary);

            const { files } = collectDirTree(src);
            expect(files.length).toBe(1);
            expect(files[0].encoding).toBe('base64');

            restoreDirTree(dst, files);
            expect(fs.readFileSync(path.join(dst, 'icon.png')).equals(binary)).toBe(true);
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
            fs.rmSync(dst, { recursive: true, force: true });
        }
    });

    it('skips files exceeding the size cap', () => {
        const src = makeTempDir();
        try {
            fs.writeFileSync(path.join(src, 'huge.bin'), Buffer.alloc(6 * 1024 * 1024, 65), 'utf8');
            const { files, skipped } = collectDirTree(src);
            expect(files.length).toBe(0);
            expect(skipped.length).toBe(1);
            expect(skipped[0].reason).toMatch(/exceeds/);
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
        }
    });

    it('does not follow symlinks or junctions inside the tree', () => {
        const src = makeTempDir();
        try {
            fs.writeFileSync(path.join(src, 'real.json'), '{}', 'utf8');
            // File symlinks need admin/Developer Mode on Windows; directory
            // junctions do not. Use whichever this environment allows — both
            // must be reported as links and never followed.
            let linkPath = path.join(src, 'link.json');
            try {
                fs.symlinkSync(path.join(src, 'real.json'), linkPath);
            } catch (err) {
                if (err.code !== 'EPERM') throw err;
                fs.mkdirSync(path.join(src, 'subdir'), { recursive: true });
                fs.writeFileSync(path.join(src, 'subdir', 'nested.json'), '{}', 'utf8');
                linkPath = path.join(src, 'linkdir');
                fs.symlinkSync(path.join(src, 'subdir'), linkPath, 'junction');
            }
            const { files, skipped } = collectDirTree(src);
            const linkRel = path.basename(linkPath);
            expect(files.map(f => f.path)).not.toContain(linkRel);
            expect(files.some(f => f.path.startsWith(linkRel + '/'))).toBe(false);
            expect(skipped.some(s => s.path === linkRel && /symlink/.test(s.reason))).toBe(true);
        } finally {
            fs.rmSync(src, { recursive: true, force: true });
        }
    });
});

describe('restoreDirTree safety', () => {
    it('throws on traversal entries and writes nothing for them', () => {
        const dst = makeTempDir();
        try {
            expect(() => restoreDirTree(dst, [{ path: '..\\..\\evil.txt', content: 'x' }])).toThrow(/Unsafe path in backup/);
            expect(fs.readdirSync(dst).length).toBe(0);
        } finally {
            fs.rmSync(dst, { recursive: true, force: true });
        }
    });

    it('throws on absolute paths and drive letters', () => {
        const dst = makeTempDir();
        try {
            for (const bad of ['C:/Windows/evil.dll', '/etc/passwd', '\\\\server\\share\\x']) {
                expect(() => restoreDirTree(dst, [{ path: bad, content: 'x' }])).toThrow(/Unsafe path/);
            }
        } finally {
            fs.rmSync(dst, { recursive: true, force: true });
        }
    });

    it('rejects a non-array files payload', () => {
        const dst = makeTempDir();
        try {
            expect(() => restoreDirTree(dst, 'not-an-array')).toThrow(/files must be an array/);
        } finally {
            fs.rmSync(dst, { recursive: true, force: true });
        }
    });
});
