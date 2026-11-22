fn main() {
    // Explicit per-command permissions: the UI window gets the controls, the remote player page
    // gets only `player_state` (see capabilities/).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&[
            "player_state",
            "player_call",
            "get_cookies",
            "show_login",
            "hide_login",
            "sign_out",
            "show_player",
            "get_settings",
            "set_settings",
            "toggle_mini",
            "show_main_window",
            "open_link",
            "check_update",
            "install_update",
        ])),
    )
    .expect("failed to run tauri-build");
}
