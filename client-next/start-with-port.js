const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
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

findAvailablePort(DEFAULT_PORT).then(port => {
    process.env.PORT = port.toString();

    // Production mode starts the precompiled app (fast, low CPU/disk — important
    // on laptops where AV software scans every file node touches). Dev mode
    // compiles routes on demand and is only a fallback for contributors or
    // installs where the build step has not run yet.
    const hasBuild = fs.existsSync(path.join(__dirname, '.next', 'BUILD_ID'));
    const mode = hasBuild ? 'start' : 'dev';

    if (hasBuild) {
        console.log(`Starting Next.js (production) on port ${port}`);
    } else {
        console.log(`No production build found - starting Next.js dev server on port ${port}`);
        console.log('Tip: run "npm run build" in client-next for much faster startup.');
    }

    // Use process.execPath (the currently running node) instead of 'node' from PATH,
    // so it works even when node isn't on the system PATH (portable/nvm installs).
    const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
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
