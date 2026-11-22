//! User settings, saved as JSON in the app's config folder.

use serde::{Deserialize, Serialize};
use std::{collections::HashMap, fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Start the app when you sign in to Windows.
    pub launch_at_startup: bool,
    /// When started by Windows, stay in the tray instead of opening the window.
    pub start_minimized: bool,
    /// Closing the window keeps the music playing in the tray (otherwise it quits).
    pub close_to_tray: bool,
    /// Use the keyboard's media keys, even when the app is not focused.
    pub media_keys: bool,
    pub discord_enabled: bool,
    /// Discord "Application ID" (a number) from discord.com/developers.
    pub discord_client_id: String,
    /// Check GitHub for a newer version when the app starts.
    pub check_updates: bool,
    /// Show the song, artwork and controls in the Windows media overlay.
    pub media_overlay: bool,
    /// Global keyboard shortcuts: action name -> key combo such as "Ctrl+Alt+ArrowRight".
    pub keybinds: HashMap<String, String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            launch_at_startup: false,
            start_minimized: true,
            close_to_tray: true,
            media_keys: true,
            discord_enabled: false,
            discord_client_id: String::new(),
            check_updates: true,
            media_overlay: true,
            keybinds: HashMap::new(),
        }
    }
}

pub struct SettingsState(pub Mutex<Settings>);

fn path(app: &AppHandle) -> Option<PathBuf> {
    app.path().app_config_dir().ok().map(|d| d.join("settings.json"))
}

pub fn load(app: &AppHandle) -> Settings {
    path(app)
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save(app: &AppHandle, settings: &Settings) {
    if let Some(p) = path(app) {
        if let Some(dir) = p.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(json) = serde_json::to_string_pretty(settings) {
            let _ = fs::write(p, json);
        }
    }
}
