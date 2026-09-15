use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::{CleanupResult, Error, PrepareOptions, PreparedImage, ReleaseOptions};

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<NativeImage<R>> {
    Ok(NativeImage(app.clone()))
}

pub struct NativeImage<R: Runtime>(AppHandle<R>);

impl<R: Runtime> NativeImage<R> {
    pub fn prepare(&self, _options: PrepareOptions) -> crate::Result<Option<PreparedImage>> {
        let _ = &self.0;
        Err(Error::UnsupportedPlatform)
    }

    pub fn release(&self, _options: ReleaseOptions) -> crate::Result<()> {
        Err(Error::UnsupportedPlatform)
    }

    pub fn cleanup_expired(&self) -> crate::Result<CleanupResult> {
        Err(Error::UnsupportedPlatform)
    }
}
