use std::fs;

use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};
use tauri_plugin_dialog::{DialogExt, FileAccessMode, PickerMode};

use crate::{
    encoder::encode_decoded_image, CleanupResult, Error, NativeDecodedImage, PrepareOptions,
    PreparedImage, ReleaseOptions,
};

tauri::ios_plugin_binding!(init_plugin_native_image);

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<NativeImage<R>> {
    let handle = api.register_ios_plugin(init_plugin_native_image)?;
    Ok(NativeImage {
        app: app.clone(),
        handle,
    })
}

pub struct NativeImage<R: Runtime> {
    app: AppHandle<R>,
    handle: PluginHandle<R>,
}

impl<R: Runtime> NativeImage<R> {
    pub fn prepare(&self, options: PrepareOptions) -> crate::Result<Option<PreparedImage>> {
        let Some(selected) = self
            .app
            .dialog()
            .file()
            .add_filter("Images", &["image/*"])
            .set_picker_mode(PickerMode::Image)
            .set_file_access_mode(FileAccessMode::Copy)
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let source_path = selected
            .into_path()
            .map_err(|_| Error::InvalidDecodedImage)?;
        let metadata =
            fs::symlink_metadata(&source_path).map_err(|_| Error::InvalidDecodedImage)?;
        if !metadata.is_file() || metadata.file_type().is_symlink() {
            return Err(Error::InvalidDecodedImage);
        }

        let native_options = options.into_native(source_path.to_string_lossy().into_owned());
        let decoded = self
            .handle
            .run_mobile_plugin::<NativeDecodedImage>("decode", native_options.clone());
        let _ = fs::remove_file(&source_path);
        encode_decoded_image(decoded?, &native_options).map(Some)
    }

    pub fn release(&self, options: ReleaseOptions) -> crate::Result<()> {
        self.handle
            .run_mobile_plugin("release", options)
            .map_err(Into::into)
    }

    pub fn cleanup_expired(&self) -> crate::Result<CleanupResult> {
        self.handle
            .run_mobile_plugin("cleanupExpired", ())
            .map_err(Into::into)
    }
}
