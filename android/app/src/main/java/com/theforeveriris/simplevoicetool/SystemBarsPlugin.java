package com.theforeveriris.simplevoicetool;

import android.app.Activity;
import android.app.WallpaperColors;
import android.app.WallpaperManager;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 系统栏配色：让状态栏 / 手势条区域的底色跟随 Web 端动态主题。
 *
 * edge-to-edge（Android 15 强制）下系统栏透明、statusBarColor 被忽略；
 * WebView 被 adjustMarginsForEdgeToEdge 收窄后，露出的系统栏区域显示的是
 * DecorView 的背景——所以这里直接涂 DecorView，同时兼容旧版本的
 * setStatusBarColor / setNavigationBarColor。
 *
 * 颜色由 Web 层在每次主题变化时传入（读取 body 的计算样式，含莫奈动态色板
 * 与自定义背景），dark 表示底色偏深、系统图标应改用亮色。
 */
@CapacitorPlugin(name = "SystemBars")
public class SystemBarsPlugin extends Plugin {

    @PluginMethod
    public void setColors(PluginCall call) {
        final String color = call.getString("color");
        final Boolean dark = call.getBoolean("dark");
        final Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        // Capacitor 在 CapacitorPlugins 线程上回调 @PluginMethod，
        // 触碰 View（DecorView 背景）必须切回主线程，否则 CalledFromWrongThreadException
        activity.runOnUiThread(() -> {
            try {
                Window window = activity.getWindow();
                if (color != null) {
                    int c = Color.parseColor(color);
                    // Android < 15 的正式途径；15+ 被忽略（edge-to-edge 强制），无副作用
                    window.setStatusBarColor(c);
                    window.setNavigationBarColor(c);
                    // edge-to-edge 下真正生效的一层：系统栏露出的区域就是 DecorView 背景
                    window.getDecorView().setBackgroundColor(c);
                }
                if (dark != null) {
                    applyIconAppearance(window, dark);
                }
            } catch (Exception ignored) {
                // 配色失败不影响应用本体
            }
        });
        call.resolve();
    }

    /** dark=true（深色底）→ 亮色图标；否则深色图标。API 30+ 走 InsetsController，旧版本走 flags */
    @SuppressWarnings("deprecation")
    private void applyIconAppearance(Window window, boolean dark) {
        View decor = window.getDecorView();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            WindowInsetsController controller = decor.getWindowInsetsController();
            if (controller == null) return;
            int lightBars = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
            controller.setSystemBarsAppearance(dark ? 0 : lightBars, lightBars);
        } else {
            int flags = decor.getSystemUiVisibility();
            if (dark) {
                flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            } else {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            }
            decor.setSystemUiVisibility(flags);
        }
    }

    /**
     * Material You 壁纸取色（API 27+）：返回系统壁纸的主/次/三色（#RRGGBB）。
     * Web 层据此把壁纸色相映射进应用的莫奈色板（跟随壁纸预设）。
     * API 过低或壁纸无取色信息时返回空对象，由调用方回退默认配色。
     */
    @PluginMethod
    public void wallpaperColors(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O_MR1) {
            call.resolve();
            return;
        }
        try {
            WallpaperManager wm = WallpaperManager.getInstance(activity);
            WallpaperColors colors = wm.getWallpaperColors(WallpaperManager.FLAG_SYSTEM);
            if (colors == null) {
                call.resolve();
                return;
            }
            JSObject ret = new JSObject();
            ret.put("primary", argbToHex(colors.getPrimaryColor().toArgb()));
            ret.put("secondary", argbToHex(colors.getSecondaryColor().toArgb()));
            ret.put("tertiary", argbToHex(colors.getTertiaryColor().toArgb()));
            call.resolve(ret);
        } catch (Exception e) {
            call.resolve();
        }
    }

    private static String argbToHex(int color) {
        return String.format("#%06X", color & 0xFFFFFF);
    }
}
