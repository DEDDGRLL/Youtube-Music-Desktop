//! The Windows media overlay (volume flyout / lock screen): song, artwork and play/pause/next/previous.
//! Elsewhere this does nothing.

use serde_json::Value;
use tauri::AppHandle;

#[cfg(not(windows))]
#[derive(Default)]
pub struct Media;

#[cfg(not(windows))]
pub fn update(_app: &AppHandle, _media: &Media, _enabled: bool, _s: &Value) {}

#[cfg(not(windows))]
pub fn shutdown(_media: &Media) {}

#[cfg(windows)]
pub use win::{shutdown, update, Media};

#[cfg(windows)]
mod win {
    use super::*;
    use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig};
    use std::{
        sync::Mutex,
        time::{Duration, Instant},
    };
    use tauri::Manager;

    #[derive(Default)]
    pub struct Media(Mutex<Inner>);

    #[derive(Default)]
    struct Inner {
        controls: Option<MediaControls>,
        /// Creating the controls failed once; don't keep retrying every 250 ms.
        failed: bool,
        last_song: String,
        last_playing: Option<bool>,
        last_progress: Option<Instant>,
    }

    fn lock(m: &Media) -> std::sync::MutexGuard<'_, Inner> {
        m.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    fn create(app: &AppHandle) -> Option<MediaControls> {
        let window = app.get_webview_window("main")?;
        let hwnd = window.hwnd().ok()?;
        let raw = hwnd.0 as usize as *mut std::ffi::c_void;
        let mut controls = MediaControls::new(PlatformConfig {
            dbus_name: "youtube_music_desktop",
            display_name: "Youtube Music",
            hwnd: Some(raw),
        })
        .ok()?;
        let handle = app.clone();
        controls
            .attach(move |event| match event {
                MediaControlEvent::Play => crate::quick(&handle, "play()"),
                MediaControlEvent::Pause => crate::quick(&handle, "pause()"),
                MediaControlEvent::Toggle => crate::quick(&handle, "toggle()"),
                MediaControlEvent::Next => crate::quick(&handle, "next()"),
                MediaControlEvent::Previous => crate::quick(&handle, "prev()"),
                MediaControlEvent::SetPosition(MediaPosition(d)) => {
                    crate::quick(&handle, &format!("seek({})", d.as_secs_f64()))
                }
                _ => {}
            })
            .ok()?;
        Some(controls)
    }

    pub fn update(app: &AppHandle, media: &Media, enabled: bool, s: &Value) {
        let mut m = lock(media);
        if !enabled {
            if let Some(mut c) = m.controls.take() {
                let _ = c.set_playback(MediaPlayback::Stopped);
                let _ = c.detach();
            }
            m.failed = false;
            m.last_song.clear();
            return;
        }
        if m.controls.is_none() {
            if m.failed {
                return;
            }
            match create(app) {
                Some(c) => m.controls = Some(c),
                None => {
                    m.failed = true;
                    return;
                }
            }
        }

        let video = s["videoId"].as_str().unwrap_or("");
        let title = s["title"].as_str().unwrap_or("");
        if video.is_empty() || title.is_empty() {
            return;
        }
        let artist = s["artist"].as_str().unwrap_or("");
        let album = s["albumName"].as_str().unwrap_or("");
        let playing = s["playing"].as_bool().unwrap_or(false);
        let pos = s["position"].as_f64().unwrap_or(0.0).max(0.0);
        let dur = s["duration"].as_f64().unwrap_or(0.0);
        let cover = crate::discord::artwork(s["thumb"].as_str().unwrap_or(""), video);

        let song = format!("{video}|{title}|{artist}|{}", dur > 0.0);
        let song_changed = song != m.last_song;
        let state_changed = m.last_playing != Some(playing);
        // Keep the timeline roughly in step while playing without hammering Windows.
        let progress_due = m.last_progress.map_or(true, |t| t.elapsed() > Duration::from_secs(5));
        if !(song_changed || state_changed || progress_due) {
            return;
        }

        let Some(c) = m.controls.as_mut() else { return };
        let mut ok = true;
        if song_changed {
            ok &= c
                .set_metadata(MediaMetadata {
                    title: Some(title),
                    artist: Some(artist),
                    album: if album.is_empty() { None } else { Some(album) },
                    cover_url: Some(cover.as_str()),
                    duration: if dur > 0.0 { Some(Duration::from_secs_f64(dur)) } else { None },
                })
                .is_ok();
        }
        let progress = Some(MediaPosition(Duration::from_secs_f64(pos)));
        ok &= c
            .set_playback(if playing { MediaPlayback::Playing { progress } } else { MediaPlayback::Paused { progress } })
            .is_ok();

        if ok {
            m.last_song = song;
            m.last_playing = Some(playing);
            m.last_progress = Some(Instant::now());
        }
    }

    pub fn shutdown(media: &Media) {
        let mut m = lock(media);
        if let Some(mut c) = m.controls.take() {
            let _ = c.set_playback(MediaPlayback::Stopped);
            let _ = c.detach();
        }
    }
}
