const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = os.homedir();
const OPENCODE_DIR = path.join(HOME_DIR, '.config', 'opencode');
const PROFILES_DIR = path.join(HOME_DIR, '.config', 'opencode-profiles');

if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
}

function isSymlink(filepath) {
    try {
        return fs.lstatSync(filepath).isSymbolicLink();
    } catch {
        return false;
    }
}

function init() {
    const defaultProfilePath = path.join(PROFILES_DIR, 'default');
    
    if (fs.existsSync(OPENCODE_DIR) && !isSymlink(OPENCODE_DIR)) {
        if (!fs.existsSync(defaultProfilePath)) {
            console.log('[Profiles] Migrating existing config to "default" profile');
            fs.renameSync(OPENCODE_DIR, defaultProfilePath);
            fs.symlinkSync(defaultProfilePath, OPENCODE_DIR, 'junction');
        }
    } else if (!fs.existsSync(OPENCODE_DIR) && !isSymlink(OPENCODE_DIR)) {
        fs.mkdirSync(defaultProfilePath, { recursive: true });
        fs.symlinkSync(defaultProfilePath, OPENCODE_DIR, 'junction');
    }
}

function listProfiles() {
    init();
    const profiles = fs.readdirSync(PROFILES_DIR).filter(f => {
        return fs.statSync(path.join(PROFILES_DIR, f)).isDirectory();
    });
    
    let active = null;
    if (isSymlink(OPENCODE_DIR)) {
        const target = fs.readlinkSync(OPENCODE_DIR);
        active = path.basename(target);
    } else {
        active = 'default (unmanaged)';
    }
    
    return { profiles, active };
}

// Windows reserved names (case insensitive)
const WINDOWS_RESERVED_NAMES = new Set([
    'CON', 'PRN', 'AUX', 'NUL',
    'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
    'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'
]);

function validateProfileName(name) {
    // Check if name is a non-empty string
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Profile name is required' };
    }

    const trimmed = name.trim();

    // Reject empty/whitespace-only names
    if (trimmed.length === 0) {
        return { valid: false, error: 'Profile name cannot be empty or whitespace' };
    }

    // Reject names equal to . or ..
    if (trimmed === '.' || trimmed === '..') {
        return { valid: false, error: 'Profile name cannot be "." or ".."' };
    }

    // Reject names containing filesystem-unsafe characters: /, \, :, *, ?, ", <, >, |
    const unsafeChars = /[/\\:*?"<>|]/;
    if (unsafeChars.test(trimmed)) {
        return { valid: false, error: 'Profile name contains invalid characters (no /, \\, :, *, ?, ", <, >, | allowed)' };
    }

    // Reject names not matching the safe pattern
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
        return { valid: false, error: 'Profile name can only contain letters, numbers, dots, underscores, and hyphens' };
    }

    // Reject Windows reserved names (case insensitive)
    const upper = trimmed.toUpperCase();
    if (WINDOWS_RESERVED_NAMES.has(upper)) {
        return { valid: false, error: 'Profile name is a reserved Windows name' };
    }

    // Reject names that already exist
    const dir = path.join(PROFILES_DIR, trimmed);
    if (fs.existsSync(dir)) {
        return { valid: false, error: 'A profile with this name already exists' };
    }

    return { valid: true };
}

function createProfile(name) {
    const validation = validateProfileName(name);
    if (!validation.valid) {
        throw new Error(validation.error);
    }
    const trimmed = name.trim();
    const dir = path.join(PROFILES_DIR, trimmed);
    fs.mkdirSync(dir, { recursive: true });
    return { success: true };
}

function deleteProfile(name) {
    const { active } = listProfiles();
    if (name === active) throw new Error('Cannot delete active profile');
    if (name === 'default') throw new Error('Cannot delete default profile');
    
    const dir = path.join(PROFILES_DIR, name);
    if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    return { success: true };
}

function activateProfile(name) {
    const target = path.join(PROFILES_DIR, name);
    if (!fs.existsSync(target)) throw new Error('Profile not found');
    
    if (fs.existsSync(OPENCODE_DIR)) {
        fs.rmSync(OPENCODE_DIR, { recursive: true, force: true });
    }
    
    fs.symlinkSync(target, OPENCODE_DIR, 'junction');
    return { success: true };
}

function duplicateProfile(sourceName, newName) {
    const validation = validateProfileName(newName);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const sourceDir = path.join(PROFILES_DIR, sourceName);
    if (!fs.existsSync(sourceDir)) {
        throw new Error('Source profile not found');
    }

    const destDir = path.join(PROFILES_DIR, newName.trim());
    fs.cpSync(sourceDir, destDir, { recursive: true });

    return { success: true, newName: newName.trim() };
}

function renameProfile(oldName, newName) {
    const validation = validateProfileName(newName);
    if (!validation.valid) {
        throw new Error(validation.error);
    }

    const trimmedNew = newName.trim();
    const oldDir = path.join(PROFILES_DIR, oldName);
    const newDir = path.join(PROFILES_DIR, trimmedNew);

    if (!fs.existsSync(oldDir)) {
        throw new Error('Profile not found');
    }

    // Check if profile is currently active (symlink points to it)
    const { active } = listProfiles();
    const isActive = active === oldName;

    // If active, update junction symlink FIRST, then rename directory
    if (isActive) {
        // Remove old junction and create new one pointing to new dir
        if (fs.existsSync(OPENCODE_DIR)) {
            fs.rmSync(OPENCODE_DIR, { recursive: true, force: true });
        }
        fs.symlinkSync(newDir, OPENCODE_DIR, 'junction');
    }

    try {
        fs.renameSync(oldDir, newDir);
    } catch (err) {
        // Rollback: if rename failed and profile was active, restore old symlink
        if (isActive) {
            try {
                if (fs.existsSync(OPENCODE_DIR)) {
                    fs.rmSync(OPENCODE_DIR, { recursive: true, force: true });
                }
                fs.symlinkSync(oldDir, OPENCODE_DIR, 'junction');
            } catch (rollbackErr) {
                console.error('[Profiles] Rollback failed:', rollbackErr.message);
            }
        }
        throw err;
    }

    return { success: true, newName: trimmedNew };
}

module.exports = {
    listProfiles,
    createProfile,
    deleteProfile,
    activateProfile,
    validateProfileName,
    duplicateProfile,
    renameProfile
};