//! Discord Rich Presence ("Listening to ...") driven by the player's state.

use discord_rich_presence::{
    activity::{Activity, ActivityType, Assets, Timestamps},
    DiscordIpc, DiscordIpcClient,
};
use serde_json::Value;
use std::{
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[derive(Default)]
pub struct Inner {
    client: Option<DiscordIpcClient>,
    client_id: String,
    /// What we last published: song, title, playing and whether the length was known.
    last_key: String,
    last_pos: f64,
    last_at: Option<Instant>,
    last_sent: Option<Instant>,
    last_connect_try: Option<Instant>,
    /// A change we still need to publish (e.g. Discord was not reachable yet).
    pending: bool,
}

#[derive(Default)]
pub struct Discord(pub Mutex<Inner>);

fn lock(d: &Discord) -> std::sync::MutexGuard<'_, Inner> {
    d.0.lock().unwrap_or_else(|e| e.into_inner())
}

/// Discord wants 2-128 characters per text field.
fn clean(s: &str) -> String {
    let mut t: String = s.trim().chars().take(128).collect();
    if t.chars().count() < 2 {
        t.push_str("  ");
    }
    t
}

pub fn artwork(thumb: &str, video_id: &str) -> String {
    if thumb.starts_with("http") {
        // Google image URLs carry a size suffix; ask for a larger one.
        if thumb.contains("googleusercontent.com") || thumb.contains("ggpht.com") {
            if let Some(i) = thumb.rfind("=w") {
                return format!("{}=w512-h512-l90-rj", &thumb[..i]);
            }
        }
        return thumb.to_string();
    }
    format!("https://i.ytimg.com/vi/{video_id}/hqdefault.jpg")
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

impl Inner {
    fn drop_client(&mut self, clear: bool) {
        if let Some(mut c) = self.client.take() {
            if clear {
                let _ = c.clear_activity();
            }
            let _ = c.close();
        }
        self.last_key.clear();
        self.pending = false;
    }

    fn clear(&mut self) {
        if !self.last_key.is_empty() {
            if let Some(c) = self.client.as_mut() {
                if c.clear_activity().is_err() {
                    self.client = None;
                }
            }
            self.last_key.clear();
        }
        self.pending = false;
    }

    /// Connect if needed (at most every 15 s, since Discord may simply not be running).
    fn ensure_connected(&mut self) -> bool {
        if self.client.is_some() {
            return true;
        }
        if self.last_connect_try.map_or(false, |t| t.elapsed() < Duration::from_secs(15)) {
            return false;
        }
        self.last_connect_try = Some(Instant::now());
        let mut c = DiscordIpcClient::new(&self.client_id);
        if c.connect().is_err() {
            return false;
        }
        self.client = Some(c);
        true
    }

    fn publish(&mut self, s: &Value, playing: bool, pos: f64, dur: f64) -> bool {
        if !self.ensure_connected() {
            return false;
        }
        let title = clean(s["title"].as_str().unwrap_or(""));
        let artist = s["artist"].as_str().unwrap_or("").trim();
        let state = if !playing {
            "Paused".to_string()
        } else if artist.is_empty() {
            "Unknown artist".to_string()
        } else {
            clean(artist)
        };
        let image = artwork(s["thumb"].as_str().unwrap_or(""), s["videoId"].as_str().unwrap_or(""));

        let mut act = Activity::new()
            .activity_type(ActivityType::Listening)
            .details(title.as_str())
            .state(state.as_str())
            .assets(Assets::new().large_image(image.as_str()).large_text(title.as_str()));
        if playing && dur > 0.0 {
            let start = now_ms() - (pos * 1000.0) as i64;
            act = act.timestamps(Timestamps::new().start(start).end(start + (dur * 1000.0) as i64));
        }

        match self.client.as_mut().map(|c| c.set_activity(act)) {
            Some(Ok(_)) => true,
            _ => {
                // Discord closed or restarted: drop the connection and retry later.
                self.client = None;
                false
            }
        }
    }
}

/// Feed every player-state report here. Only talks to Discord when something meaningful changed.
pub fn update(discord: &Discord, enabled: bool, client_id: &str, s: &Value) {
    let mut d = lock(discord);
    let client_id = client_id.trim();
    if !enabled || client_id.is_empty() {
        d.drop_client(true);
        return;
    }
    if d.client_id != client_id {
        d.drop_client(true);
        d.client_id = client_id.to_string();
    }

    let video = s["videoId"].as_str().unwrap_or("");
    let title = s["title"].as_str().unwrap_or("");
    let playing = s["playing"].as_bool().unwrap_or(false);
    let pos = s["position"].as_f64().unwrap_or(0.0);
    let dur = s["duration"].as_f64().unwrap_or(0.0);

    if video.is_empty() || title.is_empty() {
        d.clear();
        return;
    }

    let key = format!("{video}|{title}|{playing}|{}", dur > 0.0);
    // Where we expected playback to be: a big difference means the user seeked.
    let expected = match (d.last_at, playing) {
        (Some(t), true) => d.last_pos + t.elapsed().as_secs_f64(),
        _ => d.last_pos,
    };
    let seeked = d.last_at.is_some() && key == d.last_key && (pos - expected).abs() > 4.0;
    d.last_pos = pos;
    d.last_at = Some(Instant::now());

    if key != d.last_key || seeked {
        d.pending = true;
    }
    // Discord allows only a few updates per 20 s.
    let too_soon = d.last_sent.map_or(false, |t| t.elapsed() < Duration::from_millis(1500));
    if d.pending && !too_soon {
        d.last_sent = Some(Instant::now());
        if d.publish(s, playing, pos, dur) {
            d.last_key = key;
            d.pending = false;
        }
    }
}

/// Remove the presence and disconnect (settings changed, or the app is quitting).
pub fn shutdown(discord: &Discord) {
    lock(discord).drop_client(true);
}
