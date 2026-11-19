# 真机自测报告

> 2026-11-19 19:07 ~ 19:17
> 设备：MuMu 模拟器 `127.0.0.1:16384`，Android 15，1080x1920
> **全程 `volume_music = 0`**（每次操作前复查）

## 一、测试环境

```
adb devices
  127.0.0.1:16384  device
  127.0.0.1:5555   device
  127.0.0.1:7555   device

设备：Android 15 / V2284A / 1080x1920
音量：settings get system volume_music → 0（全程）
```

## 二、真机发现 4 个 bug（源码审查没抓到）

### 1. 手机端粘贴裸 `gcid_xxx` 提示「无法识别」

- **现象**：输入框里写 `gcid_3znx57dpz2tz0b7` → 红字「导入失败：无法识别这个歌单链接，支持网易云 / QQ音乐 / 酷狗」
- **原因**：P2-7 只给电脑端 `playlist-import.js` 的 `detect()` 加了裸 gcid 分支，**手机端 `parsePlaylistUrl` 没加**
- **修复**：手机端最前面加
  ```js
  if (/^gcid_[a-z0-9]{8,}$/i.test(u)) return { platform: 'kg', id: u }
  if (/^[a-z0-9]{14,}$/i.test(u) && /[a-z]/i.test(u)) return { platform: 'kg', id: u }
  if (/^\d{4,}$/.test(u)) return { platform: 'wy', id: u }
  ```
- **单测 7 个用例全过**（含大写 `GCID_`、数字 specialid、网易云 id、QQ 链接）

### 2. 手机端歌名还是被 `remark` 覆盖

- **现象**：导入后列表显示「不再普普通通」「自由奔跑」「美和节奏」「**《我是证人》电影主题曲**」
- **原因**：P1-3 只改了电脑端 `kugou-gcid.js`，手机端 `__kgMapSong` 还是 `if (remark && remark !== songName) songName = remark`
- **修复**：手机端同样改成别名机制
- **修复后**：`Normal No More (Explicit)` / `Run Free (Original Mix)` / `Beauty And A Beat` / **`勋章`** 全部恢复原名

### 3. 顶部红条显示音源脚本噪音

- **现象**：导入成功后顶部有红条「页面错误(1): promise: failed」
- **原因**：`lx-source-freelisten.js:577` 自己 `throw new Error('failed')`，被 `unhandledrejection` 捕获。`index.html` 的 `__NOISE__` 正则只匹配 message，而 message 就是 `failed`，看不出是音源脚本抛的
- **修复**：`unhandledrejection` 里同时检查 `reason.stack`
  ```js
  var stack = (r && r.stack) ? String(r.stack) : ''
  if (/lx-source-[\w-]+\.js/.test(stack)) return
  if (/^promise:\s*(failed|error|undefined|null|aborted)?$/i.test(msg.trim())) return
  ```
- **修复后**：红条消失

### 4. 重复导入产生两个同名歌单

- **现象**：侧栏出现两条「1111  45」
- **原因**：我测试时导入了两次，代码没有去重
- **状态**：**未修**。不是 bug（用户重复点导入就该有两条），但可以考虑同名覆盖

## 三、真机验证通过的功能

### 启动

```
I Phonograph: [留声] 手机端数据层已加载 @api-mobile.js:980
I Phonograph: [音源] 候选 6 个，选用 6 个： dujia6,kxh,yuxi,changqing2,freelisten,fish
I Phonograph: [音源] 已加载 freelisten → kw,kg,tx,wy,mg 4ms
I Phonograph: [音源] 已加载 changqing2 → kg,tx,wy,kw 290ms
I Phonograph: [音源] 已加载 dujia6 → kw,kg,tx,wy,mg,local 118ms
I Phonograph: [音源] 已加载 kxh → wy,tx,kw,kg,mg 4ms
I Phonograph: [音源] 已加载 yuxi → kg,tx,wy,kw,mg 17ms
I Phonograph: [音源] 已加载 fish → kw,wy,kg,tx,mg 34ms
I Phonograph: [音源] 加载完成，可用 6 个 / 共 6 个
I Phonograph: [留声] 音源预热完成 6
```

### 界面

- 顶栏：留声 PHONOGRAPH / 主页 / 搜索 / 网易云音乐 / 较高 320K / 音源 / 设置
- 侧栏：我的歌单 / 推荐歌单 / 排行榜 / 最近播放 / 下载管理
- 主区：歌单列表 / 黑胶唱片 / NOW SPINNING / 底栏播放控制
- **全部渲染正常，无错位**

### 排行榜

- 热歌榜 50 首
- 歌名、歌手、时长、封面全部正确
- 切榜（热歌榜/新歌榜/飙升榜/原创榜）按钮正常

### 播放

| 操作 | 结果 |
| --- | --- |
| 点「冬天又来啦 - 罗言」 | ✅ 播放，00:11 / 02:49 |
| 切下一首 | ✅ 切到「海屿你 - 马也_Crabbit」，00:09 / 04:55 |
| 点「勋章 - 鹿晗」（酷狗源） | ✅ 播放，00:13 / 03:33 |
| 黑胶唱片旋转 | ✅ |
| 封面显示 | ✅ |
| 进度条推进 | ✅ |
| ANR / FATAL | ✅ 无 |

### 酷狗歌单导入（修复后）

- 输入 `gcid_3znx57dpz2tz0b7`
- 结果：**1111 / 45 首**
- 歌名：原名（`Normal No More (Explicit)`、`勋章`、`虚拟`、`天外来物`……）
- 歌手：正确（TYSM、鹿晗、陈粒、薛之谦……）
- 时长：正确（3:19、2:29、2:51、3:47、3:34、2:32、4:01、4:17）
- 封面：正确

## 四、服务端回归（`regress-all.cjs`）

**36/36 全过**，含：

```
✓ SSRF 拦截本机 403
✓ Origin:null 拒绝
✓ 恶意 Origin 拒绝
✓ LAN Origin 放行 (10.30.145.106)
✓ text/plain 写接口拦截 415
✓ GET download-dir 可读 1ms
✓ 取流第 2 次（缓存）0ms
✓ 缓存结构正确（无嵌套 value）
✓ Range 请求 206
✓ 并发去重 1 个 URL
✓ discover 空参数回落默认值
✓ javac 编译通过
```

## 五、构建产物

```
APK 内容         30/30
安装包内容        26/26
APK 内 app.js    与 mobile/www 一致（104632B）
APK 内 api-mobile.js  与 www 一致
```

## 六、累计修复统计

| 轮次 | 修复项 | 引入的 P0 |
| --- | --- | --- |
| 第一轮（BUG-REPORT-2） | 46 | 2（download-dir 405、flushDb 崩进程） |
| 第二轮（回归修复） | 17 | 2（`$` 当 `$$`、缓存双层） |
| 第三轮（雪耻） | 8 | 1（Origin:null） |
| 第四轮（audit4） | 27 | 0 |
| **真机自测** | **3** | **0** |

真机这轮找到的 3 个都是「电脑端修了、手机端忘了同步」的类型 —— 源码审查看不出来，必须跑起来点。

## 七、待办

1. 重复导入同名歌单是否要覆盖（当前会产生两条）
2. 桌面歌词在真机上的表现（需要悬浮窗权限，模拟器可能不给）
3. 长时间播放的内存占用（没跑压力测试）
4. 弱网下的表现（模拟器网络太好）
