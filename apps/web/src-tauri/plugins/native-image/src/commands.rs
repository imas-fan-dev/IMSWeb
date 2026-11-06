use tauri::{command, AppHandle, Runtime};

use crate::{CleanupResult, NativeImageExt, PrepareOptions, PreparedImage, ReleaseOptions, Result};

#[command]
pub(crate) async fn prepare<R: Runtime>(
    app: AppHandle<R>,
    options: PrepareOptions,
) -> Result<Option<PreparedImage>> {
    app.native_image().prepare(options)
}

#[command]
pub(crate) async fn release<R: Runtime>(app: AppHandle<R>, options: ReleaseOptions) -> Result<()> {
    app.native_image().release(options)
}

#[command]
pub(crate) async fn cleanup_expired<R: Runtime>(app: AppHandle<R>) -> Result<CleanupResult> {
    app.native_image().cleanup_expired()
}
