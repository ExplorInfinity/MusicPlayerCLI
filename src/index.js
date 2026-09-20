#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AUDIO_EXTENSIONS } = require('./config');
const { findTracks } = require('./playlist');
const createApp = require('./app');

function printHelp() {
    console.log(`
Music Player CLI

Usage:
  npm start -- [music-directory]
  node src/index.js [music-directory]

The directory is searched recursively. If omitted, the project's "music" directory is used.
VLC must be installed and available as either "cvlc" or "vlc".
`);
}

function findVlc() {
    if (process.env.VLC_PATH) return process.env.VLC_PATH;

    const locator = process.platform === 'win32' ? 'where' : 'which';
    const candidates = process.platform === 'win32' ? ['vlc.exe', 'vlc'] : ['cvlc', 'vlc'];
    for (const candidate of candidates) {
        const result = spawnSync(locator, [candidate], { encoding: 'utf8' });
        if (result.status === 0 && result.stdout.trim()) {
            return result.stdout.trim().split(/\r?\n/)[0];
        }
    }

    return null;
}

function main() {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) return printHelp();

    const projectDirectory = path.resolve(__dirname, '..');
    const defaultMusicDirectory = path.join(projectDirectory, 'music');
    const root = path.resolve(args[0] || defaultMusicDirectory);

    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
        console.error(`Music directory not found: ${root}`);
        process.exitCode = 1;
        return;
    }

    const vlcBinary = findVlc();
    if (!vlcBinary) {
        console.error('VLC was not found. Install VLC and ensure "cvlc" or "vlc" is on PATH.');
        console.error('You can also set VLC_PATH to the full path of the VLC executable.');
        process.exitCode = 1;
        return;
    }

    let tracks;
    try {
        tracks = findTracks(root);
    } catch (error) {
        console.error(`Could not scan ${root}: ${error.message}`);
        process.exitCode = 1;
        return;
    }

    if (tracks.length === 0) {
        console.error(`No supported audio files found in ${root}.`);
        console.error(`Supported extensions: ${[...AUDIO_EXTENSIONS].join(', ')}`);
        process.exitCode = 1;
        return;
    }

    try {
        createApp(tracks, root, vlcBinary).start();
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

main();
