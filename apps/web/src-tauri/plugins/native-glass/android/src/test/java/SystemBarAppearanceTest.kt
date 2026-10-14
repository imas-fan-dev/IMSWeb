package top.idol_master.imsweb.nativeglass

import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Test

class SystemBarAppearanceTest {
    @Test
    fun `light Android 15 theme requests dark system-bar icons`() {
        val appearance =
            systemBarAppearance(
                dark = false,
                sdkInt = Build.VERSION_CODES.VANILLA_ICE_CREAM,
            )

        assertEquals(LIGHT_NAVIGATION_BAR_COLOR, appearance.navigationBarColor)
        assertEquals(true, appearance.lightNavigationBarIcons)
        assertEquals(true, appearance.lightStatusBarIcons)
    }

    @Test
    fun `dark Android 15 theme requests light system-bar icons`() {
        val appearance =
            systemBarAppearance(
                dark = true,
                sdkInt = Build.VERSION_CODES.VANILLA_ICE_CREAM,
            )

        assertEquals(DARK_NAVIGATION_BAR_COLOR, appearance.navigationBarColor)
        assertEquals(false, appearance.lightNavigationBarIcons)
        assertEquals(false, appearance.lightStatusBarIcons)
    }

    @Test
    fun `pre Marshmallow compatibility keeps a dark navigation bar`() {
        val appearance =
            systemBarAppearance(
                dark = false,
                sdkInt = Build.VERSION_CODES.LOLLIPOP,
            )

        assertEquals(DARK_NAVIGATION_BAR_COLOR, appearance.navigationBarColor)
        assertEquals(false, appearance.lightNavigationBarIcons)
        assertEquals(false, appearance.lightStatusBarIcons)
    }

    @Test
    fun `Android 6 light theme keeps a dark navigation bar with dark status icons`() {
        val appearance =
            systemBarAppearance(
                dark = false,
                sdkInt = Build.VERSION_CODES.M,
            )

        assertEquals(DARK_NAVIGATION_BAR_COLOR, appearance.navigationBarColor)
        assertEquals(false, appearance.lightNavigationBarIcons)
        assertEquals(true, appearance.lightStatusBarIcons)
    }
}
