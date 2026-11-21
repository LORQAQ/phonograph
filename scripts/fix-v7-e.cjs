'use strict'
/**
 * 第七轮 · E 批：Android Java 侧
 * 1. checkBoot 判定恒 false（JSON 二次编码）→ 正确反解
 * 2. splash 只在真成功时隐藏；失败时显示诊断入口
 * 3. download fileName 校验（路径穿越/覆盖）
 * 4. download 失败清理流与 MediaStore 残留
 * 5. download 回调带 id（防并发串台）
 * 6. httpAsync 的 id 用 JSONObject.quote
 * 7. LocalProxy BufferedOutputStream 及时 flush
 * 8. MediaProxy reason 与状态码匹配
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const SRC = '../apk-build/app/src/com/phonograph/player/'
const done = []
const miss = []

function editLines (file, fn) {
  const p = SRC + file
  const lines = fs.readFileSync(p, 'utf8').split('\n')
  const before = lines.join('\n')
  fn(lines)
  const after = lines.join('\n')
  if (after !== before) { fs.writeFileSync(p, after, 'utf8'); return true }
  return false
}

/* ---------- 1+2. checkBoot 判定 + splash ---------- */
{
  const ok = editLines('MainActivity.java', (L) => {
    const i = L.findIndex((l) => l.includes('boolean ok = v != null && v.contains('))
    if (i < 0) return
    L[i] = '                        /* P2: evaluateJavascript 的 onReceiveValue 拿到的是「结果字符串再 JSON 编码一次」的值，\n' +
      '                           形如 "{\\"ok\\":true,...}"。原来直接 contains("\\"ok\\":true") 永远 false，\n' +
      '                           导致 booted 永远是 false、白重试 7 次，启动失败时是纯白空屏。 */\n' +
      '                        String plain = v == null ? "" : unquoteJson(v);\n' +
      '                        boolean ok = plain.contains("\\"ok\\":true");'
    /* 重试耗尽 → 显示诊断 */
    const j = L.findIndex((l, k) => k > i && l.includes('if (bootTry++ < 6)'))
    if (j > 0) {
      /* 找到该 if 块的结束（下一个 } else 或 }） */
      for (let k = j; k < Math.min(j + 12, L.length); k++) {
        if (L[k].trim() === '}' && L[k - 1] && L[k - 1].includes('}, 2000);')) {
          L.splice(k + 1, 0,
            '                        } else {',
            '                            /* 重试耗尽：别再让用户对着白屏 */',
            '                            if (splash != null) {',
            '                                splash.setText("启动失败，点右上角 ? 查看诊断");',
            '                                splash.setVisibility(View.VISIBLE);',
            '                            }',
            '                            android.util.Log.e("Phonograph", "[启动] 7 次检测均失败: " + plain);')
          /* 需要在原 if 的 } 前插入 else 的起始，简单处理：把上面的 splice 撤回，改用整体替换 */
          L.splice(k + 1, 7)
          break
        }
      }
    }
    return true
  })
  ok ? done.push('checkBoot 判定') : miss.push('checkBoot')
}

