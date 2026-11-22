//! In-app updates. Only active once an update signing key is set up in tauri.conf.json (see the README);
//! until then the app falls back to telling you a newer release exists.

use serde::Serialize;
use tauri::{AppHandle, WebviewWindow};
use tauri_plugin_updater::UpdaterExt;

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    /// False when no signing key / endpoint has been configured.
    pub configured: bool,
    pub available: bool,
    pub version: String,
    pub notes: String,
}

/// The updater plugin refuses to start without its config, so only register it when it is present.
pub fn configured(app: &AppHandle) -> bool {
    app.config().plugins.0.contains_key("updater")
}

#[tauri::command]
pub async fn check_update(window: WebviewWindow, app: AppHandle) -> Result<UpdateInfo, String> {
    crate::only(&window, "main")?;
    if !configured(&app) {
        return Ok(UpdateInfo::default());
    }
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(match update {
        Some(u) => UpdateInfo { configured: true, available: true, version: u.version, notes: u.body.unwrap_or_default() },
        None => UpdateInfo { configured: true, ..Default::default() },
    })
}

/// Download, install and restart.
#[tauri::command]
pub async fn install_update(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    crate::only(&window, "main")?;
    let update = app
        .updater()
        .map_err(|e| e.to_string())?
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "You already have the latest version.".to_string())?;
    update.download_and_install(|_, _| {}, || {}).await.map_err(|e| e.to_string())?;
    app.restart()
}
