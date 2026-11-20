'use strict'
/**
 * M5: LyricWindow 的所有 UI 操作必须切到主线程
 *
 * 问题：@JavascriptInterface 方法运行在 WebView 私有后台线程（无 Looper）。
 * show() 里的 wm.addView 会创建 ViewRootImpl → Choreographer.getInstance()
 * → 抛 IllegalStateException: The current thread must have a looper!
 * 被 catch 吞掉 → root=null → show() 恒返回 false
 * → 前端每次都弹「桌面歌词打开失败」，即使权限已授予。
 *
 * 修法：LyricWindow 内部把所有 UI 操作 post 到主线程，
 * 需要返回值的用 CountDownLatch 同步取回。
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = '../apk-build/app/src/com/phonograph/player/LyricWindow.java'
let s = fs.readFileSync(p, 'utf8')

/* ---------- 1. 加 import ---------- */
if (!s.includes('import android.os.Handler;')) {
  s = s.replace(/^(package .*;)/m, `$1

import android.os.Handler;
import android.os.Looper;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;`)
  console.log('✓ 加 import')
}

/* ---------- 2. 加主线程工具方法 ---------- */
const helperAnchor = `    private int dp(int v) {`
if (!s.includes('runOnMain')) {
  s = s.replace(helperAnchor, () => `    /* M5: 统一的线程归属处理。
       @JavascriptInterface 跑在 WebView 的后台线程，没有 Looper，
       直接操作 View 会抛 "The current thread must have a looper!"。 */
    private static final Handler MAIN = new Handler(Looper.getMainLooper());

    private static boolean onMain () {
        return Looper.myLooper() == Looper.getMainLooper();
    }

    /** 投递到主线程执行并等它完成（有超时，避免桥线程被永久挂住） */
    private static boolean runOnMain (final Runnable r, long timeoutMs) {
        if (onMain()) {
            try { r.run(); } catch (Throwable t) { return false; }
            return true;
        }
        final CountDownLatch latch = new CountDownLatch(1);
        final boolean[] ok = { false };
        boolean posted = MAIN.post(new Runnable() {
            @Override
            public void run () {
                try { r.run(); ok[0] = true; } catch (Throwable t) { ok[0] = false; }
                finally { latch.countDown(); }
            }
        });
        if (!posted) return false;
        try {
            if (!latch.await(timeoutMs, TimeUnit.MILLISECONDS)) return false;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return false;
        }
        return ok[0];
    }

    ${helperAnchor}`)
  console.log('✓ 加主线程工具方法')
}

fs.writeFileSync(p, s, 'utf8')
console.log('完成第一步')