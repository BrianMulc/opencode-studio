// Directory-tree snapshot helpers for backup/restore (backup format v2).
//
// Instead of backing up an itemized list of resources (skills, plugins, ...)
// that goes stale as the app grows, v2 backups snapshot whole directory trees:
// the active config dir, every profile dir, and the studio data dir. These
// helpers handle the two tricky parts of that approach:
//   - collecting a directory tree into JSON-safe { path, content } entries
//     (binary files become base64, oversized/noise files are excluded)
//   - restoring such entries safely (every path is validated to stay inside
//     the target root — a crafted backup must never escape via ../ etc.)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Directories never worth backing up (re-installable or machine-local state).
const EXCLUDED_DIR_NAMES = new Set([
    'node_modules',
    '.git',
    '.hg',
    '.svn',
    '.next',
    '.cache',
    'cache',
    'dist',
    'build',
    '__pycache__',
]);

// Individual files never worth backing up (runtime state, OS noise).
const EXCLUDED_FILE_NAMES = new Set([
    'server.lock.json',
    'server-boot.log',
    'update.log',
    '.DS_Store',
    'Thumbs.db',
]);

const EXCLUDED_FILE_EXTENSIONS = new Set(['.log', '.tmp']);

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_TREE_FILES = 5000;            // sanity cap per directory tree

function isExcludedFileName(basename) {
    if (EXCLUDED_FILE_NAMES.has(basename)) return true;
    return EXCLUDED_FILE_EXTENSIONS.has(path.extname(basename).toLowerCase());
}

// Heuristic binary sniff: a NUL byte in the first 8KB is a reliable marker
// for the config-tree file types we care about (all text: json/md/ts/...).
function looksBinary(buffer) {
    const probe = buffer.subarray(0, Math.min(buffer.length, 8192));
    return probe.includes(0);
}

