const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn, spawnSync } = require('child_process');
const DEFAULT_PORT = 1080;

function findAvailablePort(startPort) {
    return new Promise((resolve) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            server.once('close', () => resolve(startPort));
            server.close();
        });
        server.on('error', () => {
            findAvailablePort(startPort + 1).then(resolve);
        });
    });
}

const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
const buildIdPath = path.join(__dirname, '.next', 'BUILD_ID');
const buildFailedMarker = path.join(__dirname, '.next', '.build-failed');

// Don't retry a failed auto-build more than once a day, otherwise every
// launch would stall for minutes on a machine where the build keeps failing.
function buildRecentlyFailed() {
    try {
        const failedAt = Number(fs.readFileSync(buildFailedMarker, 'utf8'));
        return Date.now() - failedAt < 24 * 60 * 60 * 1000;
    } catch {
        return false;
    }
}

function ensureProductionBuild() {
    if (fs.existsSync(buildIdPath)) return true;
    if (buildRecentlyFailed()) return false;

    // Self-heal: installs updated from an older version (whose updater deleted
    // .next without rebuilding) have no build yet. Build once now instead of
    // staying in slow dev mode forever.
    console.log('No production build found - building now (one-time, may take a few minutes)...');
    const result = spawnSync(process.execPath, [nextBin, 'build'], {
        cwd: __dirname,
        stdio: 'inherit',
        windowsHide: true
    });

    const ok = result.status === 0 && fs.existsSync(buildIdPath);
    try {
        if (ok) {
            if (fs.existsSync(buildFailedMarker)) fs.unlinkSync(buildFailedMarker);
        } else {
            fs.writeFileSync(buildFailedMarker, String(Date.now()), 'utf8');
        }
    } catch {}
    return ok;
}

findAvailablePort(DEFAULT_PORT).then(port => {
    process.env.PORT = port.toString();

    // Production mode starts the precompiled app (fast, low CPU/disk — important
    // on laptops where AV software scans every file node touches). Dev mode
    // compiles routes on demand and is only a last-resort fallback.
    const hasBuild = ensureProductionBuild();
    const mode = hasBuild ? 'start' : 'dev';

    if (hasBuild) {
        console.log(`Starting Next.js (production) on port ${port}`);
    } else {
        console.log(`Starting Next.js dev server on port ${port}`);
        console.log('Tip: run "npm run build" in client-next for much faster startup.');
    }

    // Use process.execPath (the currently running node) instead of 'node' from PATH,
    // so it works even when node isn't on the system PATH (portable/nvm installs).
    const child = spawn(process.execPath, [nextBin, mode], {
        cwd: __dirname,
        stdio: 'inherit',
        windowsHide: true
    });

    child.on('error', (err) => {
        console.error('Failed to start Next.js server:', err);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        child.kill('SIGTERM');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        child.kill('SIGINT');
        process.exit(0);
    });
});
