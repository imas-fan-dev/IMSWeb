package top.idol_master.imsweb.nativeglass

import android.app.Activity
import android.graphics.Color
import android.os.Build
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
            val supportsLightNavigationBar = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            window.navigationBarColor =
                if (args.dark || !supportsLightNavigationBar) {
                    Color.rgb(23, 23, 23)
                } else {
                    Color.rgb(253, 253, 251)
                }
            WindowCompat
                .getInsetsController(window, window.decorView)
                .apply {
                    isAppearanceLightNavigationBars =
                        !args.dark && supportsLightNavigationBar
                    isAppearanceLightStatusBars = !args.dark
                }
            invoke.resolve(JSObject().put("supported", true))
        }
    }
}
