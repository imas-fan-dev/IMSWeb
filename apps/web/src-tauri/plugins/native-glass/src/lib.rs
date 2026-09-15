use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(desktop)]
mod desktop;
#[cfg(mobile)]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(desktop)]
use desktop::NativeGlass;
#[cfg(mobile)]
use mobile::NativeGlass;

/// Access to the native glass plugin state managed by Tauri.
pub trait NativeGlassExt<R: Runtime> {
    fn native_glass(&self) -> &NativeGlass<R>;
}

impl<R: Runtime, T: Manager<R>> NativeGlassExt<R> for T {
    fn native_glass(&self) -> &NativeGlass<R> {
        self.state::<NativeGlass<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-glass")
        .invoke_handler(tauri::generate_handler![
            commands::configure,
            commands::update,
            commands::destroy
        ])
        .setup(|app, api| {
            #[cfg(mobile)]
            let native_glass = mobile::init(app, api)?;
            #[cfg(desktop)]
            let native_glass = desktop::init(app, api)?;
            app.manage(native_glass);
            Ok(())
        })
        .build()
}
