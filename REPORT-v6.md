# 全源代码审查报告 · 第六轮

> 审查时间：2026-11-20
> 审查范围：全部源码约 11,500 行
> 方式：4 个独立审查员并行 + 我自己的静态扫描，所有结论都有实测或代码路径证据

---

## 总览

| 模块 | P0 | P1 | P2 | P3 | 合计 |
|---|---|---|---|---|---|
| 服务端（`app/`） | 1 | 4 | 7 | 8 | 20 |
| 前端（`public/`） | 0 | 2 | 7 | 13 | 22 |
| 手机端（`mobile/` + Java） | 0 | 8 | 9 | 6 | 23 |
| 构建打包链（`scripts/`） | 2 | 11 | 5 | 5 | 23 |
| **合计** | **3** | **25** | **28** | **32** | **88** |

**已经修过并通过验证的部分**（本轮不重复报）：
SSRF 拦截、Origin 基础校验、Cookie 脱敏、缓存 LRU 主干、gcid 全量翻页、唱片尺寸、检查更新、写接口 POST 化。

---

# 第一部分：P0（数据丢失 / 装不上 / 骗过验证）

## P0-1 `dbRetry` 从未声明 —— 写盘重试完全失效，且每次保存都抛异常

**位置**：`app/server.js:96`、`app/server.js:104-107`

**现象**

1. **正常情况**：每次保存（改设置 / 建歌单）都在 stderr 打 `[db] 写盘失败，3 秒后重试: dbRetry is not defined`，并抛 `[fatal] 未捕获异常: ReferenceError`。日志骗人 —— 盘其实写成功了。
2. **真失败时**（磁盘满 / 文件被占用 / 权限）：接口回 200，内存是新值，**磁盘永远是旧值**，指数退避重试永远不会被排期。用户这次修改永久丢失。

**根因**：`dbRetry` 全文只有赋值、没有声明。文件首行 `'use strict'` 使赋值变成 `ReferenceError`：

```js
74: let saveTimer = null
76: let dbDirty = false
77: let dbFirstDirtyAt = 0
    // ← 缺少 let dbRetry = 0
96:     dbRetry = 0                                    // 抛 ReferenceError
104:    dbRetry = Math.min((dbRetry || 0) + 1, 6)      // 再抛一次，直接炸出函数
107:    if (!saveTimer) saveTimer = setTimeout(flushDb, __delay)   // 永远到不了
```

**实测**（把 `data/db.json.tmp` 造成目录，必然 `EISDIR`）：

```
POST /api/settings {"quality":"128k"} → HTTP 200
2 秒后  db.json 仍是 "320k"
12 秒后 仍是 "320k"
stderr: [db] 写盘失败，3 秒后重试: EISDIR...
        [fatal] 未捕获异常: ReferenceError: dbRetry is not defined
           at Timeout.flushDb (app/server.js:104:25)
```

**修复**：补 `let dbRetry = 0`，并把 `flushDb` 整体包一层 `try/catch`，确保任何异常都不会逃出定时器回调。

---

## P0-2 安装包内 zip 的中文条目名用 GBK 字节，未置 UTF-8 标志

**位置**：`scripts/rebuild-installer.js:41`（`Compress-Archive`）、`scripts/Installer.cs:90-104`

**现象**：`留声.exe` 在 zip 里存的是 `C1 F4 C9 F9 2E 65 78 65`（GBK「留声」），中央目录 `general purpose flag = 0x0008`，**第 11 位 UTF-8 标志未置**。

解包端是 .NET Framework `ZipArchive`，未置该标志时按 `Encoding.Default`（系统 ANSI 代码页）解码。

- 本机 ACP = 936（中文）→ 解出正确的 `留声.exe`
- **非 936 的 Windows（英文/日文/韩文系统）→ 解出乱码文件名 → 快捷方式指向不存在的文件 → 用户装完打不开**

同仓库已有化石证据：`apk-build\鐣欏０.apk.idsig`（GBK 乱码文件名）。

**修复**：生成 zip 改用 `.NET ZipFile::CreateFromDirectory` 并显式用 UTF-8 写条目名；安装器解包后断言 `File.Exists(dir\留声.exe)`，不成立就报错回滚。

---

## P0-3 归档动作没有任何脚本执行，唯一的"旧包闸门"永远不会失败

