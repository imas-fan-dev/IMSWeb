use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::{ConfigureOptions, NativeGlassStatus, UpdateOptions};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NativeGlass<R>> {
    Ok(NativeGlass(app.clone()))
}

pub struct NativeGlass<R: Runtime>(AppHandle<R>);

impl<R: Runtime> NativeGlass<R> {
    pub fn configure(&self, _options: ConfigureOptions) -> crate::Result<NativeGlassStatus> {
        let _ = &self.0;
        Ok(NativeGlassStatus {
            reason: Some("ios-only".into()),
            supported: false,
        })
    }

    pub fn update(&self, _options: UpdateOptions) -> crate::Result<NativeGlassStatus> {
        Ok(NativeGlassStatus {
            reason: Some("ios-only".into()),
            supported: false,
        })
    }

    pub fn destroy(&self) -> crate::Result<()> {
        Ok(())
    }
}
