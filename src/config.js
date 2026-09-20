const AUDIO_EXTENSIONS = new Set([
    '.aac', '.aiff', '.ape', '.flac', '.m4a', '.mp3', '.ogg', '.opus',
    '.wav', '.webm', '.wma'
]);

const ANSI = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    blue: '\x1b[34m',
    inverse: '\x1b[7m',
    clear: '\x1b[2J\x1b[H',
    alternateScreenOn: '\x1b[?1049h',
    alternateScreenOff: '\x1b[?1049l',
    hideCursor: '\x1b[?25l',
    showCursor: '\x1b[?25h'
};

function keycap(value) {
    return `${ANSI.cyan}${ANSI.bold}[${value}]${ANSI.reset}`;
}

module.exports = { AUDIO_EXTENSIONS, ANSI, keycap };
