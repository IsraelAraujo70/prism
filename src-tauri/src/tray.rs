use crate::db::{self, DbState};
use crate::notifications;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

pub const TRAY_ID: &str = "main";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let open_item = MenuItem::with_id(app, "open", "Abrir Prism", true, None::<&str>)?;
    let mark_all_item = MenuItem::with_id(
        app,
        "mark_all",
        "Marcar tudo como lido",
        true,
        None::<&str>,
    )?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let pause_1h = MenuItem::with_id(app, "pause_1h", "Pausar por 1 hora", true, None::<&str>)?;
    let pause_4h = MenuItem::with_id(app, "pause_4h", "Pausar por 4 horas", true, None::<&str>)?;
    let resume_item =
        MenuItem::with_id(app, "resume", "Retomar notificações", true, None::<&str>)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[
            &open_item,
            &mark_all_item,
            &separator1,
            &pause_1h,
            &pause_4h,
            &resume_item,
            &separator2,
            &quit_item,
        ],
    )?;

    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::AssetNotFound("default window icon".into()))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Prism")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_and_focus_main_window(app),
            "mark_all" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = notifications::mark_all_read(&app).await {
                        log::warn!("tray mark_all failed: {e}");
                    }
                });
            }
            "pause_1h" => {
                notifications::pause_for(app, 60);
                update_title(app);
            }
            "pause_4h" => {
                notifications::pause_for(app, 240);
                update_title(app);
            }
            "resume" => {
                notifications::resume(app);
                update_title(app);
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    update_title(app);
    Ok(())
}

pub fn update_title(app: &AppHandle) {
    let count = {
        let state = app.state::<DbState>();
        let conn = state.0.lock().unwrap();
        db::unread_count(&conn)
    };
    let pause_remaining = pause_remaining_label(app);

    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    let mut parts: Vec<String> = vec!["Prism".into()];
    if count == 1 {
        parts.push("1 não lida".into());
    } else if count > 1 {
        parts.push(format!("{count} não lidas"));
    }
    if let Some(label) = pause_remaining {
        parts.push(format!("pausado por mais {label}"));
    }
    let tooltip = parts.join(" — ");
    let _ = tray.set_tooltip(Some(&tooltip));

    let title = if count > 0 {
        Some(count.to_string())
    } else {
        None
    };
    let _ = tray.set_title(title.as_deref());
}

fn pause_remaining_label(app: &AppHandle) -> Option<String> {
    let until = notifications::paused_until(app)?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .ok()?
        .as_secs() as i64;
    let secs = until - now;
    if secs <= 0 {
        return None;
    }
    let hours = secs / 3600;
    let minutes = (secs % 3600) / 60;
    if hours > 0 {
        Some(format!("{hours}h{minutes:02}"))
    } else {
        Some(format!("{minutes}min"))
    }
}

fn toggle_main_window(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let visible = win.is_visible().unwrap_or(false);
    let focused = win.is_focused().unwrap_or(false);
    if visible && focused {
        let _ = win.hide();
    } else {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

fn show_and_focus_main_window(app: &AppHandle) {
    let Some(win) = app.get_webview_window("main") else {
        return;
    };
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
}

