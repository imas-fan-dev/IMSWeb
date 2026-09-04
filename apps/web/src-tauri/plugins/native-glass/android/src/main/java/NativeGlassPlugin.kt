package top.idol_master.imsweb.nativeglass

import android.app.Activity
import android.view.View
import android.webkit.WebView
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Plugin

@TauriPlugin
class NativeGlassPlugin(
    activity: Activity,
) : Plugin(activity) {
    override fun load(webView: WebView) {
        webView.overScrollMode = View.OVER_SCROLL_NEVER
    }
}
