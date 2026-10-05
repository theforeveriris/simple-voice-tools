package com.theforeveriris.simplevoicetool;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * 原生 app shortcuts 深链接路由（对齐 PWA manifest shortcuts 的 #/hash 直达——
 * 壳内长按图标走 shortcuts.xml，WebView 不会自动应用 intent data）。
 *
 * shortcuts.xml 的静态快捷方式以 VIEW intent 打开 MainActivity，
 * data 形如 simplevoicetool://open/#/history。MainActivity 在 onCreate /
 * onNewIntent 把 intent 交给 handleIntent，这里只取 #fragment 作为路由：
 *  - 冷启动（JS 未挂载）：暂存路由，Web 层启动时 getInitialRoute() 取走并清空；
 *  - 热启动（singleTask onNewIntent）：直接推 shortcutRoute 事件；若监听未及
 *    挂载，暂存值仍可被之后的 getInitialRoute 兜底，不会丢。
 */
@CapacitorPlugin(name = "AppShortcuts")
public class AppShortcutPlugin extends Plugin {

    private static AppShortcutPlugin instance;
    private static volatile String pendingRoute;

    @Override
    public void load() {
        instance = this;
    }

    static void handleIntent(Intent intent) {
        if (instance == null || intent == null) return;
        Uri data = intent.getData();
        String fragment = data == null ? null : data.getFragment();
        if (fragment == null || fragment.isEmpty()) return;
        String route = fragment.startsWith("#") ? fragment : "#" + fragment;
        pendingRoute = route;
        JSObject payload = new JSObject();
        payload.put("route", route);
        instance.notifyListeners("shortcutRoute", payload);
    }

    /** 取走暂存路由（冷启动一次性）；无则 route 为 null */
    @PluginMethod
    public void getInitialRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("route", pendingRoute);
        pendingRoute = null;
        call.resolve(ret);
    }
}
