const net = require('net');
const path = require('path');
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
    console.log(`Starting Next.js on port ${port}`);

    // Use process.execPath (the currently running node) instead of 'node' from PATH,
    // so it works even when node isn't on the system PATH (portable/nvm installs).
    const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
    const dev = spawn(process.execPath, [nextBin, 'dev'], {
        stdio: 'inherit',
        windowsHide: true
    });

    dev.on('error', (err) => {
        console.error('Failed to start dev server:', err);
        process.exit(1);
    });

    process.on('SIGTERM', () => {
        dev.kill('SIGTERM');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        dev.kill('SIGINT');
        process.exit(0);
    });
});
