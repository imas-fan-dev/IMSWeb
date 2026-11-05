use tauri::{command, AppHandle, Runtime};

use crate::{
    BackPolicyArgs, ConfigureOptions, NativeGlassExt, NativeGlassStatus, Result, SetControlsArgs,
    UpdateOptions,
};

#[command]
pub(crate) async fn set_search<R: Runtime>(
    app: AppHandle<R>,
    args: crate::SetSearchArgs,
) -> Result<NativeGlassStatus> {
    app.native_glass().set_search(args)
}

#[command]
pub(crate) async fn remove_search<R: Runtime>(
    app: AppHandle<R>,
    args: crate::RemoveSearchArgs,
) -> Result<()> {
    app.native_glass().remove_search(args)
}

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
pub(crate) async fn set_back_policy<R: Runtime>(
    app: AppHandle<R>,
    args: BackPolicyArgs,
) -> Result<NativeGlassStatus> {
    app.native_glass().set_back_policy(args)
}

#[command]
pub(crate) async fn background_task<R: Runtime>(app: AppHandle<R>) -> Result<NativeGlassStatus> {
    app.native_glass().background_task()
}

#[command]
pub(crate) async fn destroy<R: Runtime>(app: AppHandle<R>) -> Result<()> {
    app.native_glass().destroy()
}
