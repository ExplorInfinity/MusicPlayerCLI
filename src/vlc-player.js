const { spawn } = require('node:child_process');

class VlcPlayer {
    constructor(binary, onTrackFinished) {
        this.binary = binary;
        this.onTrackFinished = onTrackFinished;
        this.process = null;
        this.intentionalStop = false;
        this.paused = false;
    }

    play(filePath) {
        this.stop();
        this.intentionalStop = false;

        // --play-and-exit makes the child process lifecycle match the selected song.
        const child = spawn(this.binary, ['--intf', 'dummy', '--play-and-exit', filePath], {
            stdio: 'ignore',
            windowsHide: true
        });
        this.process = child;
        this.paused = false;

        child.once('error', (error) => {
            if (this.process !== child) return;
            if (!this.intentionalStop) this.onTrackFinished({ error });
        });
        child.once('exit', (code, signal) => {
            // A previous VLC process can finish after a new track has started.
            if (this.process !== child) return;
            const wasIntentional = this.intentionalStop;
            this.process = null;
            this.paused = false;
            if (!wasIntentional) this.onTrackFinished({ code, signal });
        });
    }

    togglePause() {
        if (!this.process || process.platform === 'win32') return false;
        try {
            process.kill(this.process.pid, this.paused ? 'SIGCONT' : 'SIGSTOP');
            this.paused = !this.paused;
            return true;
        } catch {
            return false;
        }
    }

    stop() {
        if (!this.process) return;
        this.intentionalStop = true;
        try {
            this.process.kill('SIGTERM');
        } catch {
            // The process may have ended between the check and the signal.
        }
        this.process = null;
        this.paused = false;
    }
}

module.exports = VlcPlayer;
