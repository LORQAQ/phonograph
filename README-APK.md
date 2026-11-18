# 留声 · 安卓完整版（APK）

**`留声.apk`（786 KB · Android 5.0+）—— 独立运行，内置 14 个 LX 音源脚本，支持 VIP 曲目与 QQ 音乐。**

---

## 一、和洛雪（LX Music）同款思路

洛雪安卓版的做法是：**把自定义音源脚本放在 JS 层跑，`lx.request` 走原生网络栈**。
留声完整版照这个思路实现，只是宿主从 React Native 换成了 WebView：

```
APK (786 KB)
├─ assets/www/
│  ├─ lib/lx-engine-web.js      ← 浏览器版 LX 脚本运行时（沙箱 + lx 协议）
│  ├─ lib/vendor/crypto-js.min.js  ← AES / MD5（脚本加密签名用）
│  ├─ lib/vendor/jsencrypt.min.js  ← RSA PKCS#1（QQ 音乐签名用）
│  ├─ lib/vendor/pako.min.js       ← zlib inflate/deflate
│  ├─ sources-data.js           ← 14 个音源脚本（1.3 MB，内嵌为字符串）
│  ├─ lib/music-libs.js         ← 三平台搜索 / 榜单 / 歌单 / 歌词
│  ├─ api-mobile.js             ← /api/* 路由 + 取流调度
│  └─ app.js / index.html / style.css
├─ NapiBridge.java   ← lx.request 的落点：同步 HttpURLConnection（无 CORS、支持 insecure）
├─ MediaProxy.java   ← 给音频请求补 Referer，透传 Range
└─ MainActivity.java ← WebView 加载 file:///android_asset/www/index.html
```

### 关键三件事

**1. 沙箱**：洛雪用 worker + vm，WebView 里用 `new Function(code)`。
每个脚本执行前注入专属 `globalThis.lx`，执行后恢复，互不污染：

```js
const lx = {
  version: '2.0.0', env: 'mobile',
  EVENT_NAMES, on(ev, fn), send(ev, data), request, utils: createUtils()
}
globalThis.lx = lx
new Function(code)()          // 脚本自行 lx.on('request') + lx.send('inited')
```

**2. `lx.request` → 原生桥**：脚本里的每次 HTTP 请求转给 `NapiBridge`：

```java
@JavascriptInterface
public String http(String url, String optsJson) { ... HttpURLConnection ... }
```

同步返回 `{status, body}`，脚本拿到的是普通字符串，跟 Node 里的 `lx.request` 行为一致。

**3. `lx.utils`**：脚本加密全靠它，用三个库补齐：

| Node 原生 | 浏览器替代 |
| --- | --- |
| `crypto.createCipheriv('aes-128-cbc', …)` | `CryptoJS.AES.encrypt` + 手动切 key/iv |
| `crypto.publicEncrypt(RSA_PKCS1)` | `JSEncrypt.encrypt` → base64 → 二进制 |
| `crypto.createHash('md5')` | `CryptoJS.MD5` |
| `crypto.randomBytes(n).toString('hex')` | `crypto.getRandomValues` |
| `zlib.inflate/deflate` | `pako.inflate/deflate` |
| `Buffer` | 手写 60 行 `Buf`（uint8 子类，支持 utf8/base64/hex/binary） |

---

## 二、取流调度顺序

```
播放某首歌
  ├─ 1. 依次尝试 14 个脚本（谁支持该平台就用谁）
  │     changqing 长青SVIP · fish_music · flower 野花 · grass 野草
  │     huibq · ikun · juhe · kulao · lx · lxv7 · nianxin · quandouyao · sixyin · yiyin
  │     支持平台：wy 网易云 / tx QQ音乐 / kw 酷我 / kg 酷狗 / mg 咪咕
  ├─ 2. 全部失败 → 平台直链兜底
  │     网易云 outer/url · 酷狗 play/getdata
  └─ 3. 再失败 → 提示「该曲目无可用音源，换一首」
```

