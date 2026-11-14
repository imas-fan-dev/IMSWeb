package top.idol_master.imsweb.nativeglass

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsAnimationCompat
import androidx.core.view.WindowInsetsCompat
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
        // Observe on a separate, zero-size view so Wry keeps its own inset
        // listener. Edge-to-edge WebViews may not resize their visualViewport
        // when the IME appears.
        val root = hostActivity.window.decorView as ViewGroup
        val probe = View(hostActivity)
        root.addView(probe, ViewGroup.LayoutParams(0, 0))
        var previousTop = Int.MIN_VALUE
        fun publishKeyboard(insets: WindowInsetsCompat) {
            val position = IntArray(2)
            val rootPosition = IntArray(2)
            webView.getLocationInWindow(position)
            root.getLocationInWindow(rootPosition)
            val top = if (insets.isVisible(WindowInsetsCompat.Type.ime())) {
                (rootPosition[1] + root.height -
                    insets.getInsets(WindowInsetsCompat.Type.ime()).bottom - position[1])
                    .coerceIn(0, webView.height)
            } else -1
            if (top == previousTop) return
            previousTop = top
            webView.evaluateJavascript(
                """
                (() => {
                  const style = document.documentElement.style;
                  if ($top < 0) style.removeProperty('--app-keyboard-top');
                  else style.setProperty('--app-keyboard-top', ($top / window.devicePixelRatio) + 'px');
                  window.dispatchEvent(new Event('ims:android-keyboard-layout'));
                })()
                """.trimIndent(),
                null,
            )
        }
        ViewCompat.setOnApplyWindowInsetsListener(probe) { _, insets ->
            publishKeyboard(insets)
            insets
        }
        ViewCompat.setWindowInsetsAnimationCallback(
            probe,
            object : WindowInsetsAnimationCompat.Callback(DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                override fun onProgress(
                    insets: WindowInsetsCompat,
                    runningAnimations: MutableList<WindowInsetsAnimationCompat>,
                ): WindowInsetsCompat {
                    publishKeyboard(insets)
                    return insets
                }
            },
        )
        webView.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
            override fun onViewAttachedToWindow(view: View) = Unit
            override fun onViewDetachedFromWindow(view: View) {
                root.removeView(probe)
                webView.removeOnAttachStateChangeListener(this)
            }
        })
        ViewCompat.requestApplyInsets(probe)
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

    @Command
    fun backgroundTask(invoke: Invoke) {
        hostActivity.runOnUiThread {
            // A tab root ends the App page tree: hand the task to the system
            // instead of letting Tauri replay WebView history.
            val moved = hostActivity.moveTaskToBack(true)
            invoke.resolve(JSObject().put("supported", true).put("applied", moved))
        }
    }
}
