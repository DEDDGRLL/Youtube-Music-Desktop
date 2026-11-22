mod discord;
mod media;
mod settings;
mod update;

use discord::Discord;
use media::Media;
use serde_json::Value;
use settings::{Settings, SettingsState};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_opener::OpenerExt;
use std::collections::HashMap;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

const BRIDGE: &str = include_str!("bridge.js");
const MUSIC_URL: &str = "https://music.youtube.com";
const LOGIN_URL: &str =
    "https://accounts.google.com/ServiceLogin?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com";

// Google refuses sign-in from embedded webviews that look like one, so present a regular desktop browser.
#[cfg(target_os = "windows")]
const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
#[cfg(target_os = "macos")]
const UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
#[cfg(not(any(target_os = "windows", target_os = "macos")))]
const UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/// Only these player methods can be called from the UI.
const MEDIA_KEYS: [Code; 3] = [Code::MediaPlayPause, Code::MediaTrackNext, Code::MediaTrackPrevious];

const METHODS: &[&str] = &[
    "toggle", "play", "pause", "next", "prev", "seek", "volume", "shuffle", "repeat", "load",
];

fn player(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window("player").ok_or_else(|| "player window missing".to_string())
}

pub(crate) fn only(window: &WebviewWindow, label: &str) -> Result<(), String> {
    if window.label() == label { Ok(()) } else { Err("forbidden".into()) }
}

/// The app's own windows (not the YouTube page).
fn from_ui(window: &WebviewWindow) -> Result<(), String> {
    if matches!(window.label(), "main" | "mini") { Ok(()) } else { Err("forbidden".into()) }
}

pub(crate) fn quick(app: &AppHandle, call: &str) {
    if let Ok(p) = player(app) {
        let _ = p.eval(format!("window.__ytm && window.__ytm.{call};"));
    }
}

/// Actions that can be given a custom global shortcut.
const ACTIONS: &[&str] = &[
    "playPause", "next", "previous", "volumeUp", "volumeDown", "shuffle", "repeat", "showWindow", "toggleMini",
];

/// Shortcuts currently registered, and the action each one triggers.
pub struct Keybinds(Mutex<Vec<(Shortcut, String)>>);

fn run_action(app: &AppHandle, action: &str) {
    match action {
        "playPause" => quick(app, "toggle()"),
        "next" => quick(app, "next()"),
        "previous" => quick(app, "prev()"),
        "volumeUp" => quick(app, "volumeBy(5)"),
        "volumeDown" => quick(app, "volumeBy(-5)"),
        "shuffle" => quick(app, "shuffle()"),
        "repeat" => quick(app, "repeat()"),
        "toggleMini" => toggle_mini_in_background(app),
        "showWindow" => match app.get_webview_window("main") {
            Some(w) if w.is_visible().unwrap_or(false) => { let _ = w.hide(); }
            _ => show_main(app),
        },
        _ => {}
    }
}

/// "Ctrl+Alt+ArrowRight" -> a shortcut. The last part is a key code as browsers name them ("KeyA", "ArrowRight", "F5").
fn parse_accel(text: &str) -> Result<Shortcut, String> {
    let mut mods = Modifiers::empty();
    let mut code: Option<Code> = None;
    for part in text.split('+').map(str::trim).filter(|p| !p.is_empty()) {
        match part.to_ascii_lowercase().as_str() {
            "ctrl" | "control" => mods |= Modifiers::CONTROL,
            "alt" => mods |= Modifiers::ALT,
            "shift" => mods |= Modifiers::SHIFT,
            "super" | "meta" | "win" => mods |= Modifiers::SUPER,
            _ => code = Some(part.parse::<Code>().map_err(|_| format!("Unknown key \"{part}\""))?),
        }
    }
    let code = code.ok_or_else(|| "Missing key".to_string())?;
    Ok(Shortcut::new(if mods.is_empty() { None } else { Some(mods) }, code))
}

