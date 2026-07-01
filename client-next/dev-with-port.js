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

    // Use the local next binary directly (avoids npx spawning a sub-shell/window)
    const nextBin = path.join(__dirname, 'node_modules', 'next', 'dist', 'bin', 'next');
    const dev = spawn('node', [nextBin, 'dev'], {
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
