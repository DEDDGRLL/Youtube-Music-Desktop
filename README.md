<div align="center">

# Youtube Music for Desktop

**A lightweight, YouTube-themed desktop player for YouTube Music, without a browser eating your RAM.**
<div align="center">
  
**Cry about it sam altman**
  
Your playlists, Liked Music, artist pages and time-synced lyrics in a fast native window. Streaming only, no downloads.

[![License: MIT](https://img.shields.io/badge/license-MIT-red.svg)](LICENSE)
[![Built with Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202-ffc131.svg?logo=tauri&logoColor=white)](https://tauri.app)
[![React](https://img.shields.io/badge/UI-React%20%2B%20TypeScript-61dafb.svg?logo=react&logoColor=white)](https://react.dev)
[![Platform](https://img.shields.io/badge/platform-Windows-0078d4.svg)](#install)
[![Steam](https://img.shields.io/badge/Steam-Visit%20Profile-000000?logo=steam&logoColor=white)](https://steamcommunity.com/id/dyinghalx/)

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
| **Settings page** | Launch at startup, start minimized, close-to-tray, media keys and Discord, all saved between runs. |
| **Discord Rich Presence** | Shows the song, artist, artwork and a progress bar on your Discord profile. |
| **Remembers your volume** | Your volume level is kept across songs and restarts. |
| **Fast on big libraries** | Liked Music shows the first songs immediately and loads the rest in the background. |
| **Lightweight** | Uses the system webview instead of bundling Chromium. |

## Install

Download the latest Windows installer from the **[Releases](../../releases)** page:

`Youtube Music-setup.exe`

> [!NOTE]
> The installer isn't code-signed, so Windows SmartScreen may say *"Windows protected your PC"*. Click **More info**, then **Run anyway**.

Windows 10 and 11 already include the WebView2 runtime the app needs.

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
| Discord | Show what you're listening to (see below). |
| Sign out | Signs out of Google in this app and clears its saved session. |

Settings are saved in `%APPDATA%\dev.ytmdesktop.app\settings.json`.

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
<summary><b>No lyrics</b></summary>

The Now Playing panel names the song it searched for, or shows the error if the lyrics service couldn't be reached. Some songs simply have no synced lyrics available.
</details>

## Known limitations

- Each song change loads a fresh player page (about a second), so **shuffle and repeat may reset** when you switch songs.
- Artist pages depend on YouTube Music's internal data. If one can't load, the app falls back to showing search results for that artist.

## Roadmap

- [ ] Mini-player
- [ ] Albums and artists in the library

## Contributing

Issues and pull requests are welcome. For anything bigger than a small fix, please open an issue first to discuss it.

## License

[MIT](LICENSE). Not affiliated with Google or YouTube.

## Credits

- [Tauri](https://tauri.app) for the app framework
- [YouTube.js](https://github.com/LuanRT/YouTube.js) for the InnerTube client
- [LRCLIB](https://lrclib.net) for free, open synced lyrics
