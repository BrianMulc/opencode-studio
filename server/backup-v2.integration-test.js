// Integration test for backup v2 against live server instances, each running
// with a throwaway HOME (fresh-machine simulation). Not a vitest file — run
// directly: node backup-v2.integration-test.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const SERVER_DIR = __dirname;

let failed = 0;
const check = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`); if (!cond) failed++; };

function seedFull(home) {
    const profilesDir = path.join(home, '.config', 'opencode-profiles');
    fs.mkdirSync(path.join(profilesDir, 'default', 'agents'), { recursive: true });
    fs.mkdirSync(path.join(profilesDir, 'default', 'skills', 'review'), { recursive: true });
    fs.mkdirSync(path.join(profilesDir, 'default', 'plugin'), { recursive: true });
    fs.mkdirSync(path.join(profilesDir, 'default', 'command'), { recursive: true });
    fs.mkdirSync(path.join(profilesDir, 'default', 'node_modules', 'noise'), { recursive: true });
    fs.writeFileSync(path.join(profilesDir, 'default', 'opencode.json'), JSON.stringify({ model: 'default/model', mcp: { fs: { type: 'local', command: ['npx', 'fs'] } } }, null, 2));
    fs.writeFileSync(path.join(profilesDir, 'default', 'agents', 'helper.md'), '# helper agent');
    fs.writeFileSync(path.join(profilesDir, 'default', 'command', 'deploy.md'), '# deploy cmd');
    fs.writeFileSync(path.join(profilesDir, 'default', 'OPENCODE.md'), 'global prompt');
    fs.writeFileSync(path.join(profilesDir, 'default', 'oh-my-openagent.json'), '{"agents":{}}');
    fs.writeFileSync(path.join(profilesDir, 'default', 'skills', 'review', 'SKILL.md'), '# review skill');
    fs.writeFileSync(path.join(profilesDir, 'default', 'skills', 'review', 'extra.py'), 'print(1)');
    fs.writeFileSync(path.join(profilesDir, 'default', 'plugin', 'watcher.ts'), 'export default {}');
    fs.writeFileSync(path.join(profilesDir, 'default', 'node_modules', 'noise', 'index.js'), 'x');
    fs.mkdirSync(path.join(profilesDir, 'work'), { recursive: true });
    fs.writeFileSync(path.join(profilesDir, 'work', 'opencode.json'), JSON.stringify({ model: 'work/model' }));
    fs.writeFileSync(path.join(profilesDir, 'work', '.ocs-linked-source.json'), '{"configUrl":"https://example.com/c.json"}');

    const studioDir = path.join(home, '.config', 'opencode-studio');
    fs.mkdirSync(studioDir, { recursive: true });
    fs.writeFileSync(path.join(studioDir, 'studio.json'), JSON.stringify({ someSetting: true, cloudToken: 'SECRET-TOKEN', cloudRefreshToken: 'SECRET-REFRESH', cloudProvider: 'dropbox' }));
    fs.writeFileSync(path.join(studioDir, 'agent-presets.json'), '{"presets":[]}');
    fs.writeFileSync(path.join(studioDir, 'update.log'), 'noise');

    // Rules file OUTSIDE the config dir (findRulesFile walks up to find it).
    fs.writeFileSync(path.join(home, '.config', 'AGENTS.md'), '# global rules');
}

function startServer(home, port) {
    const proc = spawn(process.execPath, ['index.js'], {
        cwd: SERVER_DIR,
        env: { ...process.env, USERPROFILE: home, HOME: home, HOMEDRIVE: '', HOMEPATH: '', OCS_SKIP_CLIENT_SPAWN: '1', OCS_PORT: String(port) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const ready = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server start timeout\n' + out)), 30000);
        let out = '';
        proc.stdout.on('data', d => {
            out += d;
            const m = out.match(/Server running at http:\/\/localhost:(\d+)/);
            if (m) { clearTimeout(timer); resolve(Number(m[1])); }
        });
        proc.stderr.on('data', d => { out += d; });
        proc.on('exit', code => { clearTimeout(timer); reject(new Error(`server exited ${code}\n${out}`)); });
    });
    return { proc, ready };
}

async function stopServer(proc) {
    try { proc.kill('SIGTERM'); } catch {}
    await new Promise(r => setTimeout(r, 1500));
    try { proc.kill(); } catch {}
}

async function phase1() {
    console.log('--- phase 1: full backup + restore round-trip (json config) ---');
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-it1-'));
    seedFull(home);
    const { proc, ready } = startServer(home, 1987);
    try {
        await ready;
        const base = 'http://127.0.0.1:1987';

        const profilesRes = await fetch(`${base}/api/profiles`).then(r => r.json());
        check('profiles listed (default, work)', JSON.stringify(profilesRes.profiles) === JSON.stringify(['default', 'work']));
        check('active profile is default', profilesRes.active === 'default');

        const backup = await fetch(`${base}/api/backup`).then(r => r.json());

        check('version is 2', backup.version === 2);
        check('activeProfile = default', backup.activeProfile === 'default');
        const cfgPaths = (backup.configDir?.files || []).map(f => f.path);
        for (const expected of ['opencode.json', 'agents/helper.md', 'command/deploy.md', 'OPENCODE.md', 'oh-my-openagent.json', 'skills/review/SKILL.md', 'skills/review/extra.py', 'plugin/watcher.ts']) {
            check(`configDir has ${expected}`, cfgPaths.includes(expected));
        }
        check('configDir excludes node_modules', !cfgPaths.some(p => p.startsWith('node_modules')));

        check('profiles.default tree present', Array.isArray(backup.profiles?.default?.files));
        check('profiles.work tree present', Array.isArray(backup.profiles?.work?.files));
        check('work profile keeps linked-source marker', (backup.profiles?.work?.files || []).some(f => f.path === '.ocs-linked-source.json'));

        const studioPaths = (backup.studioDir?.files || []).map(f => f.path);
        check('studioDir has studio.json', studioPaths.includes('studio.json'));
        check('studioDir has agent-presets.json', studioPaths.includes('agent-presets.json'));
        check('studioDir excludes update.log', !studioPaths.includes('update.log'));
        check('local backup keeps studio.json content', (backup.studioDir.files.find(f => f.path === 'studio.json')?.content || '').includes('SECRET-TOKEN'));

        check('rulesFile captured from parent dir', backup.rulesFile?.content === '# global rules' && backup.rulesFile?.fileName === 'AGENTS.md' && backup.rulesFile?.inConfigDir === false);

        // --- Restore round-trip (v2) ---
        // Precedence: raw tree bytes win over the redundant parsed
        // opencodeConfig field (that's what protects .jsonc files and keeps
        // comments/formatting intact).
        backup.opencodeConfig.model = 'ignored/model';
        const treeEntry = backup.profiles.default.files.find(f => f.path === 'opencode.json');
        treeEntry.content = JSON.stringify({ model: 'tree/model' });
        const restoreRes = await fetch(`${base}/api/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) }).then(r => r.json());
        check('restore succeeds', restoreRes.success === true);
        const onDisk = JSON.parse(fs.readFileSync(path.join(home, '.config', 'opencode-profiles', 'default', 'opencode.json'), 'utf8'));
        check('tree bytes win over opencodeConfig field', onDisk.model === 'tree/model');
        check('junction still points at default', fs.existsSync(path.join(home, '.config', 'opencode', 'agents', 'helper.md')));
        check('rules file restored into active config dir', fs.readFileSync(path.join(home, '.config', 'opencode', 'AGENTS.md'), 'utf8') === '# global rules');

        // --- v1 backward compatibility ---
        const v1 = { version: 1, opencodeConfig: { model: 'v1/model' }, skills: [{ name: 'legacy', content: '# legacy' }], plugins: [{ name: 'legacyplug', content: 'x=1' }] };
        const v1Res = await fetch(`${base}/api/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(v1) }).then(r => r.json());
        check('v1 restore succeeds', v1Res.success === true);
        const v1Disk = JSON.parse(fs.readFileSync(path.join(home, '.config', 'opencode', 'opencode.json'), 'utf8'));
        check('v1 restore wrote config', v1Disk.model === 'v1/model');
        check('v1 restore wrote skill', fs.readFileSync(path.join(home, '.config', 'opencode', 'skills', 'legacy', 'SKILL.md'), 'utf8') === '# legacy');
        check('v1 restore wrote plugin', fs.existsSync(path.join(home, '.config', 'opencode', 'plugin', 'legacyplug.js')));

        // --- path traversal guard ---
        const evil = { version: 2, configDir: { files: [{ path: '..\\..\\evil.txt', content: 'x' }] } };
        const evilRes = await fetch(`${base}/api/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(evil) });
        check('traversal restore rejected (400)', evilRes.status === 400);
        check('no evil file written', !fs.existsSync(path.join(home, 'evil.txt')) && !fs.existsSync(path.join(home, '.config', 'evil.txt')));
    } finally {
        await stopServer(proc);
        try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
    }
}