**位置**：`scripts/verify-apk-archived.cjs`（全文无 `process.exitCode`）、`scripts/verify-apk.cjs:18`、`scripts/release-v1028.cjs:135`

**现象**

- `verify-apk-archived.cjs` **全文没有 `process.exitCode` / `process.exit`**，不一致时只 `console.log('✗')`，退出码仍为 0
- 该脚本还**写死**了 `留声-1.0.27.apk`（过期），不含当前版本
- `verify-apk.cjs` 校验的是 `apk-build/liusheng.apk`（构建中间物），不是发布上传的那个文件，且**完全没有版本号断言**
- 全仓**没有任何脚本执行归档** —— 唯一的 `Copy-Item ... 留声.apk` 只作为文本躺在 `release-v1027.cjs` 的发布文案里

**这就是上次「留声.apk 还是 1.0.0」事故的根因，至今未修。**

**实测**：把 1.0.27 换成 1.0.0 旧包，`verify-apk-archived.cjs` 同样打印 `APP_VERSION: 1.0.0` 并 `exit=0`。

**修复**

1. `verify-apk-archived.cjs` 改为 `glob('留声*.apk')` + 断言 `APP_VERSION === 期望` + 不符 `process.exit(1)`
2. `verify-apk.cjs` 加版本断言（从 `AndroidManifest.xml` 读期望值）
3. 归档写进 `build-apk.ps1` 末尾（从 manifest 读版本号拼文件名）
4. 把这两个脚本加进 `selfcheck-all.cjs` 的 SUITES

---

# 第二部分：P1

## 服务端（4 条）

### S1 `/api/sources/test` 没有任何超时 —— 脚本卡住则接口永久挂起

`source-manager.js:310` 直接 `await entry.script.musicUrl(...)`，没有 `callWithTimeout`。
同一条取流路径上的 `resolveUrl` 有 5 秒超时，`testAll` 没有。

实测：放一个只 `send('inited')` 然后 `on('request', () => new Promise(() => {}))` 的脚本 →
`POST /api/sources/test` **20 秒无响应**，进程仍存活。

**修复**：`testAll` 内包 `callWithTimeout(..., 5000)`；路由层加 12 秒总预算。

### S2 `/api/sources/import` 导入新音源必定 500，但文件已写进磁盘

`server.js:983-986`：

```js
const file = sourceManager.install(name, sourceCode)
await sourceManager.reload(id)      // entries.get(id) === undefined → throw '音源不存在'
```

`install()` 只写文件不注册 entry，`reload()` 要求 entry 已存在。

实测：新名字 import → `500 {"error":"音源不存在"}`，但 `sources/imp7.js` 已落盘；重启后才出现。

**修复**：把 `reload(id)` 改成 `loadOne(file)`。

### S3 `/api/url` 没有总预算 —— 单次点歌最坏实测 115 秒

各层超时串行叠加：`waitForAnySource` 8s+3s → `resolveUrl` 24s → 跨平台 2 个平台 × (搜索 15s + 5 个候选 × 24s)。

实测（唯一音源永不返回）：`GET /api/url` → **115.3 秒**才回 500。

**修复**：给 `/api/url`、`/api/stream`、`/api/download` 一个统一 deadline（30 秒），传进 `resolveWithCross` 和 `resolveUrl`，每层检查。

### S4 下载落盘 `save=1` 用 GET 就能触发 —— 绕过写接口 POST 门禁

`WRITE_PATHS` 里没有 `/api/download`，只把它放进了 Content-Type 名单（那个只对 POST 生效）。

任何网页用 `<img src="http://127.0.0.1:37621/api/download?save=1&id=...">` 即可触发落盘（跨站 GET 不带 Origin，`sameOrigin` 放行）。

实测：`GET /api/download?save=1&id=...` → 进入了写盘分支（500 是音源失败，不是 405）。

**修复**：`/api/download` 加进 `WRITE_PATHS`；前端改 POST。

## 前端（2 条）

### F1 搜索结果迟到会覆盖用户已切换到的视图

`app.js:1489-1513`：`doSearch` 只挡「又一次搜索」，不挡「切了视图」。

实测：搜索后立刻点排行榜 → 排行榜先渲染 → 约 1 秒后正文被搜索结果替换，标题变「搜索 xxx」，左侧导航一个都不高亮。

