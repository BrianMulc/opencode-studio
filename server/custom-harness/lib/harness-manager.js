const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync: _execSync } = require('child_process');
function execSync(cmd, opts) {
    return _execSync(cmd, { windowsHide: true, ...opts });
}

const HOME_DIR = os.homedir();
const CUSTOM_HARNESS_DIR = path.join(HOME_DIR, '.config', 'opencode', 'custom-harness');
const OPENCODE_DIR = path.join(HOME_DIR, '.config', 'opencode');
const OH_MY_OPENAGENT_REPO = 'https://github.com/code-yeongyu/oh-my-openagent.git';

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function atomicWriteFileSync(filePath, data, options = 'utf8') {
    const dir = path.dirname(filePath);
    ensureDir(dir);
    const tempPath = path.join(dir, `.${path.basename(filePath)}.${Math.random().toString(36).slice(2, 8)}.tmp`);
    try {
        fs.writeFileSync(tempPath, data, options);
        let retries = 5;
        while (retries > 0) {
            try {
                fs.renameSync(tempPath, filePath);
                break;
            } catch (e) {
                if (retries === 1) throw e;
                retries--;
                const start = Date.now();
                while (Date.now() - start < 50) {}
            }
        }
    } catch (err) {
        try {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
        throw err;
    }
}

function validateProfileName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Profile name is required' };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return { valid: false, error: 'Profile name must contain only letters, numbers, hyphens, and underscores' };
    }
    if (name.length > 64) {
        return { valid: false, error: 'Profile name must be 64 characters or less' };
    }
    return { valid: true };
}

function listProfiles() {
    ensureDir(CUSTOM_HARNESS_DIR);
    const profiles = fs.readdirSync(CUSTOM_HARNESS_DIR)
        .filter(f => {
            const fullPath = path.join(CUSTOM_HARNESS_DIR, f);
            return fs.statSync(fullPath).isDirectory();
        })
        .map(name => {
            const profilePath = path.join(CUSTOM_HARNESS_DIR, name);
            const metadataPath = path.join(profilePath, 'profile.json');
            let metadata = {};
            if (fs.existsSync(metadataPath)) {
                try {
                    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                } catch {}
            }
            const hasSource = fs.existsSync(path.join(profilePath, 'oh-my-openagent'));
            const hasConfig = fs.existsSync(path.join(profilePath, 'config'));
            return {
                name,
                createdAt: metadata.createdAt || null,
                source: metadata.source || null,
                hasSource,
                hasConfig,
                path: profilePath,
            };
        });
    return { profiles };
}

function getProfile(name) {
    const validation = validateProfileName(name);
    if (!validation.valid) {
        return { found: false, error: validation.error };
    }

    const profilePath = path.join(CUSTOM_HARNESS_DIR, name);
    if (!fs.existsSync(profilePath)) {
        return { found: false, error: 'Profile not found' };
    }

    const metadataPath = path.join(profilePath, 'profile.json');
    let metadata = {};
    if (fs.existsSync(metadataPath)) {
        try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        } catch {}
    }

    const hasSource = fs.existsSync(path.join(profilePath, 'oh-my-openagent'));
    const hasConfig = fs.existsSync(path.join(profilePath, 'config'));

    let sourceStats = null;
    if (hasSource) {
        const sourcePath = path.join(profilePath, 'oh-my-openagent');
        try {
            const stats = fs.statSync(sourcePath);
            sourceStats = {
                size: stats.size,
                modifiedAt: stats.mtime.toISOString(),
            };
        } catch {}
    }

    return {
        found: true,
        profile: {
            name,
            createdAt: metadata.createdAt || null,
            source: metadata.source || null,
            hasSource,
            hasConfig,
            sourceStats,
            path: profilePath,
        }
    };
}

function createProfile(name, source) {
    const validation = validateProfileName(name);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    const profilePath = path.join(CUSTOM_HARNESS_DIR, name);
    if (fs.existsSync(profilePath)) {
        return { success: false, error: 'Profile already exists' };
    }

    if (source !== 'latest' && source !== 'copy-existing') {
        return { success: false, error: 'Source must be "latest" or "copy-existing"' };
    }

    ensureDir(profilePath);

    const metadata = {
        name,
        source,
        createdAt: new Date().toISOString(),
    };

    try {
        if (source === 'latest') {
            // Clone from GitHub
            const sourcePath = path.join(profilePath, 'oh-my-openagent');
            try {
                execSync(`git clone --depth 1 "${OH_MY_OPENAGENT_REPO}" "${sourcePath}"`, {
                    stdio: 'pipe',
                    timeout: 120000,
                });
            } catch (err) {
                // Clean up on failure
                try {
                    fs.rmSync(profilePath, { recursive: true, force: true });
                } catch {}
                return { success: false, error: `Failed to clone repository: ${err.message}` };
            }
        } else if (source === 'copy-existing') {
            // Copy existing config from ~/.config/opencode/
            const configPath = path.join(profilePath, 'config');
            ensureDir(configPath);

            // Copy all JSON/JSONC files from ~/.config/opencode/
            if (fs.existsSync(OPENCODE_DIR)) {
                const files = fs.readdirSync(OPENCODE_DIR);
                for (const file of files) {
                    const srcPath = path.join(OPENCODE_DIR, file);
                    const destPath = path.join(configPath, file);
                    const stat = fs.statSync(srcPath);
                    if (stat.isFile() && (file.endsWith('.json') || file.endsWith('.jsonc'))) {
                        fs.copyFileSync(srcPath, destPath);
                    } else if (stat.isDirectory() && file !== 'custom-harness') {
                        // Copy subdirectories recursively
                        copyDirectoryRecursive(srcPath, destPath);
                    }
                }
            }

            // Also copy oh-my-openagent source if vendor exists
            // Server may run from server/ subdirectory, so resolve from __dirname
            const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
            let vendorPath = path.join(workspaceRoot, 'vendor', 'oh-my-openagent');
            if (!fs.existsSync(vendorPath)) {
                // Secondary fallback: process.cwd() for direct server/ runs
                vendorPath = path.join(process.cwd(), 'vendor', 'oh-my-openagent');
            }
            if (fs.existsSync(vendorPath)) {
                const sourcePath = path.join(profilePath, 'oh-my-openagent');
                copyDirectoryRecursive(vendorPath, sourcePath);
            }
        }

        atomicWriteFileSync(
            path.join(profilePath, 'profile.json'),
            JSON.stringify(metadata, null, 2)
        );

        return { success: true, profile: metadata };
    } catch (err) {
        // Clean up on failure
        try {
            fs.rmSync(profilePath, { recursive: true, force: true });
        } catch {}
        return { success: false, error: err.message };
    }
}

function copyDirectoryRecursive(src, dest) {
    ensureDir(dest);
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules') {
                copyDirectoryRecursive(srcPath, destPath);
            }
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

function deleteProfile(name) {
    const validation = validateProfileName(name);
    if (!validation.valid) {
        return { success: false, error: validation.error };
    }

    const profilePath = path.join(CUSTOM_HARNESS_DIR, name);
    if (!fs.existsSync(profilePath)) {
        return { success: false, error: 'Profile not found' };
    }

    try {
        fs.rmSync(profilePath, { recursive: true, force: true });
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = {
    listProfiles,
    getProfile,
    createProfile,
    deleteProfile,
    validateProfileName,
    atomicWriteFileSync,
    CUSTOM_HARNESS_DIR,
};