async function phase2() {
    console.log('--- phase 2: opencode.jsonc survives fresh-machine restore (no duplicate .json) ---');
    const JSONC = '{\n  // a comment — plain JSON.parse would choke on this\n  "model": "jsonc/model"\n}\n';
    const homeB = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-it2b-'));
    const homeC = fs.mkdtempSync(path.join(os.tmpdir(), 'ocs-it2c-')); // fresh machine: nothing seeded
    fs.mkdirSync(path.join(homeB, '.config', 'opencode-profiles', 'default'), { recursive: true });
    fs.writeFileSync(path.join(homeB, '.config', 'opencode-profiles', 'default', 'opencode.jsonc'), JSONC);

    const srvB = startServer(homeB, 1988);
    let backup;
    try {
        await srvB.ready;
        const base = 'http://127.0.0.1:1988';
        await fetch(`${base}/api/profiles`); // init profile junction
        backup = await fetch(`${base}/api/backup`).then(r => r.json());
        check('jsonc: backup configDir has opencode.jsonc', (backup.configDir?.files || []).some(f => f.path === 'opencode.jsonc'));
        check('jsonc: backup configDir has no opencode.json', !(backup.configDir?.files || []).some(f => f.path === 'opencode.json'));
    } finally {
        await stopServer(srvB.proc);
    }

    const srvC = startServer(homeC, 1989);
    try {
        await srvC.ready;
        const base = 'http://127.0.0.1:1989';
        const res = await fetch(`${base}/api/restore`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) });
        check('jsonc: fresh-machine restore succeeds', res.status === 200);
        const liveDir = path.join(homeC, '.config', 'opencode');
        check('jsonc: opencode.jsonc restored', fs.readFileSync(path.join(liveDir, 'opencode.jsonc'), 'utf8') === JSONC);
        check('jsonc: no duplicate opencode.json written', !fs.existsSync(path.join(liveDir, 'opencode.json')));
        check('jsonc: profile tree restored too', fs.existsSync(path.join(homeC, '.config', 'opencode-profiles', 'default', 'opencode.jsonc')));
    } finally {
        await stopServer(srvC.proc);
        try { fs.rmSync(homeB, { recursive: true, force: true }); } catch {}
        try { fs.rmSync(homeC, { recursive: true, force: true }); } catch {}
    }
}

async function main() {
    try {
        await phase1();
        await phase2();
    } catch (err) {
        console.error('TEST RUN ERROR:', err);
        failed++;
    }
    console.log(failed === 0 ? '\nALL CHECKS PASSED' : `\n${failed} CHECK(S) FAILED`);
    process.exit(failed === 0 ? 0 : 1);
}

main();
