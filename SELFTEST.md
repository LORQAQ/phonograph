# 自测报告（源码级实测）

> 执行时间：2026-11-19 19:00 ~ 19:10
> 环境：`runtime\node.exe` v24.21.0 + 真实服务端口 37621 + 假 DOM + javac 17

## 一、服务端全量回归（`scripts/regress-all.cjs`）

**36 项，全过。**

### 【0】服务存活

```
✓ health 200  5ms
```

### 【1】安全（9 项）

| 项 | 结果 |
| --- | --- |
| SSRF 拦截本机（`?url=http://127.0.0.1:37621/api/db`） | ✓ 403 |
| `Origin: null` 拒绝 | ✓ 403 |
| 恶意 Origin 拒绝 | ✓ 403 |
| 本机 Origin 放行 | ✓ 200 |
| LAN Origin 放行（10.30.145.106） | ✓ 200 |
| `text/plain` 写接口拦截 | ✓ 415 |
| `downloads/remove` 强制 POST | ✓ 405 |
| Cookie 脱敏 | ✓ 无明文 |
| `qqCookieSet` 字段存在 | ✓ |

### 【2】下载目录（P0 回归点）

```
✓ GET download-dir 可读  1ms
✓ GET ?set= 拒绝  405
```

### 【3】缓存一致性（P0 回归点）

```
✓ 榜单可用  50 首
✓ 取流第 1 次  227ms
✓ 取流第 2 次（缓存）  0ms
✓ 缓存结构正确（无嵌套 value）
✓ stream 第 1 次  200 86800B 33ms
✓ stream 第 2 次  200 67200B 28ms
✓ Range 请求 206  1000B bytes 1000-1999/2711085
✓ 并发去重  1 个 URL 134ms
```

**关键**：`取流第 2 次 0ms` + `无嵌套 value` 证明 P0-1（缓存双层包装）已修好。

### 【4】参数校验

```
✓ discover 空参数回落默认值
✓ discover 非法参数不返回 null
✓ 畸形路径 400
✓ 畸形 URL 400
```

### 【5】歌单

```
✓ 歌单列表
✓ playlist GET preview 不被 405  500
```

（500 是因为 `url=test` 不是有效链接，符合预期）

### 【6】构建产物一致性

```
✓ assemble 补丁已应用  www 104632B / public 104575B
✓ www 含全部前端修复
✓ APK 内 app.js 与 www 一致  104632B
✓ APK 内 api-mobile.js 与 www 一致
```

### 【7】源码静态检查

```
✓ 服务端 关键代码齐全
✓ gcid 关键代码齐全
✓ 前端 关键代码齐全
✓ 手机端 关键代码齐全
✓ 无 $ 当 $$ 误用
```

### 【8】Java 编译

```
✓ javac 编译通过
```

---

## 二、前端逻辑实测（`scripts/regress-frontend2.cjs`）

在假 DOM 里真正加载 `public/app.js` 并调用函数，不是只看文件里有没有那行字。

### 加载

```
✓ 加载无异常
```

### 关键函数（14 个）

```
✓ renderSettingsPane  ✓ renderNowPlaying  ✓ reloadCurrent  ✓ startSong
✓ doSearch  ✓ paintProgress  ✓ setSrc  ✓ updatePlayButton
✓ renderDownloadsView  ✓ saveQueue  ✓ setThemeMode  ✓ setSleep
✓ esc  ✓ streamSrc
```

### state

```
✓ state 存在
✓ lastGoodQuality = ""     ← 已初始化（之前是 undefined，回退会失效）
ℹ state.view = "playlist"
```

### renderSettingsPane 绑定（P0 回归点）

这是上一轮 `$` 当 `$$` 导致的崩溃点，**现在全部绑定成功**：

```
✓ 执行无异常
✓ .dl-fmt 绑定 3/3
✓ [data-mode] 绑定 3/3
✓ [data-sleep] 绑定 3/3
✓ #setDesktop 绑定
✓ #btnResetData 绑定
✓ #setQuality onchange 绑定
```