**修复**：引入 `viewToken`，`switchView` 每次自增；渲染前校验 `vt === viewToken && state.view === 'search'`。

### F2 播放失败后的自动跳歌定时器没有 token 守卫

`app.js:1116-1117`：

```js
setTimeout(() => playNext(true), 700)     // 没有 token 校验
```

同一文件 `916` 行的同类逻辑是写对的（带 `token === state.playToken`）。

用户在这 0.7 秒内点了另一首歌，0.7 秒后仍强制跳到下一首，用户刚点的歌被顶掉。

## 手机端（8 条）

### M1 LocalProxy：acceptor 异常时 `active` 泄漏 + 客户端永久挂死

`LocalProxy.java:110`（`watchdog.scheduleAtFixedRate`）和 `:120`（`pool.execute`）抛异常时，`:135` 的 `catch (Throwable)` 既不 `close(s)` 也不 `active.decrementAndGet()`。

实测：模拟 `stop()` 中间态后，请求拿到「一个字节都没有、永不返回」的连接，`active` 从 0 涨到 4；人为置 33 后所有新连接直接被拒。

### M2 LocalProxy：客户端断开时上游连接从不 `disconnect()`

`:286-289` 只在成功路径关闭。

实测（4 次客户端 RST 中断）：15 秒后上游 4/4 仍是「读超时」（代理从未关上游）；对照组正常读完有 EOF。

快速切歌会让 socket 一个个漏掉。

### M3 LocalProxy：`getPort()` 自愈遗弃旧线程池

`:79` 无条件 `pool = new ThreadPoolExecutor(...)`，旧池不 `shutdown()`。旧池线程是非守护线程，`stop()` 之后再也收不回来。

实测：自愈后 `pool1` 与 `pool2` 不是同一对象，`stop()` 后 `pool1` 仍 `isShutdown=false`、线程 `RUNNABLE`。

### M4 NapiBridge：`probe()` 是同步桥，一次探活最长阻塞 JS 线程 28 秒

`:132-162` HEAD（8s+8s）+ 命中后 GET（6s+6s）。同步 `@JavascriptInterface` 期间 WebView 的 JS 线程完全冻结。

且 `sniffBody` 算出的 `ok` 字段在两个调用点都被丢弃 —— 这轮 GET 纯属白跑。

### M5 LyricWindow：整个悬浮窗在 JS 桥线程操作 UI —— 桌面歌词 100% 打不开

`NapiBridge.java:300-301` 直接调 `lyric.show()`，运行在 WebView 私有后台线程（无 Looper）。

`wm.addView` 会抛 `IllegalStateException: The current thread must have a looper!`，被 `LyricWindow.java:121-125` 的 `catch (Exception e) { root = null; }` 吞掉 → `show()` 恒返回 false。

前端因此每次都弹「桌面歌词打开失败」，即使权限已授予。

### M6 `resolveUrl` 网易云分支先白跑一次 probe，然后无条件 throw

`api-mobile.js:266-282`：算出 URL、调 `NAPI.probe`（同步阻塞）、把结果存进三个变量，然后连抛两个 Error（第二个不可达）。三个变量全部未被使用。

结果：每首脚本取流失败的网易云歌都额外吃一次最长 28 秒的同步探活，且必然失败。

### M7 `/api/url` 缓存无法从外部失效 —— 「换音源重试」拿回同一条死链

`api-mobile.js:990` 只认 `opts.force / opts.noCache`，而前端三处 `/api/url` 调用都不传 opts。

`streamSrc(song,'',true)` 只绕过前端的 5 分钟缓存，绕不过 api-mobile 的 4 分钟缓存。CDN token 过期后重试拿回同一条 URL。

### M8 `ensureScripts` 一次失败后整场会话不再重试 —— 网易云歌曲全灭

`api-mobile.js:958`：`if (!scriptsLoading) scriptsLoading = M.loadAll(...)` 之后**从不复位**。

第一次 `loadAll` reject 后，后续每次 `await` 同一个已 rejected 的 Promise，`catch` 吞掉照常返回。

叠加 M6（网易云分支必 throw）→ 用户侧表现「所有网易云的歌都放不了」，直到重启 App。

实测：三次调用 `ensureScripts()`，`loadAll` 只被调用 1 次。

## 构建链（11 条，摘要）

