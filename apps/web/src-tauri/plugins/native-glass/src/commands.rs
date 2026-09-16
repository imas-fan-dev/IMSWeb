use tauri::{command, AppHandle, Runtime};

use crate::{
    ConfigureOptions, NativeGlassExt, NativeGlassStatus, Result, SetControlsArgs, UpdateOptions,
};

#[command]
pub(crate) async fn configure<R: Runtime>(
    app: AppHandle<R>,
    options: ConfigureOptions,
) -> Result<NativeGlassStatus> {
    app.native_glass().configure(options)
}

#[command]
pub(crate) async fn update<R: Runtime>(
    app: AppHandle<R>,
    options: UpdateOptions,
) -> Result<NativeGlassStatus> {
    app.native_glass().update(options)
}

#[command]
pub(crate) async fn set_controls<R: Runtime>(
    app: AppHandle<R>,
    args: SetControlsArgs,
) -> Result<NativeGlassStatus> {
    app.native_glass().set_controls(args)
}

#[command]
pub(crate) async fn destroy<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.native_glass().destroy()
}