实测脚本加载（Node 模拟同样的沙箱环境）：

```
✅ changqing   长青SVIP音源     支持 kg,tx,wy,kw,mg
✅ fish        fish_music       支持 kw,wy,kg,tx,mg
✅ flower      野花🌷            支持 kw,wy,mg,tx,kg
✅ grass       野草🌾            支持 kw
✅ huibq       Huibq_lxmusi     支持 kw,kg,tx,wy,mg
✅ ikun        ikun音源          支持 kw,kg,tx,wy,mg
```

---

## 三、与电脑版的功能对照

界面层是同一份 `app.js`（手机端只打了 3 个补丁），所以**所有页面、弹层、交互逻辑都在**。差别在数据层与系统能力：

| 功能 | 电脑版 | 手机版 |
| --- | --- | --- |
| 三平台搜索 / 历史 / 分页 | ✅ | ✅ |
| 推荐歌单（无限滚动）/ 预览导入 | ✅ | ✅ |
| 排行榜（4 榜 × 3 平台） | ✅ | ✅ |
| 我的歌单（增删改 / 封面 / 移除单曲） | ✅ | ✅ |
| 播放 / 进度 / 倍速 / 循环·单曲·随机 | ✅ | ✅ |
| 队列：拖拽排序 | 鼠标拖 | **长按 350ms 后上下滑** ✅ |
| 歌曲菜单（右键） | 右键 | **长按 500ms** ✅ |
| 歌词滚动 + 全屏歌词页 + 偏移 | ✅ | ✅ |
| 最近播放 | ✅ | ✅ |
| 主题（亮/暖/暗 × 5 配色） | ✅ | ✅ |
| 音源脚本取流（14 个，含 VIP / QQ） | ✅ | ✅ |
| **指定音源取流**（右键选脚本） | ✅ | ✅（`only` 透传） |
| **下载歌曲到本地** | ✅ 存本机 | ✅ **存「下载/留声」**（MediaStore，免权限） |
| **音源管理**：启停 / 重载 / 删除 / 在线导入 / 并发测速 | ✅ | ✅ 全部实现 |
| **桌面歌词** | 透明置顶窗 | ✅ **系统悬浮窗**（可拖动，实时同步） |
| 跟随封面取色 | ✅ | ⚠️ 跳过（file:// 取不到图） |
| 音量滑块 | ✅ | ⚠️ 隐藏（用系统音量） |
| 全局快捷键 / 托盘 / 单实例 / 开机自启 | ✅ | ❌ 桌面特性 |
| 设置里的「手机访问地址」 | ✅ | ⚠️ 无意义（独立运行） |
| 酷我 / 咪咕 原生搜索 | — | ❌ 接口有反爬（脚本层可取流，缺搜索入口） |

可补但这次没做：下载（要存储权限 + 原生写入）、音源启停面板（改 20 行）、酷我/咪咕平台接入（脚本已支持，界面没加 tab）。

---

## 四、安装

1. `留声.apk` 传手机 → 点击安装 → 允许未知来源
2. 打开即用，**不需要电脑、不需要填地址**
3. 首次播放某平台歌曲时，脚本会在后台完成初始化（约 1–3 秒），之后秒开

---

## 五、重新构建

```powershell
cd lx-music-clone
runtime\node.exe scripts\build-mobile-www.js      # 音乐接口模块 → mobile/www/lib/music-libs.js
runtime\node.exe scripts\build-sources-bundle.js  # sources/*.js → mobile/www/sources-data.js
runtime\node.exe scripts\assemble-mobile-www.js   # 复制前端 + 打补丁
runtime\node.exe scripts\test-lx-web.js           # 自检：14 个脚本能否加载

cd ..\apk-build
Copy-Item ..\lx-music-clone\mobile\www app\assets\www -Recurse -Force
powershell -ExecutionPolicy Bypass -File build-apk.ps1
```

工具链镜像与六步命令见 `README-APK.md`。