| # | 问题 | 后果 |
|---|---|---|
| B1 | `index.html` 的补丁是裸 `replace()`，锚点漂移静默通过 | 产出白屏 APK，且 30/30 全绿 |
| B2 | `sources-data.js` 不在打包链，生成器产出 7 源（含会卡死的 xingkong）vs 线上 6 源 | 重跑生成器就把卡死音源塞进手机包 |
| B3 | `verify-installer.cjs` 26 项里没有一项检查 `留声.exe` | 外壳缺失也能 26/26 |
| B4 | `verify-apk.cjs` 校验的不是发布上传的那个文件，无版本断言 | 同 P0-3 |
| B5 | 卸载器用 `DefaultDir` 而非注册表里的实际安装路径 | 装到自定义目录后卸不干净（170MB 残留） |
| B6 | 覆盖安装无"程序在运行"检测、无回滚、不清理旧文件 | 中途失败留下混合目录 |
| B7 | `rebuild-installer.js` 输出名硬编码 `1.0.0`，csc 失败不设退出码 | "构建成功"可能是假的 |
| B8 | 发布脚本附件缺失/上传失败只打印 `x`，最后仍打印"完成"、退出码 0 | Release 没有附件也算成功 |
| B9 | `push-via-api.cjs` 只推 12 个写死路径（仓库有 497 个受控文件） | 其它改动永不同步，但会打印"已同步" |
| B10 | 外壳只探测端口、不核对 `/api/health` 版本 | 会挂到旧版后台服务或任何占用 37621 的进程 |
| B11 | `--silent` 装失败也返回 0 | 自动化永远看不见失败 |

---

# 第三部分：P2（择要，28 条）

## 服务端

| 问题 | 后果 |
|---|---|
| 同源校验可被 DNS rebinding 绕过（`Host` 由请求方决定，却当信任锚） | 实测 `Origin: http://evil.example` + `Host: evil.example` → 200 |
| `/api/settings` 可写任意键，绕过 `/api/download-dir` 的目录校验 | `{"downloadDir":"Z:\\不存在"}` → 200 并落盘 |
| `/api/stream` 用裸 `urlCache.set` 绕过 `cacheSet` 的上限与 LRU | 长期运行后只增不减 |
| QQ Cookie 对搜索/详情/歌词完全无效（`api()` 只用静态 `HEADERS`） | 设置里填了 cookie 也不生效 |
| `mapSong` 系列对畸形数据无防御 | 上游把 `singer` 给成字符串 → 整个列表 500 |
| `/api/sources/import` 跟随重定向无跳数上限 | 实测一次导入 301 次请求 |
| `save=1` 分支的 `fetch` 无超时 | 上游挂住要等 ~5 分钟 |
| `action=rename` 不校验 `name` | 歌单名被写成 `undefined` 并消失 |

## 前端

| 问题 | 后果 |
|---|---|
| `doSearch` 的 `catch` 无序号守卫 | 旧搜索的错误盖掉新搜索的结果 |
| 其它 `render*View` 同样缺视图校验 | 下载页会改写别的页面 |
| 导入歌单无重入锁 | 连按回车生成两份重复歌单 |
| 下载文件名未 `esc()` 就拼进 `innerHTML` | 唯一未转义的注入面 |
| 8 处 `await api()` 无 catch | 失败变成顶部红条调试错误 |
| 歌词字号/偏移绑到不存在的 id | 功能完全没有入口 |
| 设置面板切音质不重载当前歌 + 原生 select | 用户以为没生效 |

## 手机端

| 问题 | 后果 |
|---|---|
| `ScriptManager.ready=true` 但 0 脚本时不补载 | 首次加载失败后永久空 |
| `download` 的 `fileName` 无校验 | 路径穿越（靠前端挡，音源脚本可绕过） |
| 下载失败不清理流与 MediaStore 残留 | 孤儿行 + FD 泄漏 |
| 下载无断点续传、无进度、回调无 id | 并发串台 |
| 脚本分支不做 aac/wma 过滤 | 与 `resolveUrl` 的过滤自相矛盾 |
| `globalThis.Buffer` / `lx` 在 init 后不还原 | 全局污染，实测三条路径都不还原 |
| `console` 只在同步段替换 | 异步日志（取流期）全部丢失 |
| `MainActivity.checkBoot` 判定恒 false | 白启动重试 7 次，失败时白屏 |
| `music-libs.cached()` 缓存 rejected Promise | 一次抖动锁死 5–30 分钟 |