### renderNowPlaying(null)（B87 回归点）

```
✓ 执行无异常
✓ #npName = 未在播放
```

### 其他

```
✓ esc 转义  '<b>x</b>' → '&lt;b&gt;x&lt;/b&gt;'
✓ streamSrc 有 forceFresh
```

---

## 三、没测到的部分

### 1. 模拟器真机测试

`adb` 起不来是因为 `%TEMP%\adb.log` 权限被拒，换 `TMP` 后 daemon 起来了，但：

```
$ adb devices
List of devices attached
（空）

$ adb connect 127.0.0.1:7555
cannot connect to 127.0.0.1:7555: 由于目标计算机积极拒绝 (10061)

$ Get-Process | ? ProcessName -match "MuMu|Nemu|emulator"
MuMuRemoteBackend
MumuRemoteHealthd
MuMuRemoteService
```

只有 MuMu 的 Remote 服务进程，模拟器实例本身没启动，adb 端口没开。

**所以以下没在真机验证**：
- LocalProxy 的代际标记（P1-4）实际效果
- `lyricShow` 返回 boolean 后前端消费（M6）
- 下载回调 id（M7，未修）
- 酷狗 gcid 在 WebView 里的实际表现

### 2. 浏览器真实渲染

假 DOM 能验证「函数执行、事件绑定、状态变更」，但验证不了：
- CSS 布局（B68/B69/B71/B72 的视觉修复）
- 歌词滚动的实际跟随（B11/B60）
- 进度条热区的点击体验（B72）

### 3. 酷狗 gcid 端到端

刚才测太多次被限流了（`err_code=20028`），本轮没重测。上一轮实测记录：

```
gcid_3znx57dpz2tz0b7 → 45 首（427ms，歌手时长封面都对）
gcid_3z15afruoz7z035 → 553 首
```

---

## 四、测试脚本本身的问题（记录一下）

这一轮我写的测试脚本自己有 3 个 bug，导致前两次跑出假失败：

**1. 断言基准错了**

```js
// 我写的
wwwApp === pubApp ? ok(...) : bad('app.js 同步', '不一致')

// 实际：mobile/www/app.js 是 assemble 的产物，本来就不同
// public/app.js 没有 if (window.__MOBILE__) return，www 里有
```

改成对比 APK 内文件 vs `mobile/www/app.js` 才正确。

**2. 假 DOM 缺元素**

第一次缺 `#platformSelect` 导致 `boot()` 在 L371 断掉；第二次补了 `index.html` 的 id，但漏了 `app.js` 内联模板里的 id（`#setQuality` / `#setCoverTheme` 等是 `renderSettingsPane` 动态生成的）。

**3. 缺 `window.addEventListener`**

`sandbox.window = sandbox`，但 sandbox 本身没有 `addEventListener`，`bindProgress` 调用时炸了。

这三条都属于「测试环境没搭对」，不是产品 bug。但值得记下来 —— **测试脚本写错产生的假失败，和真 bug 一样消耗时间**。

---

## 五、结论

| 层面 | 验证方式 | 结果 |
| --- | --- | --- |
| 服务端 API | 真实服务实测 36 项 | ✅ 全过 |
| 前端函数存在性 | 假 DOM 加载 app.js | ✅ 14/14 |
| 前端事件绑定 | 假 DOM 调用 renderSettingsPane | ✅ 6/6 |
| 前端状态初始化 | 假 DOM 读 state | ✅ lastGoodQuality 已初始化 |
| 构建产物一致性 | 解包 APK 对比字节 | ✅ 一致 |
| Java 编译 | javac 17 | ✅ 通过 |
| 真机运行 | adb + 模拟器 | ❌ 模拟器没启动 |
| 浏览器视觉 | 需要真浏览器 | ❌ 未测 |
| 酷狗 gcid | 被限流 | ⏸ 上轮 45/553 首通过 |