function atomicWrite(filePath, data, encoding) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${crypto.randomBytes(6).toString('hex')}.tmp`);
    try {
        fs.writeFileSync(tempPath, data, encoding);
        // Windows rename cannot overwrite an existing destination.
        try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch {}
        fs.renameSync(tempPath, filePath);
    } finally {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch {}
    }
}

// Collects rootDir recursively into { files, skipped }.
// files: [{ path: 'posix/relative/path', content, encoding?: 'base64' }]
// skipped: [{ path, reason }] — informational, never fatal.
function collectDirTree(rootDir, options = {}) {
    const { maxFileBytes = MAX_FILE_BYTES, maxFiles = MAX_TREE_FILES } = options;
    const files = [];
    const skipped = [];

    if (!rootDir || !fs.existsSync(rootDir)) return { files, skipped };

    let rootStat;
    try {
        rootStat = fs.statSync(rootDir); // follows junctions/symlinks at the root
    } catch {
        return { files, skipped };
    }
    if (!rootStat.isDirectory()) return { files, skipped };

    const walk = (dirAbs, relPosix) => {
        if (files.length >= maxFiles) return;
        let entries;
        try {
            entries = fs.readdirSync(dirAbs, { withFileTypes: true });
        } catch (err) {
            skipped.push({ path: relPosix || '.', reason: `unreadable: ${err.message}` });
            return;
        }
        for (const entry of entries) {
            if (files.length >= maxFiles) {
                skipped.push({ path: path.posix.join(relPosix, entry.name), reason: `file count cap (${maxFiles}) reached` });
                continue;
            }
            const childAbs = path.join(dirAbs, entry.name);
            const childRel = relPosix ? `${relPosix}/${entry.name}` : entry.name;

            // Never follow links inside the tree — a symlink could point
            // anywhere on the machine (the root itself is followed above).
            if (entry.isSymbolicLink()) {
                skipped.push({ path: childRel, reason: 'symlink not followed' });
                continue;
            }
            if (entry.isDirectory()) {
                if (EXCLUDED_DIR_NAMES.has(entry.name)) {
                    skipped.push({ path: childRel, reason: 'excluded directory' });
                    continue;
                }
                walk(childAbs, childRel);
                continue;
            }
            if (!entry.isFile()) continue; // sockets/fifos/etc: ignore silently
            if (isExcludedFileName(entry.name)) {
                skipped.push({ path: childRel, reason: 'excluded file' });
                continue;
            }

            let buffer;
            try {
                const stat = fs.statSync(childAbs);
                if (stat.size > maxFileBytes) {
                    skipped.push({ path: childRel, reason: `exceeds ${maxFileBytes} bytes` });
                    continue;
                }
                buffer = fs.readFileSync(childAbs);
            } catch (err) {
                skipped.push({ path: childRel, reason: `unreadable: ${err.message}` });
                continue;
            }

            if (looksBinary(buffer)) {
                files.push({ path: childRel, content: buffer.toString('base64'), encoding: 'base64' });
            } else {
                files.push({ path: childRel, content: buffer.toString('utf8') });
            }
        }
    };

    walk(rootDir, '');
    return { files, skipped };
}

// Validates a backup-provided relative path and returns a safe POSIX-style
// relative path, or null when unsafe (absolute, drive-lettered, traversal,
// empty segments, control chars, ADS colons).
function sanitizeBackupRelPath(input) {
    if (typeof input !== 'string' || input.length === 0 || input.length > 1024) return null;
    if (/[\0-\x1f]/.test(input)) return null;

    const normalized = input.replace(/\\/g, '/');
    if (normalized.startsWith('/')) return null;
    if (/^[A-Za-z]:\//.test(normalized) || /^[A-Za-z]:$/.test(normalized)) return null;
    if (normalized.startsWith('//')) return null; // UNC

    const segments = normalized.split('/');
    for (const segment of segments) {
        if (segment === '' || segment === '.' || segment === '..') return null;
        if (segment.includes(':')) return null; // Windows drive/ADS safety
    }
    return segments.join('/');
}

function createUnsafeBackupPathError(filePath) {
    const error = new Error(`Unsafe path in backup: ${typeof filePath === 'string' ? filePath : String(filePath)}`);
    error.statusCode = 400;
    error.code = 'UNSAFE_BACKUP_PATH';
    return error;
}

// Writes a files[] array (as produced by collectDirTree) into rootDir.
// Throws UNSAFE_BACKUP_PATH on the first unsafe entry — a tampered backup
// should fail loudly rather than partially apply.
function restoreDirTree(rootDir, files) {
    if (!Array.isArray(files)) {
        const error = new Error('Invalid backup: files must be an array');
        error.statusCode = 400;
        error.code = 'INVALID_BACKUP_FILES';
        throw error;
    }

    let restored = 0;
    const skipped = [];

    for (const entry of files) {
        const safeRel = entry && sanitizeBackupRelPath(entry.path);
        if (!safeRel) throw createUnsafeBackupPathError(entry && entry.path);
        if (typeof entry.content !== 'string') {
            skipped.push({ path: safeRel, reason: 'content is not a string' });
            continue;
        }
        const encoding = entry.encoding === 'base64' ? 'base64' : 'utf8';
        const target = path.join(rootDir, ...safeRel.split('/'));
        // Defense in depth: the resolved path must stay inside rootDir.
        const resolvedRoot = path.resolve(rootDir);
        const resolvedTarget = path.resolve(target);
        if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
            throw createUnsafeBackupPathError(entry.path);
        }
        atomicWrite(target, entry.content, encoding);
        restored++;
    }

    return { restored, skipped };
}

module.exports = {
    EXCLUDED_DIR_NAMES,
    EXCLUDED_FILE_NAMES,
    MAX_FILE_BYTES,
    MAX_TREE_FILES,
    collectDirTree,
    restoreDirTree,
    sanitizeBackupRelPath,
};