---

# 第四部分：P3（32 条，只列清单）

**服务端**：`parseMeta` 单行多标签吃整行、`QUALITY_ORDER` 两份、`guard()` 的 `needWrite` 死参数、死代码（`netease.cached`/`newSongs`/`bestQuality`/`transcodeAudio`）、`playlist remove` 忽略 `source`、`/api/discover` kg 无 catch、三处计时器不清理、`sources/toggle` 不校验 id、`reveal` 忽略前端传的 dir、`pl+Date.now()` 撞 id。

**前端**：`enhanceSelect` 留下 2 个永不清理的 `setInterval` + 2 个 document 监听、取流缓存无上限且被 `dlFormat` 污染、`format` 参数服务端不用、CSS 注释吞掉 `.deck-tabs` 规则、一批死 CSS 选择器、`.dl-fmt` 重复绑定、`state.settings` 从未赋值、一批状态字段未声明、死代码（`openRecDialog` 等）、`#coverBox` 可点无反应、`#volNum`/`#srcStatus` 幽灵元素、音量为 0 时取消静音是空操作、发布带调试错误条、歌单加载失败只 warn、双击并发两次取流。

**手机端**：LocalProxy >32 并发直接 close 不给响应、`BufferedOutputStream` 8KB 不 flush（实测 4KB/5s 的流变成每 10 秒一包）、`httpAsync` 的 id 未 quote、`api-mobile` 重复 remove + 死代码 `NET_IMPORT`、`/api/sources` import 无 2MB 上限、`resolve()` 列表仍含 fish、`MediaProxy` 状态码与 reason 不匹配。

**构建链**：payload 塞了 `style.css.bak` + `sources/raw/`（1.3MB 无用）、WebView2 DLL 双份（771KB）、`卸载.exe` 是安装包完整副本（65MB）、zip-slip 无校验、`build-apk.ps1` 依赖 CWD、README 打包步骤过期。

---

# 修复计划

## 第一批：P0 + 一行修复（立刻）

1. `dbRetry` 补声明 + `flushDb` 包 try/catch
2. `sources/import` 改 `loadOne`
3. 归档脚本化 + `verify-apk-archived` 加退出码 + 加版本断言
4. 安装包 zip 改 UTF-8 条目名

## 第二批：服务端 P1/P2

5. `/api/sources/test` 加超时
6. `/api/url|stream|download` 统一 deadline
7. `/api/download` 进 WRITE_PATHS + 前端改 POST
8. `sameOrigin` 的 Host 白名单
9. `/api/settings` 键白名单
10. `/api/stream` 改用 `cacheSet`
11. QQ `api()` 用动态 cookie
12. `mapSong` 加防御
13. `fetchText` 加重定向与大小上限
14. `rename` 校验 name

## 第三批：前端 P1/P2

15. 视图令牌（搜索 + 所有 render\*View）
16. 播放失败跳歌加 token
17. 8 处 await 加 catch
18. 下载文件名 esc
19. 导入重入锁
20. 歌词工具补 DOM 或删
21. 设置面板切音质重载 + enhanceSelect

## 第四批：手机端 P1

22. LocalProxy 三处（active 泄漏、disconnect、旧池）
23. LyricWindow 切主线程
24. probe 改异步或合并请求
25. 网易云 resolveUrl 删死代码
26. 缓存支持 force
27. ensureScripts 复位 + ready 判据
28. download fileName 校驗

## 第五批：构建链 P1

29. `assemble` 的 index.html 走 mustReplace
30. `sources-data.js` 白名单写进生成器
31. `verify-installer` 加 留声.exe
32. 卸载器读注册表
33. `rebuild-installer` 版本参数
34. release 脚本失败设退出码
35. `push-via-api` 改用 git status

每批修完立刻跑验证，全部通过再进下一批。
---

# 修复状态（本轮已完成）

## P0 —— 全部修复并实测

