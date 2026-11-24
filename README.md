<div align="center">

# Youtube Music for Desktop

**A lightweight, YouTube-themed desktop player for YouTube Music, without a browser eating your RAM.**

Your playlists, Liked Music, artist pages and time-synced lyrics in a fast native window. Streaming only, no downloads.

[![License: MIT](https://img.shields.io/badge/license-MIT-red.svg)](LICENSE)
[![Built with Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202-ffc131.svg?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/UI-React%20%2B%20TypeScript-61dafb.svg?logo=react&logoColor=white)](https://react.dev)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)](#install)

<!-- Add a screenshot here: ![Screenshot](docs/screenshot.png) -->

</div>

> [!IMPORTANT]
> **Unofficial project.** Not affiliated with, endorsed by, or sponsored by Google or YouTube. "YouTube" and "YouTube Music" are trademarks of Google LLC. This app does not download, record, or extract audio: playback is done by YouTube Music's own web player, so your Premium status, ads and account rules apply exactly as they do in the browser.

---

## Features

| Feature | Description |
| --- | --- |
| **Google sign-in** | Signs in through Google's own page. The app never sees your password. |
| **Home, search and library** | Home feed, search, your playlists in the sidebar, albums and Liked Music. |
| **Artist pages** | Click any artist name to see their songs and albums. |
| **Album links** | Click a song name to jump to the album it belongs to. |
| **Now Playing viewer** | Click empty space in the player bar for large artwork, track details and lyrics. |
| **Synced lyrics** | Time-synced lyrics that follow the song. Click a line to jump to it. |
| **Full controls** | Play/pause, previous/next, seek, volume, shuffle and repeat with clear on/off states. |
| **Media keys and tray** | OS media keys work, plus a system tray with play/pause/next/previous. Closing the window keeps music playing. |
| **Like and dislike** | Thumbs up and down in the player bar and Now Playing view, and in every song's menu. |
| **Playlist controls** | Add a song to any playlist or a new one, remove songs, rename and delete your own playlists. |
| **Search in a playlist** | Filter any playlist, album or Liked Music by title, artist or album. Ctrl+F jumps to the filter. |
| **Mini-player** | A small always-on-top window with the song and basic controls. |
| **Listening history and stats** | Your top songs and artists by week, month, year or all time, plus recent plays. |
| **ListenBrainz scrobbling** | Optionally send what you listen to to your ListenBrainz account. |
| **Explore** | New releases, charts, and moods and genres, from the Explore page in the sidebar. |
| **Search suggestions and filters** | Suggestions as you type, recent searches, and result filters for songs, albums, artists and playlists. |
| **Library tabs** | Browse your playlists, songs, albums and artists. |
| **Windows media overlay** | Song, artwork and controls in the Windows volume flyout and on the lock screen. |
| **Updates** | Checks GitHub for a newer version, with optional one-click in-app updating. |
| **Diagnostics** | A panel showing what the app can see of the player, with a report you can copy. |
| **Queue** | See what plays next and jump to any song in it. |
| **Remembers shuffle and repeat** | Your shuffle and repeat choices are re-applied automatically after each song change. |
| **Custom keyboard shortcuts** | Assign your own system-wide shortcuts to play/pause, next, previous, volume and more. |
| **Settings page** | Launch at startup, start minimized, close-to-tray, media keys and Discord, all saved between runs. |
| **Discord Rich Presence** | Shows the song, artist, artwork and a progress bar on your Discord profile. |
| **Remembers your volume** | Your volume level is kept across songs and restarts. |
| **Fast on big libraries** | Liked Music shows the first songs immediately and loads the rest in the background. |
| **Lightweight** | Uses the system webview instead of bundling Chromium. |

## Install

Download the latest Windows installer from the **[Releases](../../releases)** page:

`Youtube Music_x.y.z_x64-setup.exe`

> [!NOTE]
> The installer isn't code-signed, so Windows SmartScreen may say *"Windows protected your PC"*. Click **More info**, then **Run anyway**.

Windows 10 and 11 already include the WebView2 runtime the app needs.

## Build from source

Only Windows is built and tested.

**Requirements**

- [Node.js 20+](https://nodejs.org)
- [Rust (stable)](https://rustup.rs)
- Microsoft C++ Build Tools (see the [Tauri prerequisites](https://tauri.app/start/prerequisites/))

```bash
git clone https://github.com/DEDDGRLL/Youtube-Music-Desktop.git
cd Youtube-Music-Desktop
npm install

npm run tauri dev      # run in development
npm run tauri build    # build the installer
```

The installer appears in `src-tauri/target/release/bundle/nsis/`. The first build takes a few minutes while Rust compiles.

### Releasing a new version

The version number lives in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml`. The app shows the one in `tauri.conf.json`, and the update checker compares it with your latest GitHub release, so all of them must match the release tag. One command updates them together:

```bash
npm run bump 0.2.0
git add .
git commit -m "Release v0.2.0"
git tag v0.2.0
git push
git push origin v0.2.0
```

Then open **Releases** on GitHub and **publish the draft** the build creates. The update checker only sees published releases, never drafts. Use plain numbers like `0.2.0` for versions and `v0.2.0` for the tag, with no suffixes such as `-beta`.

### Publishing a release

The included GitHub Action builds the Windows installer whenever you push a version tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Open the **Actions** tab to watch the build, then publish the draft under **Releases**.

## How it works

```
┌────────────── main window (your UI) ──────────────┐     ┌──── hidden "player" window ────┐
│  React + TypeScript                               │     │  music.youtube.com             │
│   • youtubei.js ── library, search, playlists ─────────▶  signed in with your session    │
│   • LRCLIB      ── synced lyrics                  │     │                                │
│   • player.ts ───── commands ──────────────────────────▶  bridge.js: play, seek, volume  │
│               ◀──── playback state, 4x/second ─────────  title, position, play/pause     │
└───────────────────────────────────────────────────┘     └────────────────────────────────┘
        Rust (src-tauri): windows, permissions, system tray, media keys
```

- **Playback** happens in a hidden, signed-in `music.youtube.com` window. The app sends it commands and receives its state.
- **Library and search data** come from [`youtubei.js`](https://github.com/LuanRT/YouTube.js), authenticated with the cookies from that same window.
- **Lyrics** come from [LRCLIB](https://lrclib.net), with YouTube Music's own plain-text lyrics as a fallback.
- **Permissions are locked down.** The UI window can only call a short list of player commands, and the YouTube page can only report playback state back to the app.

## Settings

Open **Settings** at the bottom of the sidebar.

| Setting | What it does |
| --- | --- |
| Launch at startup | Starts the app when you sign in to Windows. |
| Start minimized | When started by Windows, waits in the system tray instead of opening the window. |
| Keep playing in the tray when closed | Closing the window hides it and the music continues. Turn off to quit on close. |
| Media keys | Use the keyboard's play/pause, next and previous keys, even when the app isn't focused. |
| Windows media overlay | Show the song, artwork and controls in the Windows volume flyout and on the lock screen. |
| Mini-player | Open the small always-on-top player. |
| Check for updates on startup | Look for a newer version when the app opens. |
| Diagnostics | See what the app can see of the player, and copy a report. |
| Keyboard shortcuts | Record your own system-wide shortcuts for play/pause, next, previous, volume up/down, shuffle, repeat and showing the window. |
| Discord | Show what you're listening to (see below). |
| Sign out | Signs out of Google in this app and clears its saved session. |

Settings are saved in `%APPDATA%\dev.ytmdesktop.app\settings.json`.

### Keyboard shortcuts

Click a shortcut in Settings, then press the keys you want. Backspace clears it and Esc cancels. Shortcuts work system-wide, so they need Ctrl, Alt or Shift (or a function key) to avoid taking over an ordinary key in every other app. If another program already owns a combination, the app tells you and leaves it unassigned.

## Likes and playlists

- **Like or dislike** the playing song with the thumbs in the player bar or the Now Playing view. Liking adds it to Liked Music.
- **Song menu:** right-click any song in a list, or click the three dots that appear when you hover over it. You can like, dislike, add it to a playlist, or remove it from the playlist you're viewing.
- **Add to playlist** shows your playlists plus **New playlist**. The **+** next to Playlists in the sidebar and the **New playlist** button in Library create one directly.
- **Rename and delete** buttons appear on playlists you own. Playlists you only saved from other people can't be edited.
- **Filter** the song list on any playlist, album or Liked Music page. It ignores accents, so "lodz" finds "Łódź".

## Search and library

- **Search** shows suggestions as you type. With the box empty, it lists your recent searches. Use the chips under a search (All, Songs, Albums, Artists, Playlists) to narrow the results.
- **Library** has tabs for Playlists, Songs, Albums and Artists, using the sections YouTube Music offers for your account.

## Listening history

A song counts as listened to when it is longer than 30 seconds and you've played at least half of it, or 4 minutes, whichever comes first. Time is counted only while the song is actually playing, so pausing, seeking around, ads and skipping through songs don't inflate it. A song on repeat counts each time round.

Open **History** in the sidebar for your totals, top songs and top artists (last 7 days, 30 days, year or all time) and a list of recent plays. Click a song to play it or an artist to open them. **Copy as CSV** puts your whole history on the clipboard, and **Clear history** wipes it. The history is stored on your computer only, and you can turn it off under **Settings, Listening history**.

### ListenBrainz

[ListenBrainz](https://listenbrainz.org) is a free, open service that keeps your listening history online. To connect it, sign in at listenbrainz.org, copy your user token from your settings page, and paste it under **Settings, Listening history**. The app then reports the current song as it starts and submits each finished listen. If you're offline or ListenBrainz is busy, plays wait in a queue and are sent later. Disconnecting removes the token and the queue.

## Explore

The **Explore** entry in the sidebar shows new releases and trending music. Its buttons open New releases, Charts, and Moods and genres, and each mood or genre opens its own playlists.

## Mini-player

Open it from the player bar, from Settings, from the tray menu, or with a shortcut you assign. It stays on top of other windows, shows the song and controls, and can be dragged anywhere. The expand button returns to the full window.

## Windows media overlay

The song, artwork and play/pause/next/previous controls appear in the Windows volume flyout and on the lock screen. If you see the song listed twice, turn this off in Settings.

## Ads

Free YouTube Music accounts hear ads, exactly as in the browser. This app does not block, skip or hide them. After an ad finishes, the app makes sure your music starts playing again, and the player bar shows an "Advertisement" label while one plays. Diagnostics shows how many ads were seen and how often playback had to be resumed.

## Diagnostics

**Settings, Diagnostics** lists what the app can see of the hidden YouTube Music player: whether the shuffle, repeat, like and volume controls were found, how songs were last switched, ads, and any messages that failed. **Copy report** puts it all on the clipboard, which makes bugs much easier to report.

## In-app updates (optional)

Without any setup, the app checks the latest GitHub release and tells you when a newer version exists, with a button to open the download page. To let it **download and install updates itself**:

1. Create a signing key once. Keep the private key secret:
   ```bash
   npx tauri signer generate -w %USERPROFILE%\.tauri\youtube-music.key
   ```
2. In `src-tauri/tauri.conf.json`, set `"createUpdaterArtifacts": true` inside `bundle`, and add (pasting your public key):
   ```json
   "plugins": {
     "updater": {
       "pubkey": "PASTE THE PUBLIC KEY HERE",
       "endpoints": ["https://github.com/DEDDGRLL/Youtube-Music-Desktop/releases/latest/download/latest.json"]
     }
   }
   ```
3. In your GitHub repository, open **Settings, Secrets and variables, Actions** and add `TAURI_SIGNING_PRIVATE_KEY` (the contents of the key file) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
4. Publish a release as usual. Running `npm run tauri build` locally then needs `TAURI_SIGNING_PRIVATE_KEY` set too.

If the `plugins.updater` section is missing, the app simply uses the GitHub check above, so nothing breaks.

## Queue

Click the queue button in the player bar to see what plays next. Click any song to jump to it.

## Discord Rich Presence

Discord needs an **Application ID** to show a presence, and you create your own in a minute:

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications) and create a new application.
2. Name it **Youtube Music**. Discord shows this name as "Listening to Youtube Music".
3. Copy the **Application ID** from the General Information page.
4. In the app, open **Settings**, paste the ID under **Discord Application ID**, click **Save**, then turn on **Show what I'm listening to**.

Discord must be running on the same computer. If nothing appears, check that activity sharing is on in Discord under **Settings, Activity Privacy**. While paused, the presence shows "Paused" without a progress bar, and it is removed when you quit the app.

## Privacy

- Your Google sign-in happens on Google's page. Cookies stay on your computer and are used only to talk to YouTube Music.
- There is no telemetry and no server of ours.
- Looking up lyrics sends the song title, artist and length to [LRCLIB](https://lrclib.net).
- Your listening history stays on your computer. If you connect ListenBrainz, the title, artist, album and length of each song you listen to are sent to your ListenBrainz account, and your token is kept on this computer.
- With Discord Rich Presence on, the song title, artist and artwork are sent to your local Discord app, which shows them on your profile.

## Troubleshooting

<details>
<summary><b>"This browser or app may not be secure" when signing in</b></summary>

Google sometimes blocks embedded webviews. The app already presents a normal desktop browser identity (`UA` in `src-tauri/src/lib.rs`). If Google tightens its checks, update the version numbers in that string.
</details>

<details>
<summary><b>Every request fails with a 403 error</b></summary>

The Tauri HTTP plugin must have its `unsafe-headers` feature enabled (it is, in `src-tauri/Cargo.toml`). Without it, the cookie and origin headers are stripped.
</details>

<details>
<summary><b>Nothing loads after signing in</b></summary>

YouTube Music's internal API changes now and then. Update the library first: `npm update youtubei.js`.
</details>

<details>
<summary><b>Music doesn't start again after an ad</b></summary>

The app nudges playback to resume after an ad, and reloads the current song as a last resort. If it still gets stuck, open **Settings, Diagnostics**, press **Copy report** and include it when you report the problem.
</details>

<details>
<summary><b>No lyrics</b></summary>

The Now Playing panel names the song it searched for, or shows the error if the lyrics service couldn't be reached. Some songs simply have no synced lyrics available.
</details>

## Known limitations

- Each song you pick loads a fresh player page (about a second). Your shuffle and repeat choices are re-applied automatically once it has loaded.
- The queue shows what YouTube Music will play next. With shuffle on, the real play order may differ from the list.
- Artist pages depend on YouTube Music's internal data. If one can't load, the app falls back to showing search results for that artist.
- Switching songs without reloading the player only works for songs in the list that is already playing. Anything else loads a fresh player page (about a second). Diagnostics shows which method was used.
- The Windows media overlay and the in-app updater are new and have had less testing than the rest.
- "Add to playlist" lists every playlist in your library, including ones you saved from other people. Adding to one of those fails with a message, because only your own playlists can be changed.

## Project layout

```
src/                      React UI (views, player bar, Now Playing, lyrics)
src/lib/ytm.ts            YouTube Music data via youtubei.js
src/lib/player.ts         Bridge to the hidden player (commands + state)
src/lib/lyrics.ts         LRCLIB client and LRC parser
src-tauri/src/lib.rs      Rust: windows, permissions, tray, media keys
src-tauri/src/settings.rs Saved user settings
src-tauri/src/discord.rs  Discord Rich Presence
src-tauri/src/media.rs    Windows media overlay
src-tauri/src/update.rs   In-app updates
src/lib/tracker.ts        Decides when a song counts as a listen
src/lib/listenbrainz.ts   ListenBrainz client
src-tauri/src/bridge.js   Script injected into music.youtube.com
src-tauri/capabilities/   Per-window permission rules
.github/workflows/        Release build (Windows)
```

## Renaming the app

| What | Where |
| --- | --- |
| Installer, Start menu and shortcut name | `productName` in `src-tauri/tauri.conf.json` |
| Window title | `title` of the `main` window in `src-tauri/tauri.conf.json` |
| `.exe` file name | `mainBinaryName` in `src-tauri/tauri.conf.json` |
| App identifier (set before your first release) | `identifier` in `src-tauri/tauri.conf.json` |
| Tray tooltip and menu | `src-tauri/src/lib.rs` |
| Sidebar logo text | `.brand` in `src/App.tsx` |

## Roadmap


## Contributing

Issues and pull requests are welcome. For anything bigger than a small fix, please open an issue first to discuss it.

## License

[MIT](LICENSE). Not affiliated with Google or YouTube.

## Credits

- [Tauri](https://tauri.app) for the app framework
- [YouTube.js](https://github.com/LuanRT/YouTube.js) for the InnerTube client
- [LRCLIB](https://lrclib.net) for free, open synced lyrics
