'use strict'
/* 第 9 批 Java + 版本号：B83 / B84 / B90 / B85
   apk-build 在工作区根（本脚本所在目录的上一级），不在 lx-music-clone 下 */
const path = require('node:path')
process.chdir(path.resolve(__dirname, '..', '..'))
const fs = require('node:fs')
const done = []
const miss = []

/* ================= B83: NapiBridge.doHttp ================= */
{
  const p = 'apk-build/app/src/com/phonograph/player/NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')

  /* B83-1: 不覆盖调用方 Content-Type */
  const ctOld = `                conn.setRequestProperty("Content-Type", "application/json");`
  if (s.includes(ctOld)) {
    s = s.replace(ctOld, `                /* B83: 尊重调用方传入的 Content-Type，别一律写死 json */
                String __ct = (headers == null) ? null : headers.optString("Content-Type", null);
                conn.setRequestProperty("Content-Type", __ct == null || __ct.isEmpty() ? "application/json" : __ct);`)
    done.push('B83 尊重调用方 Content-Type')
  } else {
    miss.push('B83 Content-Type')
  }

  /* B83-2: readAll 加 8MB 上限 */
  const raOld = `        while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);`
  if (s.includes(raOld)) {
    s = s.replace(raOld, `        /* B83: 8MB 上限，防超大响应把 App 内存打爆 */
        final int __MAX_BODY = 8 * 1024 * 1024;
        while ((n = in.read(buf)) > 0) {
            if (bos.size() + n > __MAX_BODY) throw new java.io.IOException("response too large (>8MB)");
            bos.write(buf, 0, n);
        }`)
    done.push('B83 readAll 8MB 上限')
  } else {
    miss.push('B83 readAll')
  }

  /* B83-3: 线程池替代 new Thread（两处） */
  if (!s.includes('__HTTP_POOL')) {
    /* 找类体内合适位置插入静态池 */
    const cls = s.indexOf('public class NapiBridge')
    const brace = s.indexOf('{', cls)
    if (brace > 0) {
      s = s.slice(0, brace + 1) + `
    /* B83: 用固定大小线程池，别每个请求 new Thread */
    private static final java.util.concurrent.ExecutorService __HTTP_POOL =
            java.util.concurrent.Executors.newFixedThreadPool(6);
` + s.slice(brace + 1)
      done.push('B83 注入线程池')
    }
  }

  /* 把 new Thread(...).start() 换成池 */
  const cnt = (s.match(/new Thread\(new Runnable\(\)/g) || []).length
  if (cnt > 0) {
    /* 形如： new Thread(new Runnable() { ... }).start();
       改成： __HTTP_POOL.execute(new Runnable() { ... }); */
    s = s.replace(/new Thread\(new Runnable\(\)\s*\{/g, '__HTTP_POOL.execute(new Runnable() {')
    s = s.replace(/\}\)\.start\(\);/g, '});')
    done.push('B83 new Thread → 线程池（' + cnt + ' 处）')
  }

  /* ================= B84: 下载 MIME / 失败清理 / lastIndexOf ================= */
  const mimeOld = `            cv.put(MediaStore.MediaColumns.MIME_TYPE, "audio/mpeg");`
  if (s.includes(mimeOld)) {
    s = s.replace(mimeOld, `            /* B84: 按真实扩展名给 MIME，别一律 audio/mpeg（FLAC 会被当 mp3 解码失败） */
            String __lower = fileName == null ? "" : fileName.toLowerCase();
            String __mime = __lower.endsWith(".flac") ? "audio/flac"
                    : __lower.endsWith(".m4a") ? "audio/mp4"
                    : __lower.endsWith(".ogg") ? "audio/ogg"
                    : __lower.endsWith(".wav") ? "audio/wav"
                    : "audio/mpeg";
            cv.put(MediaStore.MediaColumns.MIME_TYPE, __mime);`)
    done.push('B84 下载 MIME 按扩展名')
  } else {
    miss.push('B84 MIME')
  }

  const lnOld = `            String newName = fileName.substring(0, fileName.lastIndexOf(".")) + realExt;`
  if (s.includes(lnOld)) {
    s = s.replace(lnOld, `            /* B84: 文件名没有 '.' 时 lastIndexOf 返回 -1，substring(0,-1) 会抛越界 */
            int __dot = fileName.lastIndexOf(".");
            String __base = __dot > 0 ? fileName.substring(0, __dot) : fileName;
            String newName = __base + realExt;`)
    done.push('B84 lastIndexOf 越界')
  } else {
    miss.push('B84 lastIndexOf')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= B90: 歌词窗权限 + 拖动钳制 ================= */
{
  const p = 'apk-build/app/src/com/phonograph/player/LyricWindow.java'
  let s = fs.readFileSync(p, 'utf8')

  /* 拖动钳制 */
  const mvOld = `                lp.x = startX + (int) (e.getRawX() - downX);`
  if (s.includes(mvOld) && !s.includes('__dm')) {
    s = s.replace(mvOld, `                /* B90: 拖动时钳制在屏幕内，别让歌词飘出去找不回来 */
                android.util.DisplayMetrics __dm = ctx.getResources().getDisplayMetrics();
                int __w = root == null ? 0 : root.getWidth();
                int __h = root == null ? 0 : root.getHeight();
                lp.x = Math.max(-__w / 2, Math.min(startX + (int) (e.getRawX() - downX), __dm.widthPixels - __w / 2));`)
    done.push('B90 拖动 X 钳制')
  }

  const mvOldY = `                lp.y = startY - (int) (e.getRawY() - downY);`
  if (s.includes(mvOldY)) {
    s = s.replace(mvOldY, `                lp.y = Math.max(0, Math.min(startY - (int) (e.getRawY() - downY), __dm.heightPixels - __h));`)
    done.push('B90 拖动 Y 钳制')
  }

  fs.writeFileSync(p, s, 'utf8')
}

/* ================= B85: 版本号 ================= */
{
  const p = 'apk-build/app/AndroidManifest.xml'
  let s = fs.readFileSync(p, 'utf8')
  const old = `    android:versionCode="1"\n    android:versionName="1.0.0">`
  if (s.includes(old)) {
    s = s.replace(old, `    android:versionCode="13"\n    android:versionName="1.0.13">`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('B85 versionCode=13 versionName=1.0.13')
  } else {
    miss.push('B85 manifest')
  }

  /* MainActivity 的 UA 也同步 */
  const mp = 'apk-build/app/src/com/phonograph/player/MainActivity.java'
  let m = fs.readFileSync(mp, 'utf8')
  if (m.includes('PhonographApp/1.0"')) {
    m = m.replace('PhonographApp/1.0"', 'PhonographApp/1.0.13"')
    fs.writeFileSync(mp, m, 'utf8')
    done.push('B85 UA 版本同步')
  }
}

console.log('=== 已完成 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) {
  console.log('=== 未匹配 ===')
  miss.forEach((m) => console.log('  ⚠ ' + m))
}