/// Replace all custom shortcuts. Returns the ones that were registered, plus a message for each that wasn't.
fn apply_keybinds(app: &AppHandle, wanted: &HashMap<String, String>) -> (HashMap<String, String>, Vec<String>) {
    let state = app.state::<Keybinds>();
    let mut active = state.0.lock().unwrap_or_else(|e| e.into_inner());
    for (shortcut, _) in active.drain(..) {
        let _ = app.global_shortcut().unregister(shortcut);
    }

    let mut kept = HashMap::new();
    let mut warnings = Vec::new();
    let mut used: Vec<u32> = Vec::new();
    // Stable order so conflict messages are predictable.
    let mut entries: Vec<_> = wanted.iter().collect();
    entries.sort();
    for (action, accel) in entries {
        if accel.trim().is_empty() || !ACTIONS.contains(&action.as_str()) {
            continue;
        }
        let shortcut = match parse_accel(accel) {
            Ok(s) => s,
            Err(e) => { warnings.push(format!("{accel}: {e}.")); continue; }
        };
        if used.contains(&shortcut.id()) {
            warnings.push(format!("{accel} is already assigned to another action."));
            continue;
        }
        match app.global_shortcut().register(shortcut.clone()) {
            Ok(_) => {
                used.push(shortcut.id());
                active.push((shortcut, action.clone()));
                kept.insert(action.clone(), accel.clone());
            }
            Err(_) => warnings.push(format!("{accel} couldn't be used. Another app may already have it.")),
        }
    }
    (kept, warnings)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

// ---------- commands ----------

// ---------- mini-player ----------

fn ensure_mini(app: &AppHandle) -> Result<WebviewWindow, String> {
    if let Some(w) = app.get_webview_window("mini") {
        return Ok(w);
    }
    let w = WebviewWindowBuilder::new(app, "mini", WebviewUrl::App("index.html".into()))
        .title("Youtube Music")
        .inner_size(390.0, 116.0)
        .resizable(false)
        .decorations(false)
        .always_on_top(true)
        .visible(false)
        .build()
        .map_err(|e| e.to_string())?;
    // Start in the bottom-right corner of the screen.
    if let Ok(Some(m)) = w.primary_monitor() {
        let scale = m.scale_factor();
        let (mw, mh) = (m.size().width as f64, m.size().height as f64);
        let _ = w.set_position(tauri::PhysicalPosition::new(
            (mw - (390.0 + 24.0) * scale).max(0.0) as i32,
            (mh - (116.0 + 72.0) * scale).max(0.0) as i32,
        ));
    }
    // The system close (Alt+F4) goes back to the full window instead of quitting.
    let handle = app.clone();
    w.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            show_full_window(&handle);
        }
    });
    Ok(w)
}

fn show_full_window(app: &AppHandle) {
    if let Some(m) = app.get_webview_window("mini") {
        let _ = m.hide();
    }
    show_main(app);
}

/// Creating a window on the main thread deadlocks on Windows (from a command, menu click or shortcut),
/// freezing the whole app. Always do it from a background thread.
fn toggle_mini_in_background(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move { toggle_mini_inner(&app) });
}

fn toggle_mini_inner(app: &AppHandle) {
    let Ok(mini) = ensure_mini(app) else { return };
    if mini.is_visible().unwrap_or(false) {
        show_full_window(app);
    } else {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.hide();
        }
        let _ = mini.show();
        let _ = mini.set_focus();
    }
}

/// `async` matters: Tauri runs async commands off the main thread, which is required to create a window.
#[tauri::command]
async fn toggle_mini(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    from_ui(&window)?;
    toggle_mini_inner(&app);
    Ok(())
}

#[tauri::command]
fn show_main_window(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    from_ui(&window)?;
    show_full_window(&app);
    Ok(())
}

/// Open a web page in the default browser. Only a few places this app links to are allowed.
#[tauri::command]
fn open_link(window: WebviewWindow, app: AppHandle, url: String) -> Result<(), String> {
    only(&window, "main")?;
    const ALLOWED: &[&str] = &["https://github.com/", "https://discord.com/developers/"];
    if !ALLOWED.iter().any(|p| url.starts_with(p)) {
        return Err("That link isn't allowed.".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Called by the injected bridge inside music.youtube.com; forwards state to the UI.
#[tauri::command]
fn player_state(window: WebviewWindow, app: AppHandle, state: Value) -> Result<(), String> {
    only(&window, "player")?;
    // Discord reads the same state the UI does.
    let (enabled, client_id, overlay) = {
        let st = app.state::<SettingsState>();
        let g = st.0.lock().unwrap_or_else(|e| e.into_inner());
        (g.discord_enabled, g.discord_client_id.clone(), g.media_overlay)
    };
    discord::update(&app.state::<Discord>(), enabled, &client_id, &state);
    media::update(&app, &app.state::<Media>(), overlay, &state);
    app.emit("player-state", &state).map_err(|e| e.to_string())
}

/// UI -> player control, restricted to an allow-list of methods.
#[tauri::command]
fn player_call(window: WebviewWindow, app: AppHandle, method: String, args: Vec<Value>) -> Result<(), String> {
    from_ui(&window)?;
    if !METHODS.contains(&method.as_str()) {
        return Err("unknown method".into());
    }
    let args = serde_json::to_string(&args).map_err(|e| e.to_string())?;
    player(&app)?
        .eval(format!("window.__ytm && window.__ytm.{method}(...{args});"))
        .map_err(|e| e.to_string())
}

/// Cookie header for music.youtube.com from the signed-in player webview.
#[tauri::command]
async fn get_cookies(window: WebviewWindow, app: AppHandle) -> Result<String, String> {
    only(&window, "main")?;
    let url = Url::parse(MUSIC_URL).map_err(|e| e.to_string())?;
    let cookies = player(&app)?.cookies_for_url(url).map_err(|e| e.to_string())?;
    Ok(cookies.iter().map(|c| format!("{}={}", c.name(), c.value())).collect::<Vec<_>>().join("; "))
}

fn set_media_keys(app: &AppHandle, on: bool) {
    for key in MEDIA_KEYS {
        let shortcut = Shortcut::new(None, key);
        // Ignore failures, e.g. another app already owns the key.
        let _ = if on { app.global_shortcut().register(shortcut) } else { app.global_shortcut().unregister(shortcut) };
    }
}

#[tauri::command]
fn get_settings(window: WebviewWindow, app: AppHandle) -> Result<Settings, String> {
    only(&window, "main")?;
    let mut s = app.state::<SettingsState>().0.lock().unwrap_or_else(|e| e.into_inner()).clone();
    // Windows is the source of truth for "launch at startup".
    if let Ok(on) = app.autolaunch().is_enabled() {
        s.launch_at_startup = on;
    }
    Ok(s)
}

#[derive(serde::Serialize)]
struct SaveResult {
    settings: Settings,
    /// Things that couldn't be applied (e.g. a shortcut another app already owns).
    warnings: Vec<String>,
}

#[tauri::command]
fn set_settings(window: WebviewWindow, app: AppHandle, mut settings: Settings) -> Result<SaveResult, String> {
    only(&window, "main")?;
    settings.discord_client_id = settings.discord_client_id.trim().to_string();
    if !settings.discord_client_id.is_empty() && !settings.discord_client_id.chars().all(|c| c.is_ascii_digit()) {
        return Err("The Discord Application ID should be a number (digits only).".into());
    }

    let state = app.state::<SettingsState>();
    let old = state.0.lock().unwrap_or_else(|e| e.into_inner()).clone();

    let launcher = app.autolaunch();
    let actual = launcher.is_enabled().unwrap_or(false);
    if settings.launch_at_startup && !actual {
        launcher.enable().map_err(|e| format!("Couldn't turn on launch at startup: {e}"))?;
    } else if !settings.launch_at_startup && actual {
        launcher.disable().map_err(|e| format!("Couldn't turn off launch at startup: {e}"))?;
    }

    if settings.media_keys != old.media_keys {
        set_media_keys(&app, settings.media_keys);
    }
    if settings.discord_enabled != old.discord_enabled || settings.discord_client_id != old.discord_client_id {
        discord::shutdown(&app.state::<Discord>());
    }

    let (kept, warnings) = apply_keybinds(&app, &settings.keybinds);
    settings.keybinds = kept;

    if !settings.media_overlay && old.media_overlay {
        media::shutdown(&app.state::<Media>());
    }

    settings::save(&app, &settings);
    *state.0.lock().unwrap_or_else(|e| e.into_inner()) = settings.clone();
    Ok(SaveResult { settings, warnings })
}

#[tauri::command]
fn show_login(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    only(&window, "main")?;
    let p = player(&app)?;
    p.eval(format!("location.href = '{LOGIN_URL}';")).map_err(|e| e.to_string())?;
    p.show().map_err(|e| e.to_string())?;
    let _ = p.set_focus();
    Ok(())
}

/// Reveal the player window (with devtools in debug builds) to see what YouTube Music is doing.
#[tauri::command]
fn show_player(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    only(&window, "main")?;
    let p = player(&app)?;
    p.show().map_err(|e| e.to_string())?;
    let _ = p.set_focus();
    #[cfg(debug_assertions)]
    p.open_devtools();
    Ok(())
}

#[tauri::command]
fn hide_login(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    only(&window, "main")?;
    let p = player(&app)?;
    p.hide().map_err(|e| e.to_string())?;
    p.eval(format!("location.href = '{MUSIC_URL}';")).map_err(|e| e.to_string())
}

#[tauri::command]
async fn sign_out(window: WebviewWindow, app: AppHandle) -> Result<(), String> {
    only(&window, "main")?;
    let p = player(&app)?;
    p.clear_all_browsing_data().map_err(|e| e.to_string())?;
    p.eval(format!("location.href = '{MUSIC_URL}';")).map_err(|e| e.to_string())
}

// ---------- app ----------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--autostart"])))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() != ShortcutState::Pressed {
                        return;
                    }
                    // A custom shortcut wins; otherwise it is one of the media keys.
                    let custom = app.try_state::<Keybinds>().and_then(|k| {
                        let g = k.0.lock().unwrap_or_else(|e| e.into_inner());
                        g.iter().find(|(s, _)| s.id() == shortcut.id()).map(|(_, a)| a.clone())
                    });
                    if let Some(action) = custom {
                        run_action(app, &action);
                        return;
                    }
                    match shortcut.key {
                        Code::MediaPlayPause => quick(app, "toggle()"),
                        Code::MediaTrackNext => quick(app, "next()"),
                        Code::MediaTrackPrevious => quick(app, "prev()"),
                        _ => {}
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            player_state, player_call, get_cookies, show_login, hide_login, sign_out, show_player, get_settings, set_settings, toggle_mini, show_main_window, open_link, update::check_update, update::install_update
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let to_tray = window
                        .app_handle()
                        .try_state::<SettingsState>()
                        .map_or(true, |st| st.0.lock().map_or(true, |g| g.close_to_tray));
                    if to_tray {
                        // Keep the music playing in the tray.
                        api.prevent_close();
                        let _ = window.hide();
                    } else {
                        // The hidden player window would otherwise keep the app alive.
                        window.app_handle().exit(0);
                    }
                }
            }
        })
        .setup(|app| {
            let settings = settings::load(app.handle());
            app.manage(SettingsState(Mutex::new(settings.clone())));
            app.manage(Discord::default());
            app.manage(Media::default());
            app.manage(Keybinds(Mutex::new(Vec::new())));

            // The updater plugin refuses to start without its config, so only add it when a key is set up.
            if update::configured(app.handle()) {
                let _ = app.handle().plugin(tauri_plugin_updater::Builder::new().build());
            }

            // The player: a real music.youtube.com page that does the streaming. Hidden unless signing in.
            let player = WebviewWindowBuilder::new(app, "player", WebviewUrl::External(Url::parse(MUSIC_URL)?))
                .title("Sign in to YouTube Music")
                .inner_size(520.0, 740.0)
                .visible(false)
                .user_agent(UA)
                .initialization_script(BRIDGE)
                .build()?;
            let p = player.clone();
            player.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = p.hide();
                }
            });

            // Tray
            let show = MenuItem::with_id(app, "show", "Open Youtube Music", true, None::<&str>)?;
            let prev = MenuItem::with_id(app, "prev", "Previous", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Play / Pause", true, None::<&str>)?;
            let next = MenuItem::with_id(app, "next", "Next", true, None::<&str>)?;
            let mini = MenuItem::with_id(app, "mini", "Mini player", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &mini, &prev, &toggle, &next, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Youtube Music")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show_main(app),
                    "prev" => quick(app, "prev()"),
                    "toggle" => quick(app, "toggle()"),
                    "next" => quick(app, "next()"),
                    "mini" => toggle_mini_in_background(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            if settings.media_keys {
                set_media_keys(app.handle(), true);
            }
            apply_keybinds(app.handle(), &settings.keybinds);

            // Started by Windows at login with "start minimized" on: stay in the tray.
            let launched_by_windows = std::env::args().any(|a| a == "--autostart");
            if !(launched_by_windows && settings.start_minimized) {
                show_main(app.handle());
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building Youtube Music")
        .run(|app, event| {
            // Remove the Discord presence when the app quits.
            if let RunEvent::Exit = event {
                if let Some(d) = app.try_state::<Discord>() {
                    discord::shutdown(&d);
                }
                if let Some(m) = app.try_state::<Media>() {
                    media::shutdown(&m);
                }
            }
        });
}
