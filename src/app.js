const path = require('node:path');
const { ANSI, keycap } = require('./config');
const { displayName, shorten } = require('./playlist');
const VlcPlayer = require('./vlc-player');

function createApp(tracks, musicRoot, vlcBinary) {
    let selectedIndex = 0;
    let playingIndex = -1;
    let status = 'Ready — press Enter to play';
    let numberBuffer = '';
    let numberTimer = null;
    let shuttingDown = false;
    let showHelp = false;
    let alternateScreenActive = false;
    let renderTimer = null;

    const player = new VlcPlayer(vlcBinary, ({ error } = {}) => {
        if (shuttingDown) return;
        if (error) {
            playingIndex = -1;
            status = `VLC error: ${error.message}`;
            render();
            return;
        }

        if (playingIndex >= 0 && playingIndex < tracks.length - 1) {
            playingIndex += 1;
            selectedIndex = playingIndex;
            status = `Finished — playing ${displayName(tracks[playingIndex])}`;
            player.play(tracks[playingIndex]);
        } else {
            playingIndex = -1;
            status = 'Playlist finished';
        }
        render();
    });

    function selectTrack(index) {
        if (index < 0 || index >= tracks.length) return;
        selectedIndex = index;
        playingIndex = index;
        status = `Playing ${displayName(tracks[index])}`;
        player.play(tracks[index]);
        render();
    }

    function stopPlayback() {
        player.stop();
        playingIndex = -1;
        status = 'Stopped';
        render();
    }

    function jumpToNumber() {
        if (!numberBuffer) return;
        const index = Number(numberBuffer) - 1;
        numberBuffer = '';
        if (numberTimer) clearTimeout(numberTimer);
        if (Number.isInteger(index) && index >= 0 && index < tracks.length) {
            selectTrack(index);
        } else {
            status = `No track ${index + 1}; choose 1–${tracks.length}`;
            render();
        }
    }

    function queueNumber(key) {
        numberBuffer += key;
        if (numberBuffer.length > 4) numberBuffer = numberBuffer.slice(-4);
        if (numberTimer) clearTimeout(numberTimer);
        numberTimer = setTimeout(() => {
            if (numberBuffer && Number(numberBuffer) <= tracks.length) jumpToNumber();
        }, 850);
        render();
    }

    function render() {
        const terminalWidth = Math.max(50, process.stdout.columns || 80);
        const visibleRows = Math.max(5, (process.stdout.rows || 24) - 10);
        const half = Math.floor(visibleRows / 2);
        const start = Math.min(
            Math.max(0, selectedIndex - half),
            Math.max(0, tracks.length - visibleRows)
        );
        const end = Math.min(tracks.length, start + visibleRows);
        const rootLabel = path.relative(process.cwd(), musicRoot) || '.';

        const lines = [
            `${ANSI.cyan}${ANSI.bold}♫  MUSIC PLAYER CLI${ANSI.reset}  ${ANSI.dim}${rootLabel}${ANSI.reset}`,
            `${ANSI.dim}${tracks.length} track${tracks.length === 1 ? '' : 's'} • VLC: ${path.basename(vlcBinary)}${ANSI.reset}`,
            ''
        ];

        for (let index = start; index < end; index += 1) {
            const isSelected = index === selectedIndex;
            const isPlaying = index === playingIndex;
            const marker = isPlaying ? (player.paused ? 'Ⅱ' : '▶') : ' ';
            const prefix = ` ${marker} ${String(index + 1).padStart(String(tracks.length).length, ' ')} `;
            const title = shorten(displayName(tracks[index]), Math.max(20, terminalWidth - prefix.length - 10));
            const row = `${prefix} ${title} `;
            lines.push(isSelected ? `${ANSI.inverse}${row}${ANSI.reset}` : row);
        }

        if (start > 0) lines.splice(3, 0, `${ANSI.dim}  ↑ more above${ANSI.reset}`);
        if (end < tracks.length) lines.push(`${ANSI.dim}  ↓ more below${ANSI.reset}`);
        lines.push('');
        lines.push(renderProgress(player.getProgress(), Math.min(34, Math.max(20, terminalWidth - 44))));
        lines.push(`${ANSI.yellow}${numberBuffer ? `Jump: ${numberBuffer}  •  ` : ''}${status}${ANSI.reset}`);
        lines.push(showHelp
            ? `${keycap('←/→')} ${ANSI.dim}Skip 5s${ANSI.reset}  ${keycap('↑/↓')} ${ANSI.dim}Move${ANSI.reset}  ${keycap('ENTER')} ${ANSI.dim}Play${ANSI.reset}  ${keycap('1–9999')} ${ANSI.dim}Jump${ANSI.reset}  ${keycap('SPACE')} ${ANSI.dim}Pause${ANSI.reset}  ${keycap('N/P')} ${ANSI.dim}Next/prev${ANSI.reset}  ${keycap('S')} ${ANSI.dim}Stop${ANSI.reset}  ${keycap('?')} ${ANSI.dim}Hide help${ANSI.reset}  ${keycap('Q')} ${ANSI.dim}Quit${ANSI.reset}`
            : `${keycap('←/→')} ${ANSI.dim}Skip 5s${ANSI.reset}  ${keycap('↑/↓')} ${ANSI.dim}Move${ANSI.reset}  ${keycap('ENTER')} ${ANSI.dim}Play${ANSI.reset}  ${keycap('1–9999')} ${ANSI.dim}Jump${ANSI.reset}  ${keycap('SPACE')} ${ANSI.dim}Pause${ANSI.reset}  ${keycap('N')} ${ANSI.dim}Next${ANSI.reset}  ${keycap('S')} ${ANSI.dim}Stop${ANSI.reset}  ${keycap('?')} ${ANSI.dim}Help${ANSI.reset}  ${keycap('Q')} ${ANSI.dim}Quit${ANSI.reset}`);

        process.stdout.write(`${ANSI.clear}${lines.join('\n')}`);
    }

    function renderProgress(progress, width) {
        const duration = Math.max(0, progress.durationSeconds);
        const current = duration > 0
            ? Math.min(duration, Math.max(0, progress.currentSeconds))
            : Math.max(0, progress.currentSeconds);
        const ratio = duration > 0 ? current / duration : 0;
        const filled = Math.round(ratio * width);
        const bar = `${ANSI.cyan}${'━'.repeat(filled)}${ANSI.dim}${'─'.repeat(width - filled)}${ANSI.reset}`;
        const currentLabel = progress.active ? formatTime(current, true) : '--:--';
        const durationLabel = duration > 0 ? formatTime(duration, true) : '--:--';
        return `${bar} ${currentLabel} / ${durationLabel}`;
    }

    function formatTime(seconds, showZero = false) {
        if ((!seconds || seconds < 0) && !showZero) return '--:--';
        const total = Math.floor(seconds);
        const minutes = Math.floor(total / 60);
        const remainingSeconds = String(total % 60).padStart(2, '0');
        if (minutes < 60) return `${String(minutes).padStart(2, '0')}:${remainingSeconds}`;
        const hours = Math.floor(minutes / 60);
        return `${hours}:${String(minutes % 60).padStart(2, '0')}:${remainingSeconds}`;
    }

    function handleKey(data) {
        const key = data.toString();
        if (key === '\u0003' || key.toLowerCase() === 'q') return shutdown();
        if (key === '\x1b[D' || key === '\x1bOD') return seek(-5);
        if (key === '\x1b[C' || key === '\x1bOC') return seek(5);
        if (key === '\x1b[A' || key === '\x1bOA' || key.toLowerCase() === 'k') {
            selectedIndex = Math.max(0, selectedIndex - 1);
            status = 'Ready — press Enter to play';
            return render();
        }
        if (key === '\x1b[B' || key === '\x1bOB' || key.toLowerCase() === 'j') {
            selectedIndex = Math.min(tracks.length - 1, selectedIndex + 1);
            status = 'Ready — press Enter to play';
            return render();
        }
        if (key === '\r' || key === '\n') return numberBuffer ? jumpToNumber() : selectTrack(selectedIndex);
        if (key === ' ') {
            if (player.togglePause()) {
                status = player.paused ? 'Paused' : `Playing ${displayName(tracks[playingIndex])}`;
            } else {
                status = process.platform === 'win32'
                    ? 'Pause is available on macOS/Linux terminals'
                    : 'Nothing is playing';
            }
            return render();
        }
        if (key.toLowerCase() === 's') return stopPlayback();
        if (key.toLowerCase() === 'n') {
            return selectTrack(Math.min(
                tracks.length - 1,
                (playingIndex >= 0 ? playingIndex : selectedIndex) + 1
            ));
        }
        if (key.toLowerCase() === 'p') {
            return selectTrack(Math.max(
                0,
                (playingIndex >= 0 ? playingIndex : selectedIndex) - 1
            ));
        }
        if (key === '?') {
            showHelp = !showHelp;
            return render();
        }
        if (/^\d$/.test(key)) return queueNumber(key);
    }

    function seek(seconds) {
        if (player.seekBy(seconds)) {
            status = `${seconds < 0 ? 'Skipped back' : 'Skipped forward'} 5 seconds`;
        } else {
            status = 'Nothing is playing';
        }
        render();
    }

    function shutdown() {
        if (shuttingDown) return;
        shuttingDown = true;
        if (numberTimer) clearTimeout(numberTimer);
        if (renderTimer) clearInterval(renderTimer);
        player.stop();
        if (process.stdin.isTTY) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }
        if (alternateScreenActive) {
            process.stdout.write(`${ANSI.reset}${ANSI.showCursor}${ANSI.alternateScreenOff}`);
            alternateScreenActive = false;
        }
        process.stdout.write('Goodbye!\n');
    }

    return {
        start() {
            if (!process.stdin.isTTY) {
                throw new Error('This player needs an interactive terminal (TTY).');
            }
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');
            process.stdin.on('data', handleKey);
            process.once('SIGINT', shutdown);
            process.once('exit', () => {
                if (renderTimer) clearInterval(renderTimer);
                player.stop();
                if (alternateScreenActive) {
                    process.stdout.write(`${ANSI.reset}${ANSI.showCursor}${ANSI.alternateScreenOff}`);
                }
            });
            process.stdout.write(`${ANSI.alternateScreenOn}${ANSI.hideCursor}${ANSI.clear}`);
            alternateScreenActive = true;
            renderTimer = setInterval(render, 500);
            render();
        },
        shutdown
    };
}

module.exports = createApp;
