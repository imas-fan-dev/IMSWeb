package top.idol_master.imsweb.nativeglass

import android.app.Activity
import android.view.View
import android.webkit.WebView
import androidx.core.view.WindowCompat
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
private class UpdateArgs {
    var dark = false
}

@TauriPlugin
class NativeGlassPlugin(
    private val hostActivity: Activity,
) : Plugin(hostActivity) {
    override fun load(webView: WebView) {
        webView.overScrollMode = View.OVER_SCROLL_NEVER
    }

    @Command
    fun update(invoke: Invoke) {
        val args = invoke.parseArgs(UpdateArgs::class.java)
        hostActivity.runOnUiThread {
            val window = hostActivity.window
            val appearance = systemBarAppearance(args.dark)
            // Android 15 gesture navigation is transparent under edge-to-edge,
            // so the App document canvas supplies its background. Keep this
            // write for earlier Android releases and three-button navigation.
            window.navigationBarColor = appearance.navigationBarColor
            WindowCompat
                .getInsetsController(window, window.decorView)
                .apply {
                    isAppearanceLightNavigationBars =
                        appearance.lightNavigationBarIcons
                    isAppearanceLightStatusBars = appearance.lightStatusBarIcons
                }
            invoke.resolve(JSObject().put("supported", true))
        }
    }
}
