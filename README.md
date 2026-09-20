# Music Player CLI

A small, keyboard-first music player for Node.js that uses VLC for playback. It has no npm runtime dependencies.

## Requirements

- Node.js 18 or newer
- VLC installed and available as `cvlc` or `vlc`

On macOS, VLC can be installed with `brew install --cask vlc`. On Debian/Ubuntu, install the `vlc` package.

## Run it

```bash
npm start -- /path/to/your/music
```

If no directory is supplied, the project's `music/` directory is scanned recursively. To scan another directory, pass it as the first argument. To use a non-standard VLC location:

```bash
VLC_PATH="/path/to/vlc" npm start -- /path/to/your/music
```

## Controls

| Key | Action |
| --- | --- |
| `↑` / `↓` or `k` / `j` | Select a track |
| `Enter` | Play the selected track |
| `1`–`9999` | Jump to a track number; press Enter or wait briefly |
| `Space` | Pause/resume through VLC |
| `n` / `p` | Play next/previous track |
| `s` | Stop playback |
| `?` | Show the full help line |
| `q` / `Ctrl+C` | Quit |

The playlist is sorted by filename and supports common formats including MP3, FLAC, WAV, M4A, OGG, AAC, Opus, AIFF, and WMA.

Playback commands are sent through VLC's remote-control interface, including pause/resume, stop, and quit.

## Project structure

```text
src/
├── index.js       # CLI startup, argument handling, and VLC discovery
├── config.js      # Audio extensions and terminal styling
├── playlist.js    # Recursive music-file discovery and display helpers
├── vlc-player.js  # VLC process lifecycle and pause/stop controls
└── app.js         # Interactive keyboard UI and playlist state
```
