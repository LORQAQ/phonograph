'use strict'
/* E 批补齐：NapiBridge 与 LocalProxy / MediaProxy */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const SRC = '../apk-build/app/src/com/phonograph/player/'
const done = []
const miss = []

/* ---------- NapiBridge：safeFileName ---------- */
{
  const p = SRC + 'NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')
  if (!s.includes('safeFileName')) {
    const anchor = '    /* ---------------- 工具 ---------------- */'
    const helper = [
      '    /** 只保留 basename，去掉路径分隔与控制字符，限长 96，空则给默认名。',
      '     *  P2: 原来 fileName 完全来自 JS，第三方音源脚本可以传 "../../../x.jpg" 绕过前端校验。 */',
      '    private static String safeFileName(String name) {',
      '        String n = name == null ? "" : name;',
      "        int a = Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\\\'));",
      '        if (a >= 0) n = n.substring(a + 1);',
      '        StringBuilder sb = new StringBuilder();',
      '        for (int i = 0; i < n.length(); i++) {',
      '            char c = n.charAt(i);',
      '            if (c < 32 || c == \'<\' || c == \'>\' || c == \':\' || c == \'"\' || c == \'|\' || c == \'?\' || c == \'*\' || c == \'\\\\\' || c == \'/\') sb.append(\'_\');',
      '            else sb.append(c);',
      '        }',
      '        n = sb.toString().trim();',
      '        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "download_" + System.currentTimeMillis();',
      '        if (n.length() > 96) {',
      '            int dot = n.lastIndexOf(\'.\');',
      '            if (dot > 0 && n.length() - dot <= 8) n = n.substring(0, 88) + n.substring(dot);',
      '            else n = n.substring(0, 96);',
      '        }',
      '        return n;',
      '    }',
      '',
      anchor,
    ].join('\n')
    s = s.replace(anchor, () => helper)
    done.push('safeFileName')
  } else done.push('safeFileName 已存在')

  /* download 里调用它 */
  const sig = '    public void download(final String url, final String fileName) {'
  if (s.includes(sig) && !s.includes('safeFileName(fileName)')) {
    s = s.replace(sig, () => `    public void download(final String url, String fileName) {
        /* P2: 只保留 basename 并过滤非法字符，防路径穿越与覆盖 */
        fileName = safeFileName(fileName);`)
    done.push('download 调用 safeFileName')
  } else if (s.includes('safeFileName(fileName)')) done.push('download 已调用')
  else miss.push('download 签名')

  fs.writeFileSync(p, s, 'utf8')
}

/* ---------- NapiBridge：copy 用 finally ---------- */
{
  const p = SRC + 'NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = `        byte[] buf = new byte[16384];
        int n;
        long total = 0;
        while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); total += n; }
        in.close();
        os.close();
        return total;`
  const b = `        byte[] buf = new byte[16384];
        int n;
        long total = 0;
        /* P2: 原来只在成功路径关流，异常路径（磁盘满/上游断流）会漏 FD */
        try {
            while ((n = in.read(buf)) > 0) { os.write(buf, 0, n); total += n; }
        } finally {
            try { in.close(); } catch (Exception e1) { }
            try { os.close(); } catch (Exception e2) { }
        }
        return total;`
  if (s.includes(a)) {
    while (s.includes(a)) s = s.replace(a, () => b)
    fs.writeFileSync(p, s, 'utf8')
    done.push('copy finally')
  } else miss.push('copy')
}

/* ---------- NapiBridge：httpAsync id quote ---------- */
{
  const p = SRC + 'NapiBridge.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = `"window.__onHttp&&window.__onHttp('" + id + "'," + quoted + ")", null);`
  const b = `"window.__onHttp&&window.__onHttp(" + org.json.JSONObject.quote(id) + "," + quoted + ")", null);`
  if (s.includes(a)) {
    while (s.includes(a)) s = s.replace(a, () => b)
    fs.writeFileSync(p, s, 'utf8')
    done.push('httpAsync id quote')
  } else miss.push('onHttp')
}

/* ---------- LocalProxy：flush ---------- */
{
  const p = SRC + 'LocalProxy.java'
  let s = fs.readFileSync(p, 'utf8')
  const a = `                    out.write(buf, 0, n);
                    lastTouch[0] = System.currentTimeMillis();   /* B3: 每次成功写都续命 */`
  const b = `                    out.write(buf, 0, n);
                    /* P3: BufferedOutputStream 默认 8KB 缓冲，不 flush 的话
                       小响应/慢速流要攒满 8KB 才发出 —— 实测 4KB/5s 的流变成每 10 秒一包。 */
                    out.flush();
                    lastTouch[0] = System.currentTimeMillis();   /* B3: 每次成功写都续命 */`
  if (s.includes(a)) {
    while (s.includes(a)) s = s.replace(a, () => b)
    fs.writeFileSync(p, s, 'utf8')
    done.push('LocalProxy flush')
  } else miss.push('LocalProxy flush')
}

/* ---------- MediaProxy：reason ---------- */
{
  const p = SRC + 'MediaProxy.java'
  if (!fs.existsSync(p)) miss.push('MediaProxy 不存在')
  else {
    let s = fs.readFileSync(p, 'utf8')
    const a = `String reason = code == 206 ? "Partial Content" : "OK";`
    const b = `String reason = code == 200 ? "OK" : code == 206 ? "Partial Content"
                : code == 403 ? "Forbidden" : code == 404 ? "Not Found"
                : code >= 500 ? "Server Error" : "Error";`
    if (s.includes(a)) {
      while (s.includes(a)) s = s.replace(a, () => b)
      fs.writeFileSync(p, s, 'utf8')
      done.push('MediaProxy reason')
    } else miss.push('MediaProxy reason')
  }
}

console.log('=== E 批补齐 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }