const fs = require('node:fs');
const path = require('node:path');
const { AUDIO_EXTENSIONS } = require('./config');

function findTracks(root) {
    const tracks = [];

    function visit(directory) {
        let entries;
        try {
            entries = fs.readdirSync(directory, { withFileTypes: true });
        } catch (error) {
            if (error.code !== 'EACCES') throw error;
            return;
        }

        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue;
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                visit(fullPath);
            } else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                tracks.push(fullPath);
            }
        }
    }

    visit(root);
    return tracks.sort((a, b) => a.localeCompare(b, undefined, {
        numeric: true,
        sensitivity: 'base'
    }));
}

function displayName(filePath) {
    return path.basename(filePath, path.extname(filePath));
}

function shorten(value, width) {
    if (value.length <= width) return value;
    return `${value.slice(0, Math.max(0, width - 1))}…`;
}

module.exports = { findTracks, displayName, shorten };
