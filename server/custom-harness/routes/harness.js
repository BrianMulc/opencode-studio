const express = require('express');
const harnessManager = require('../lib/harness-manager');
const configLoader = require('../lib/config-loader');

const router = express.Router();

router.post('/create', (req, res) => {
    try {
        const { name, source } = req.body;
        if (!name) {
            return res.status(400).json({
                error: 'Profile name is required',
                code: 'MISSING_PROFILE_NAME',
            });
        }
        if (!source) {
            return res.status(400).json({
                error: 'Source is required ("latest" or "copy-existing")',
                code: 'MISSING_SOURCE',
            });
        }

        const result = harnessManager.createProfile(name, source);
        if (!result.success) {
            return res.status(400).json({
                error: result.error,
                code: 'CREATE_FAILED',
            });
        }

        res.status(201).json({
            ok: true,
            profile: result.profile,
        });
    } catch (err) {
        res.status(500).json({
            error: err.message,
            code: 'INTERNAL_ERROR',
        });
    }
});

router.get('/list', (req, res) => {
    try {
        const result = harnessManager.listProfiles();
        res.json({
            ok: true,
            profiles: result.profiles,
        });
    } catch (err) {
        res.status(500).json({
            error: err.message,
            code: 'INTERNAL_ERROR',
        });
    }
});

router.get('/:name', (req, res) => {
    try {
        const { name } = req.params;
        const result = harnessManager.getProfile(name);
        if (!result.found) {
            return res.status(404).json({
                error: result.error,
                code: 'NOT_FOUND',
            });
        }
        res.json({
            ok: true,
            profile: result.profile,
        });
    } catch (err) {
        res.status(500).json({
            error: err.message,
            code: 'INTERNAL_ERROR',
        });
    }
});

router.delete('/:name', (req, res) => {
    try {
        const { name } = req.params;
        const result = harnessManager.deleteProfile(name);
        if (!result.success) {
            return res.status(400).json({
                error: result.error,
                code: 'DELETE_FAILED',
            });
        }
        res.json({
            ok: true,
            name,
        });
    } catch (err) {
        res.status(500).json({
            error: err.message,
            code: 'INTERNAL_ERROR',
        });
    }
});

router.get('/:name/config', (req, res) => {
    try {
        const { name } = req.params;
        const validation = harnessManager.validateProfileName(name);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error, code: 'INVALID_NAME' });
        }

        const result = configLoader.readConfig(name);
        if (!result.found) {
            return res.status(404).json({ error: result.error, code: 'CONFIG_NOT_FOUND' });
        }

        res.json({ ok: true, config: result.config, path: result.path });
    } catch (err) {
        res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
});

router.put('/:name/config', (req, res) => {
    try {
        const { name } = req.params;
        const validation = harnessManager.validateProfileName(name);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error, code: 'INVALID_NAME' });
        }

        const { config } = req.body;
        if (!config || typeof config !== 'object') {
            return res.status(400).json({ error: 'Config object is required', code: 'MISSING_CONFIG' });
        }

        const result = configLoader.writeConfig(name, config);
        if (!result.success) {
            return res.status(500).json({ error: result.error, code: 'WRITE_FAILED' });
        }

        res.json({ ok: true, message: 'Configuration saved' });
    } catch (err) {
        res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
});

router.get('/:name/source/{*path}', (req, res) => {
    try {
        const { name } = req.params;
        const filePath = Array.isArray(req.params.path) ? req.params.path.join('/') : (req.params.path || '');
        const validation = harnessManager.validateProfileName(name);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error, code: 'INVALID_NAME' });
        }

        const result = configLoader.readSourceFile(name, filePath);
        if (!result.found) {
            return res.status(404).json({ error: result.error, code: 'FILE_NOT_FOUND' });
        }

        res.json({ ok: true, content: result.content, path: result.path });
    } catch (err) {
        res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
});

router.put('/:name/source/{*path}', (req, res) => {
    try {
        const { name } = req.params;
        const filePath = Array.isArray(req.params.path) ? req.params.path.join('/') : (req.params.path || '');
        const validation = harnessManager.validateProfileName(name);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error, code: 'INVALID_NAME' });
        }

        const { content } = req.body;
        if (content === undefined) {
            return res.status(400).json({ error: 'Content is required', code: 'MISSING_CONTENT' });
        }

        const result = configLoader.writeSourceFile(name, filePath, content);
        if (!result.success) {
            return res.status(500).json({ error: result.error, code: 'WRITE_FAILED' });
        }

        res.json({ ok: true, message: 'File saved' });
    } catch (err) {
        res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
});

router.get('/:name/source-files', (req, res) => {
    try {
        const { name } = req.params;
        const { path: subPath } = req.query;
        const validation = harnessManager.validateProfileName(name);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error, code: 'INVALID_NAME' });
        }

        const result = configLoader.listSourceFiles(name, subPath || '');
        if (!result.found) {
            return res.status(404).json({ error: result.error, code: 'NOT_FOUND' });
        }

        res.json({ ok: true, files: result.files });
    } catch (err) {
        res.status(500).json({ error: err.message, code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
