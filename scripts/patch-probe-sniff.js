'use strict'
/* Android probe 增强：HEAD 之外再取前 64 字节，挡掉返回 JSON/HTML 的假地址 */
const fs = require('node:fs')
const p = '../apk-build/app/src/com/phonograph/player/NapiBridge.java'
let s = fs.readFileSync(p, 'utf8')

if (s.includes('sniffBody')) { console.log('已存在'); process.exit(0) }

/* 在 probe 方法里：HEAD 判定 audio 后再做内容嗅探 */
const oldTail = `            boolean ok = code < 400 && ct != null &&
                    (ct.contains("audio") || ct.contains("video") || ct.contains("octet-stream"));
            JSONObject o = new JSONObject();
            o.put("ok", ok);
            o.put("status", code);
            o.put("type", ct == null ? "" : ct);
            return o.toString();`

const newTail = `            boolean ok = code < 400 && ct != null &&
                    (ct.contains("audio") || ct.contains("video") || ct.contains("octet-stream"));
            /* HEAD 看起来正常时，再取 64 字节确认不是 JSON/HTML 错误页 */
            if (ok && sniffBody(url)) ok = false;
            JSONObject o = new JSONObject();
            o.put("ok", ok);
            o.put("status", code);
            o.put("type", ct == null ? "" : ct);
            return o.toString();`

if (s.includes(oldTail)) {
  s = s.replace(oldTail, newTail)
}

/* 加 sniffBody 方法 */
const anchor = '    /** 读取文件头判断真实音频格式 */'
const sniff = `    /** 内容嗅探：返回 true 表示是错误页（JSON/HTML），false 表示像音频 */
    private boolean sniffBody(String url) {
        try {
            HttpURLConnection c = openConnection(url, true);
            c.setRequestProperty("User-Agent", UA);
            c.setRequestProperty("Range", "bytes=0-63");
            c.setConnectTimeout(6000);
            c.setReadTimeout(6000);
            InputStream in = c.getInputStream();
            byte[] b = new byte[64];
            int n = in.read(b);
            in.close();
            if (n <= 0) return true;
            String head = new String(b, 0, n, "UTF-8").trim();
            if (head.startsWith("{") || head.startsWith("[") || head.startsWith("<")) return true;
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    /** 读取文件头判断真实音频格式 */`

if (s.includes(anchor) && !s.includes('sniffBody')) {
  s = s.replace(anchor, sniff)
}

fs.writeFileSync(p, s, 'utf8')
console.log('sniffBody:', s.includes('sniffBody'))
