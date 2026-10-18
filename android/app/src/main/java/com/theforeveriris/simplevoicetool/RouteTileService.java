package com.theforeveriris.simplevoicetool;

import android.content.Intent;
import android.net.Uri;
import android.service.quicksettings.TileService;

/**
 * 快捷磁贴基类（下拉通知栏，API 24+）：点击以 VIEW + 自定义 scheme 打开
 * MainActivity，路由复用 AppShortcutPlugin.handleIntent：
 *  - 冷启动：路由暂存，Web 层 getInitialRoute() 取走；
 *  - 热启动（singleTask onNewIntent）：直接推 shortcutRoute 事件切页签。
 * 三枚磁贴（测试录音 / 历史 / 设置）各以一个空壳子类声明在 manifest——
 * 路由写死在子类（RecordTileService / HistoryTileService / SettingsTileService），
 * 避免任何运行时反查；显示 / 隐藏由用户在系统磁贴编辑器中配置（TileService
 * 标准行为）；标签随系统语言取 strings.xml。
 * minSdk 23 的更旧设备上系统不会实例化本服务，无兼容成本。
 */
abstract class RouteTileService extends TileService {
    /** 子类提供的深链接 fragment（如 "#/test"） */
    protected abstract String route();

    @Override
    public void onClick() {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("simplevoicetool://open/" + route()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // API 24 恒成立（TileService 本身即 24+）；Bundle 重载是 29+ 的替代，此处用旧签名保持向下兼容
        startActivityAndCollapse(intent);
    }
}
