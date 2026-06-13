const fs = require('fs');
const path = require('path');
const harnessManager = require('../lib/harness-manager');

const jsoncParser = require('jsonc-parser');

function getHarnessConfigPath(name) {
    const profilePath = path.join(harnessManager.CUSTOM_HARNESS_DIR, name);
    const configPath = path.join(profilePath, 'config', 'oh-my-openagent.jsonc');
    const jsonPath = path.join(profilePath, 'config', 'oh-my-openagent.json');
    
    if (fs.existsSync(configPath)) return configPath;
    if (fs.existsSync(jsonPath)) return jsonPath;
    
    // Also check legacy names
    const legacyPath = path.join(profilePath, 'config', 'oh-my-opencode.jsonc');
    const legacyJsonPath = path.join(profilePath, 'config', 'oh-my-opencode.json');
    if (fs.existsSync(legacyPath)) return legacyPath;
    if (fs.existsSync(legacyJsonPath)) return legacyJsonPath;
    
    return configPath; // Return default even if doesn't exist
}

function readConfig(name) {
    const configPath = getHarnessConfigPath(name);
    if (!fs.existsSync(configPath)) {
        return { found: false, error: 'Config file not found' };
    }
    
    try {
        const text = fs.readFileSync(configPath, 'utf8');
        const errors = [];
        const value = jsoncParser.parse(text, errors, {
            allowTrailingComma: true,
            disallowComments: false
        });
        if (errors.length > 0) {
            const first = errors[0];
            return { found: false, error: `Invalid JSON/JSONC (code ${first.error} at offset ${first.offset})` };
        }
        return { found: true, config: value || {}, path: configPath };
    } catch (err) {
        return { found: false, error: err.message };
    }
}

function writeConfig(name, config) {
    const configPath = getHarnessConfigPath(name);
    try {
        harnessManager.atomicWriteFileSync(configPath, JSON.stringify(config, null, 2));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function ensureConfigExists(name) {
    const configPath = getHarnessConfigPath(name);
    if (fs.existsSync(configPath)) return { success: true };
    
    try {
        const dir = path.dirname(configPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        harnessManager.atomicWriteFileSync(configPath, JSON.stringify({}, null, 2));
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function readSourceFile(name, filePath) {
    const profilePath = path.join(harnessManager.CUSTOM_HARNESS_DIR, name);
    const sourcePath = path.join(profilePath, 'oh-my-openagent', filePath);
    
    // Security: ensure file is within the harness directory
    const resolved = path.resolve(sourcePath);
    const baseDir = path.resolve(profilePath);
    if (!resolved.startsWith(baseDir)) {
        return { found: false, error: 'Access denied' };
    }
    
    if (fs.existsSync(sourcePath)) {
        try {
            const content = fs.readFileSync(sourcePath, 'utf8');
            return { found: true, content, path: sourcePath };
        } catch (err) {
            return { found: false, error: err.message };
        }
    }
    
    // Fallback: check vendor directory in workspace
    // Server may run from server/ subdirectory, so resolve from __dirname
    const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
    let vendorPath = path.join(workspaceRoot, 'vendor', 'oh-my-openagent', filePath);
    if (!fs.existsSync(vendorPath)) {
        // Secondary fallback: process.cwd() for direct server/ runs
        vendorPath = path.join(process.cwd(), 'vendor', 'oh-my-openagent', filePath);
    }
    if (fs.existsSync(vendorPath)) {
        try {
            const content = fs.readFileSync(vendorPath, 'utf8');
            return { found: true, content, path: vendorPath };
        } catch (err) {
            return { found: false, error: err.message };
        }
    }
    
    return { found: false, error: 'File not found' };
}

function writeSourceFile(name, filePath, content) {
    const profilePath = path.join(harnessManager.CUSTOM_HARNESS_DIR, name);
    const sourcePath = path.join(profilePath, 'oh-my-openagent', filePath);
    
    // Security: ensure file is within the harness directory
    const resolved = path.resolve(sourcePath);
    const baseDir = path.resolve(profilePath);
    if (!resolved.startsWith(baseDir)) {
        return { success: false, error: 'Access denied' };
    }
    
    try {
        const dir = path.dirname(sourcePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        harnessManager.atomicWriteFileSync(sourcePath, content);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

function listSourceFiles(name, subPath = '') {
    const profilePath = path.join(harnessManager.CUSTOM_HARNESS_DIR, name);
    const sourceDir = path.join(profilePath, 'oh-my-openagent', subPath);
    
    let targetDir = null;
    if (fs.existsSync(sourceDir)) {
        targetDir = sourceDir;
    } else {
        // Fallback: check vendor directory in workspace
        // Server may run from server/ subdirectory, so resolve from __dirname
        const workspaceRoot = path.resolve(__dirname, '..', '..', '..');
        let vendorDir = path.join(workspaceRoot, 'vendor', 'oh-my-openagent', subPath);
        if (!fs.existsSync(vendorDir)) {
            // Secondary fallback: process.cwd() for direct server/ runs
            vendorDir = path.join(process.cwd(), 'vendor', 'oh-my-openagent', subPath);
        }
        if (fs.existsSync(vendorDir)) {
            targetDir = vendorDir;
        }
    }
    
    if (!targetDir) {
        return { found: false, error: 'Source directory not found' };
    }
    
    try {
        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        const files = items.map(item => ({
            name: item.name,
            isDirectory: item.isDirectory(),
            path: path.posix.join(subPath.replace(/\\/g, '/'), item.name),
        }));
        return { found: true, files };
    } catch (err) {
        return { found: false, error: err.message };
    }
}

module.exports = {
    getHarnessConfigPath,
    readConfig,
    writeConfig,
    ensureConfigExists,
    readSourceFile,
    writeSourceFile,
    listSourceFiles,
};
