use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::{ConfigureOptions, NativeGlassStatus, UpdateOptions};

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_native_glass);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<NativeGlass<R>> {
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_native_glass)?;
    Ok(NativeGlass(handle))
}

pub struct NativeGlass<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> NativeGlass<R> {
    pub fn configure(&self, options: ConfigureOptions) -> crate::Result<NativeGlassStatus> {
        self.0
            .run_mobile_plugin("configure", options)
            .map_err(Into::into)
    }

    pub fn update(&self, options: UpdateOptions) -> crate::Result<NativeGlassStatus> {
        self.0
            .run_mobile_plugin("update", options)
            .map_err(Into::into)
    }

    pub fn destroy(&self) -> crate::Result<()> {
        self.0.run_mobile_plugin("destroy", ()).map_err(Into::into)
    }
}
