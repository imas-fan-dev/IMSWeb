package top.idol_master.imsweb.nativeglass

import android.os.Build

internal const val LIGHT_NAVIGATION_BAR_COLOR = -131589 // #fdfdfb
internal const val DARK_NAVIGATION_BAR_COLOR = -15263977 // #171717

internal data class SystemBarAppearance(
    val navigationBarColor: Int,
    val lightNavigationBarIcons: Boolean,
    val lightStatusBarIcons: Boolean,
)

internal fun systemBarAppearance(
    dark: Boolean,
    sdkInt: Int = Build.VERSION.SDK_INT,
): SystemBarAppearance {
    val supportsLightNavigationBar = sdkInt >= Build.VERSION_CODES.O
    val supportsLightStatusBar = sdkInt >= Build.VERSION_CODES.M

    return SystemBarAppearance(
        navigationBarColor =
            if (dark || !supportsLightNavigationBar) {
                DARK_NAVIGATION_BAR_COLOR
            } else {
                LIGHT_NAVIGATION_BAR_COLOR
            },
        lightNavigationBarIcons = !dark && supportsLightNavigationBar,
        lightStatusBarIcons = !dark && supportsLightStatusBar,
    )
}