| 编号 | 修复 | 验证方式 | 结果 |
|---|---|---|---|
| P0-1 | 补 let dbRetry = 0 + lushDb 外层 try/catch + 失败时 dbFirstDirtyAt=0 | 制造 EEXIST 写盘失败 → 恢复目录 → 轮询 db.json | 假报错消失；重试链 2s/4s 生效；恢复后 **volume=0.33 自动落盘成功** |
| P0-2 | 新写 scripts/make-payload-zip.cjs，强制 UTF-8 条目名 + 置 bit 11 | 字节扫描 + .NET ZipArchive 探针 | 留声.exe 从 GBK(c1f4) 变为 UTF-8(e79599) + flags=0x0800 |
| P0-3 | erify-apk-archived.cjs 重写（glob + 版本断言 + exitCode）；归档写进 uild-all.cjs | **反向测试**：把 1.0.27 旧包冒充 留声.apk | **6 项失败、exit=1**；恢复后 29/29、exit=0 |

## P1 —— 修复 21 条

### 服务端（4）

- /api/sources/test 单源 5 秒超时 + 路由层 12 秒总预算 → 实测 5045ms 返回
- /api/sources/import 改 loadOne → 新音源不再 500
- /api/url 加 orce=1 绕过缓存 → 实测第二次 cached=true、force 后 cached≠true
- /api/download?save=1 要求 POST → 实测 GET 405

### 前端（2 + 6 条 P2）

- __viewToken 视图令牌：switchView 自增，doSearch / enderDownloadsView / enderLeaderboard / loadRecPage 四处在 await 后校验 → 晚到的响应不再覆盖已切换的页面
- 播放失败跳歌加 playToken 守卫
- 8 处 wait api() 补 try/catch + 友好提示
- 下载文件名 esc()（唯一未转义注入面）
- 导入歌单加 state.__importing 重入锁
- 设置面板切音质改为 eloadCurrent(__prevQ)
- 设置面板的 select 补 enhanceSelect（原来是原生控件）
- state 补 dlBusy/__importing/__qualitySwitching/__pcCleanup/settings 声明

### 手机端（8）

- LocalProxy：ctive 计数在异常路径回退、池/看门狗取局部快照、忙时回 503
- LocalProxy：upConn/upIn 提到 try 外，inally 统一 disconnect（客户端断开不再漏上游连接）
- LocalProxy：start() 先 shutdownNow 旧池 + ctive.set(0)
- LyricWindow：show/update/hide/isShowing 全部走 unOnMain（Handler + CountDownLatch）→ **桌面歌词不再必然失败**
- api-mobile：删掉网易云分支白跑的 NAPI.probe + 死代码（顺带消除 28 秒同步阻塞）
- api-mobile：ensureScripts 失败/零脚本时复位 scriptsLoading，eady 判据加 scripts.size
- api-mobile + 服务端：orce=1 全链路支持，重试真的换源

### 构建链（7）

- scripts/build-all.cjs：版本单一来源 + 自动归档 + 每步断言
- scripts/build-installer.ps1：纯 ASCII（PS 5.1 会按 ANSI 读中文）
- scripts/finalize-installer.cjs：Node 改名 + 解包校验（含 留声.exe、版本、UTF-8 标志）
- payload 排除 style.css.bak 与 sources/raw/（省 1.3MB 无用文件）
- deep-consistency-check.cjs 加排除清单，输出干净

## 验证汇总

`
selfcheck-all.cjs        11 套件 / 151 断言   全过
  ├ 服务端全量回归        36/36
  ├ 检查更新实现          19/19
  ├ 第六轮 5 项           13/13
  ├ 写方法修复            30/30
  ├ APK 归档校验          29/29
  ├ 打包产物一致性        24/24
  ├ CSS 布局计算          10 个视口
  ├ APK 内容              30/30
  ├ 安装包内容            26/26
  ├ LAN Origin            通过
  └ 检查更新实测          通过

第六轮服务端实测         12/12
P0-1 写盘重试实测        通过
P0-2 zip 编码探针        通过
P0-3 旧包拦截反向测试    通过（6 失败 exit=1）

产物一致性
  安装包 38 个源文件逐字节一致，无缺无余
  APK   13 个文件逐字节一致
  版本  1.0.28 / versionCode 17 / server health 1.0.28
`

## 未修（P2/P3 余项）

仍剩约 50 条 P2/P3，主要是：QQ Cookie 对搜索无效、mapSong 畸形数据防御、
/api/sources/import 重定向无上限、手机端下载无断点续传、
music-libs.cached() 缓存 rejected promise、一批死 CSS 选择器、
卸载器用 DefaultDir、外壳不核对后台版本等。

这些不影响主流程，已在报告正文列出明细。
