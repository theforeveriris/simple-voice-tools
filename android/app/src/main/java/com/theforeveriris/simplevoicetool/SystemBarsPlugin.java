package com.theforeveriris.simplevoicetool;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.view.View;
import android.view.Window;
import android.view.WindowInsetsController;

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
        String color = call.getString("color");
        Boolean dark = call.getBoolean("dark");
        Activity activity = getActivity();
        if (activity == null) {
            call.resolve();
            return;
        }
        Window window = activity.getWindow();
        if (color != null) {
            try {
                int c = Color.parseColor(color);
                // Android < 15 的正式途径；15+ 被忽略（edge-to-edge 强制），无副作用
                window.setStatusBarColor(c);
                window.setNavigationBarColor(c);
                // edge-to-edge 下真正生效的一层：系统栏露出的区域就是 DecorView 背景
                window.getDecorView().setBackgroundColor(c);
            } catch (IllegalArgumentException ignored) {
                // 颜色串非法：保持现状，不打断调用方
            }
        }
        if (dark != null) {
            applyIconAppearance(window, dark);
        }
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
}