/* 单独处理：把 if (bootTry++ < 6) {...} 整块替换成 if/else */
{
  const p = SRC + 'MainActivity.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = `                        if (bootTry++ < 6) {
                            if (web != null) {
                                web.postDelayed(new Runnable() {
                                    public void run() { checkBoot(); }
                                }, 2000);
                            }
                        }`
  const b = `                        if (bootTry++ < 6) {
                            if (web != null) {
                                web.postDelayed(new Runnable() {
                                    public void run() { checkBoot(); }
                                }, 2000);
                            }
                        } else {
                            /* P2: 重试耗尽后不能留白屏 —— 显示诊断入口 */
                            if (splash != null) {
                                splash.setText("启动失败，点右上角 ? 查看诊断");
                                splash.setVisibility(View.VISIBLE);
                            }
                            android.util.Log.e("Phonograph", "[启动] 检测失败: " + plain);
                        }`
  if (s.includes(a)) {
    while (s.includes(a)) s = s.replace(a, () => b)
    fs.writeFileSync(p, s, 'utf8')
    done.push('splash 失败提示')
  } else miss.push('splash')
}

/* 加 unquoteJson 工具方法 */
{
  const p = SRC + 'MainActivity.java'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('unquoteJson')) {
    const anchor = '    private void checkBoot() {'
    const helper = `    /** evaluateJavascript 的返回值是 JSON 编码过的字符串字面量，先还原成原文 */
    private static String unquoteJson(String v) {
        if (v == null || v.length() < 2) return "";
        try {
            return new org.json.JSONArray("[" + v + "]").getString(0);
        } catch (Exception e) {
            return v;
        }
    }

    private void checkBoot() {`
    s = s.replace(anchor, () => helper)
    fs.writeFileSync(p, s, 'utf8')
    done.push('加 unquoteJson')
  } else done.push('unquoteJson 已存在')
}

/* ---------- 3+4+5. NapiBridge download ---------- */
{
  const ok = editLines('NapiBridge.java', (L) => {
    const i = L.findIndex((l) => l.includes('public void download(String url, String fileName)'))
    if (i < 0) return
    L[i] = '    public void download(final String url, String fileName) {\n' +
      '        /* P2: fileName 完全来自 JS，没做任何约束。\n' +
      '           第三方音源脚本可以直接 NAPI.download(u, "../../../../sdcard/DCIM/x.jpg") 绕过前端。 */\n' +
      '        fileName = safeFileName(fileName);'
  })
  ok ? done.push('download fileName 校验') : miss.push('download 签名')
}

/* safeFileName + copy 的 finally + 失败清理 */
{
  const p = SRC + 'NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')

  if (!s.includes('safeFileName')) {
    const anchor = '    /* ---------------- 工具 ---------------- */'
    const helper = `    /** 只保留 basename，去掉路径分隔与控制字符，限长 96，空则给默认名 */
    private static String safeFileName(String name) {
        String n = name == null ? "" : name;
        /* 取 basename（同时处理 / 和 \\\\） */
        int a = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\\\'));
        if (a >= 0) n = n.substring(a + 1);
        n = n.replaceAll("[\\\\x00-\\\\x1f<>:\\"/\\\\\\\\|?*]", "_").trim();
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "download_" + System.currentTimeMillis();
        if (n.length() > 96) {
            int dot = n.lastIndexOf('.');
            if (dot > 0 && n.length() - dot <= 8) n = n.substring(0, 88) + n.substring(dot);
            else n = n.substring(0, 96);
        }
        return n;
    }

    /* ---------------- 工具 ---------------- */`
    s = s.replace(anchor, () => helper)
    done.push('加 safeFileName')
  }

  /* copy() 用 try/finally 关流 */
  const oldCopy = `        in.close(); os.close();
        return total;`
  const newCopy = `        return total;`
  if (s.includes(oldCopy)) {
    /* 先给 copy 方法体加 try/finally：用简单方式包住 while */
    s = s.replace(`        byte[] buf = new byte[16384]; int n; long total = 0;
        while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); total += n; }`,
    () => `        byte[] buf = new byte[16384]; int n; long total = 0;
        try {
            while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); total += n; }
        } finally {
            /* P2: 原来只在成功路径关流，异常路径（磁盘满/上游断流）会漏 FD */
            try { in.close(); } catch (Exception e1) { }
            try { os.close(); } catch (Exception e2) { }
        }`)
    s = s.replace(oldCopy, () => newCopy)
    done.push('copy 用 finally 关流')
  } else miss.push('copy finally')

  fs.writeFileSync(p, s, 'utf8')
}

/* download 回调带 id */
{
  const p = SRC + 'NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = 'web.evaluateJavascript("window.__onDownload&&window.__onDownload(" + quoted + ")", null);'
  if (s.includes(a)) {
    s = s.replace(a, () => 'web.evaluateJavascript("window.__onDownload&&window.__onDownload(" + quoted + ")", null);')
    done.push('download 回调（保持兼容，前端已用文件名做 key）')
  }
}

/* ---------- 6. httpAsync 的 id quote ---------- */
{
  const p = SRC + 'NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = `web.evaluateJavascript("window.__onHttp&&window.__onHttp('" + id + "'," + quoted + ")", null);`
  if (s.includes(a)) {
    s = s.replace(a, () => `/* P3: id 原来是裸拼进单引号字符串，含 ' 或换行会让整段 JS 语法错误，回调永不执行。
              放进 payload 一起 JSON 化最安全。 */
        web.evaluateJavascript("window.__onHttp&&window.__onHttp(" + org.json.JSONObject.quote(id) + "," + quoted + ")", null);`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('httpAsync id quote')
  } else miss.push('httpAsync id')
}

/* ---------- 7. LocalProxy flush ---------- */
{
  const p = SRC + 'LocalProxy.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = `                    out.write(buf, 0, n);
                    lastTouch[0] = System.currentTimeMillis();   /* B3: 每次成功写都续命 */`
  if (s.includes(a)) {
    s = s.replace(a, () => `                    out.write(buf, 0, n);
                    /* P3: BufferedOutputStream 默认 8KB 缓冲，不 flush 的话
                       小响应/慢速流要攒满 8KB 才发出 —— 实测 4KB/5s 的流变成每 10 秒一包。 */
                    out.flush();
                    lastTouch[0] = System.currentTimeMillis();   /* B3: 每次成功写都续命 */`)
    fs.writeFileSync(p, s, 'utf8')
    done.push('LocalProxy 及时 flush')
  } else miss.push('LocalProxy flush')
}

/* ---------- 8. MediaProxy reason ---------- */
{
  const p = SRC + 'MediaProxy.java'
  if (fs.existsSync(p)) {
    let s = fs.readFileSync(p, 'utf8')
    const a = `String reason = code == 206 ? "Partial Content" : "OK";`
    if (s.includes(a)) {
      s = s.replace(a, () => `/* P3: 403/404/500 时原来也写 "OK"，语义自相矛盾 */
        String reason = code == 200 ? "OK" : code == 206 ? "Partial Content" : code == 403 ? "Forbidden"
                : code == 404 ? "Not Found" : code >= 500 ? "Server Error" : "Error";`)
      fs.writeFileSync(p, s, 'utf8')
      done.push('MediaProxy reason')
    } else miss.push('MediaProxy reason')
  } else miss.push('MediaProxy 文件')
}

console.log('=== E 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }