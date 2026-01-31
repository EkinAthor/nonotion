const { execSync } = require('child_process');

const PORTS = {
    API: 3001,
    WEB: 5173
};

function getPidOnPort(port) {
    try {
        const isWindows = process.platform === 'win32';
        if (isWindows) {
            const output = execSync(`netstat -ano | findstr :${port}`).toString();
            const lines = output.trim().split('\n');
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 5 && parts[1].endsWith(`:${port}`)) {
                    return parts[parts.length - 1];
                }
            }
        } else {
            const output = execSync(`lsof -i :${port} -t`).toString();
            return output.trim();
        }
    } catch (e) {
        return null;
    }
    return null;
}

function stopProcess(pid) {
    try {
        const isWindows = process.platform === 'win32';
        if (isWindows) {
            execSync(`taskkill /F /PID ${pid}`);
        } else {
            execSync(`kill -9 ${pid}`);
        }
        return true;
    } catch (e) {
        return false;
    }
}

function status() {
    console.log('Checking application status...');
    let anyRunning = false;
    for (const [name, port] of Object.entries(PORTS)) {
        const pid = getPidOnPort(port);
        if (pid) {
            console.log(`[RUNNING] ${name} on port ${port} (PID: ${pid})`);
            anyRunning = true;
        } else {
            console.log(`[STOPPED] ${name} on port ${port}`);
        }
    }
    if (!anyRunning) {
        console.log('No processes found on application ports.');
    }
}

function stop() {
    console.log('Stopping application processes...');
    let killedCount = 0;
    for (const [name, port] of Object.entries(PORTS)) {
        const pid = getPidOnPort(port);
        if (pid) {
            process.stdout.write(`Killing ${name} (PID: ${pid})... `);
            if (stopProcess(pid)) {
                console.log('Done.');
                killedCount++;
            } else {
                console.log('Failed.');
            }
        }
    }
    if (killedCount === 0) {
        console.log('No processes found to stop.');
    } else {
        console.log(`Stopped ${killedCount} processes.`);
    }
}

const command = process.argv[2];

if (command === 'status') {
    status();
} else if (command === 'stop') {
    stop();
} else {
    console.log('Usage: node scripts/dev-tool.js [status|stop]');
    process.exit(1);
}
