use tauri::{
    plugin::{Builder, TauriPlugin},
    Manager, Runtime,
};

pub use models::*;

#[cfg(not(target_os = "ios"))]
mod desktop;
#[cfg(any(target_os = "ios", test))]
mod encoder;
#[cfg(target_os = "ios")]
mod mobile;

mod commands;
mod error;
mod models;

pub use error::{Error, Result};

#[cfg(not(target_os = "ios"))]
use desktop::NativeImage;
#[cfg(target_os = "ios")]
use mobile::NativeImage;

/// Access to the native image plugin state managed by Tauri.
pub trait NativeImageExt<R: Runtime> {
    fn native_image(&self) -> &NativeImage<R>;
}

impl<R: Runtime, T: Manager<R>> NativeImageExt<R> for T {
    fn native_image(&self) -> &NativeImage<R> {
        self.state::<NativeImage<R>>().inner()
    }
}

pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("native-image")
        .invoke_handler(tauri::generate_handler![
            commands::prepare,
            commands::release,
            commands::cleanup_expired
        ])
        .setup(|app, api| {
            #[cfg(target_os = "ios")]
            let native_image = mobile::init(app, api)?;
            #[cfg(not(target_os = "ios"))]
            let native_image = desktop::init(app, api)?;
            app.manage(native_image);
            Ok(())
        })
        .build()
}
