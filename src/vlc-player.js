const { spawn } = require('node:child_process');

const POLL_INTERVAL_MS = 350;
const QUERY_TIMEOUT_MS = 1500;
const START_GRACE_PERIOD_MS = 1500;
const SEEK_SYNC_GRACE_PERIOD_MS = 1200;

class VlcPlayer {
    constructor(binary, onTrackFinished) {
        this.binary = binary;
        this.onTrackFinished = onTrackFinished;
        this.process = null;
        this.intentionalStop = false;
        this.paused = false;
        this.progressTimer = null;
        this.outputBuffer = '';
        this.pendingQuery = null;
        this.queryIndex = 0;
        this.durationSeconds = 0;
        this.currentSeconds = 0;
        this.startedAt = 0;
        this.hasPlayed = false;
        this.clockUpdatedAt = 0;
        this.ignoreTimeUntil = 0;
    }

    play(filePath) {
        this.stop();
        this.intentionalStop = false;

        // VLC's rc interface accepts commands through stdin. We deliberately
        // keep the process alive after the track ends so VLC can pause safely;
        // end-of-track detection is handled by the polling loop below.
        const child = spawn(this.binary, [
            '--intf', 'dummy',
            '--extraintf', 'rc',
            '--rc-fake-tty',
            filePath
        ], {
            stdio: ['pipe', 'pipe', 'ignore'],
            windowsHide: true
        });

        this.process = child;
        this.paused = false;
        this.outputBuffer = '';
        this.pendingQuery = null;
        this.queryIndex = 0;
        this.durationSeconds = 0;
        this.currentSeconds = 0;
        this.startedAt = Date.now();
        this.hasPlayed = false;
        this.clockUpdatedAt = this.startedAt;
        this.ignoreTimeUntil = 0;

        child.stdout.setEncoding('utf8');
        child.stdout.on('data', (data) => this.handleOutput(child, data));
        child.stdin.on('error', () => {
            // VLC may close its command input while exiting.
        });
        child.once('error', (error) => {
            if (this.process !== child) return;
            this.clearProgressPolling();
            if (!this.intentionalStop) this.onTrackFinished({ error });
        });
        child.once('exit', (code, signal) => {
            // A previous VLC process can finish after a new track has started.
            if (this.process !== child) return;
            this.clearProgressPolling();
            const wasIntentional = this.intentionalStop;
            this.process = null;
            this.paused = false;
            if (!wasIntentional) this.onTrackFinished({ code, signal });
        });

        this.progressTimer = setInterval(() => this.pollProgress(child), POLL_INTERVAL_MS);
    }

    togglePause() {
        if (!this.process) return false;
        this.refreshLocalClock();
        const sent = this.sendCommand('pause');
        if (sent) {
            this.paused = !this.paused;
            this.clockUpdatedAt = Date.now();
        }
        return sent;
    }

    seekBy(seconds) {
        if (!this.process) return false;
        this.refreshLocalClock();
        const maximum = this.durationSeconds > 0 ? this.durationSeconds : Number.POSITIVE_INFINITY;
        const target = Math.min(
            maximum,
            Math.max(0, Math.floor(this.currentSeconds + seconds))
        );
        // Do not let a pre-seek get_time response overwrite the new position.
        this.pendingQuery = null;
        this.queryIndex = 0;
        this.ignoreTimeUntil = Date.now() + SEEK_SYNC_GRACE_PERIOD_MS;
        const sent = this.sendCommand(`seek ${target}`);
        if (sent) {
            this.currentSeconds = target;
            this.clockUpdatedAt = Date.now();
            this.hasPlayed = true;
            // VLC can remain stopped after a seek on some inputs. Resume only
            // when the player was already playing; a paused track stays paused.
            if (!this.paused) this.sendCommand('play');
        }
        return sent;
    }

    stop() {
        if (!this.process) return;
        const child = this.process;
        this.process = null;
        this.intentionalStop = true;
        this.clearProgressPolling();
        try {
            child.stdin.write(`stop${String.fromCharCode(10)}quit${String.fromCharCode(10)}`);
            child.stdin.end();
        } catch {
            // VLC may have ended between the check and the command.
        }
        this.paused = false;
        this.clockUpdatedAt = 0;
    }

    sendCommand(command) {
        if (!this.process || !this.process.stdin.writable) return false;
        try {
            this.process.stdin.write(`${command}${String.fromCharCode(10)}`);
            return true;
        } catch {
            return false;
        }
    }

    getProgress() {
        this.refreshLocalClock();
        return {
            currentSeconds: this.currentSeconds,
            durationSeconds: this.durationSeconds,
            active: Boolean(this.process)
        };
    }

    refreshLocalClock() {
        if (!this.process || this.paused || !this.hasPlayed || !this.clockUpdatedAt) return;
        const now = Date.now();
        this.currentSeconds += (now - this.clockUpdatedAt) / 1000;
        this.clockUpdatedAt = now;
        if (this.durationSeconds > 0) {
            this.currentSeconds = Math.min(this.currentSeconds, this.durationSeconds);
        }
    }

    pollProgress(child) {
        if (this.process !== child) return this.clearProgressPolling();

        if (this.pendingQuery && Date.now() - this.pendingQuery.sentAt > QUERY_TIMEOUT_MS) {
            this.pendingQuery = null;
        }
        if (this.pendingQuery) return;

        const commands = this.durationSeconds > 0
            ? ['get_time', 'is_playing']
            : ['get_length', 'get_time', 'is_playing'];
        const command = commands[this.queryIndex % commands.length];
        this.queryIndex += 1;
        this.pendingQuery = { command, sentAt: Date.now() };
        if (!this.sendCommand(command)) this.pendingQuery = null;
    }

    handleOutput(child, data) {
        if (this.process !== child) return;
        this.outputBuffer += data;
        const lines = this.outputBuffer.split(/\r?\n/);
        this.outputBuffer = lines.pop() || '';

        for (const line of lines) {
            const value = line.trim();
            const numericResponse = value.match(/^>\s*(\d+)$/) || value.match(/^(\d+)$/);
            if (!this.pendingQuery || !numericResponse) continue;

            const query = this.pendingQuery.command;
            this.pendingQuery = null;
            const number = Number(numericResponse[1]);
            if (query === 'get_length') this.durationSeconds = number;
            if (query === 'get_time') {
                if (Date.now() >= this.ignoreTimeUntil) {
                    this.currentSeconds = number;
                    this.clockUpdatedAt = Date.now();
                }
                if (number > 0) this.hasPlayed = true;
            }
            if (query === 'is_playing') {
                if (number === 1) this.hasPlayed = true;
                if (
                    number === 0 &&
                    this.hasPlayed &&
                    !this.paused &&
                    Date.now() - this.startedAt > START_GRACE_PERIOD_MS
                ) {
                    this.finishNaturally(child);
                }
            }

            if (
                query === 'get_time' &&
                this.durationSeconds > 0 &&
                number >= this.durationSeconds - 1 &&
                !this.paused
            ) {
                this.finishNaturally(child);
            }
        }
    }

    finishNaturally(child) {
        if (this.process !== child) return;
        this.process = null;
        this.clearProgressPolling();
        try {
            child.stdin.write(`quit${String.fromCharCode(10)}`);
            child.stdin.end();
        } catch {
            // VLC may already be shutting down at the end of the track.
        }
        this.paused = false;
        this.onTrackFinished({ natural: true });
    }

    clearProgressPolling() {
        if (this.progressTimer) clearInterval(this.progressTimer);
        this.progressTimer = null;
        this.pendingQuery = null;
    }
}

module.exports = VlcPlayer;
