package com.theforeveriris.simplevoicetool;

import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;

/**
 * 原生「分享到」接收（替代 PWA share target——壳内 WebView 没有 Service Worker，
 * manifest 的 POST share-target 机制不可用）。
 *
 * MainActivity 在 onCreate / onNewIntent 把 SEND / SEND_MULTIPLE intent 交给
 * handleIntent：音频流拷入 cacheDir/share-target（文件名沿用来源显示名）。
 * Web 层先 addListener 再调 start() 握手：握手返回积压批次（应用未启动时的分享），
 * 之后到达的分享经 shareTargetReceived 事件实时推送。
 */
@CapacitorPlugin(name = "ShareTarget")
public class ShareTargetPlugin extends Plugin {

    private static ShareTargetPlugin instance;

    private final Object pendingLock = new Object();
    private JSArray pending = new JSArray();
    /** JS 已挂监听并完成握手：true = 直接推事件，false = 入待取队列 */
    private volatile boolean jsReady = false;
    /** 待取批次上限：防止只收不取时无限增长 */
    private static final int MAX_PENDING_BATCHES = 8;
    /** 缓存目录中超过该年龄的遗留文件在下次接收时清理 */
    private static final long CACHE_FILE_TTL_MS = 24 * 60 * 60 * 1000L;

    @Override
    public void load() {
        instance = this;
    }

    static void handleIntent(Context ctx, Intent intent) {
        if (instance == null || intent == null) return;
        try {
            instance.handle(ctx, intent);
        } catch (Exception e) {
            // 分享接收属尽力而为：失败不影响应用本身
        }
    }

    private void handle(Context ctx, Intent intent) throws JSONException {
        String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_SEND_MULTIPLE.equals(action)) return;

        ArrayList<Uri> uris = new ArrayList<>();
        if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            if (list != null) uris.addAll(list);
        } else {
            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (uri != null) uris.add(uri);
        }
        if (uris.isEmpty()) return;

        cleanStaleCache(ctx);
        JSArray files = new JSArray();
        for (Uri uri : uris) {
            File out = copyToCache(ctx, uri);
            if (out == null) continue;
            JSObject f = new JSObject();
            f.put("path", out.getAbsolutePath());
            f.put("name", out.getName());
            files.put(f);
        }
        if (files.length() == 0) return;

        JSObject data = new JSObject();
        data.put("files", files);
        if (jsReady) {
            notifyListeners("shareTargetReceived", data);
        } else {
            synchronized (pendingLock) {
                pending.put(data);
                while (pending.length() > MAX_PENDING_BATCHES) {
                    pending.remove(0);
                }
            }
        }
    }

    /**
     * JS 挂载后的握手：返回并清空积压批次（每批 { files: [{path, name}] }），
     * 之后到达的分享改走 shareTargetReceived 事件。
     * 调用顺序约定（Web 层）：先 addListener，再 start，最后处理返回的批次——
     * 握手期间落地的分享要么已在积压里、要么走事件，不会丢也不会重。
     */
    @PluginMethod
    public void start(PluginCall call) {
        JSArray batches;
        synchronized (pendingLock) {
            batches = pending;
            pending = new JSArray();
            jsReady = true;
        }
        JSObject ret = new JSObject();
        ret.put("batches", batches);
        call.resolve(ret);
    }

    private File copyToCache(Context ctx, Uri uri) {
        try {
            InputStream in = ctx.getContentResolver().openInputStream(uri);
            if (in == null) return null;
            String name = queryDisplayName(ctx, uri);
            if (name == null || name.isEmpty()) {
                name = "shared-audio-" + System.currentTimeMillis();
            }
            // 去路径分隔符，防目录穿越；重名覆盖无害（同一次分享同名文件）
            name = name.replaceAll("[/\\\\]", "_");
            File dir = new File(ctx.getCacheDir(), "share-target");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File out = new File(dir, name);
            try (FileOutputStream outStream = new FileOutputStream(out)) {
                byte[] buf = new byte[16 * 1024];
                int n;
                while ((n = in.read(buf)) > 0) {
                    outStream.write(buf, 0, n);
                }
            } finally {
                in.close();
            }
            return out;
        } catch (Exception e) {
            return null;
        }
    }

    private String queryDisplayName(Context ctx, Uri uri) {
        try (Cursor c = ctx.getContentResolver().query(uri, null, null, null, null)) {
            if (c == null) return null;
            int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
            if (idx < 0 || !c.moveToFirst()) return null;
            return c.getString(idx);
        } catch (Exception e) {
            return null;
        }
    }

    private void cleanStaleCache(Context ctx) {
        File dir = new File(ctx.getCacheDir(), "share-target");
        File[] files = dir.listFiles();
        if (files == null) return;
        long cutoff = System.currentTimeMillis() - CACHE_FILE_TTL_MS;
        for (File f : files) {
            if (f.lastModified() < cutoff) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }
}
