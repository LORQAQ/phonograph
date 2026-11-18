# 留声 Phonograph

一个类落雪音乐（LX Music）的本地音乐播放器，支持网易云 / QQ音乐 / 酷狗三平台搜索播放与下载。

## 两个版本

| 平台 | 说明 |
| --- | --- |
| Windows | WinForms + WebView2 外壳，本地 Node 服务 |
| Android | WebView + 原生 HTTP 桥，纯前端音源引擎 |

## 功能

- 三平台搜索（网易云 / QQ音乐 / 酷狗）
- 推荐歌单 / 排行榜
- 歌单导入（链接直接粘贴）
- 播放 / 下载（MP3 320K / FLAC 无损）
- 下载管理（列表 / 删除 / 定位）
- 歌词（滚动跟随、当前行高亮放大、点击跳转）
- 桌面歌词独立窗口
- 主题（亮色 / 暖白 / 暗色）

## 目录结构

```
app/                电脑端服务端（Node）
  server.js         主服务，21 个 API 路由
  lib/              音源调度 / 转码 / 平台适配
public/             电脑端前端
mobile/www/         手机端前端
sources/            音源脚本（LX Music 协议）
scripts/            构建与诊断脚本
runtime/            Node 与 ffmpeg（不入库）
apk-build/          Android 工程
```

## 技术要点

### 音源协议

兼容 LX Music 的 `globalThis.lx` 协议：

```js
lx.on(EVENT_NAMES.request, ({ source, action, info }) => { ... })
```

电脑端用 Node 的 `vm` 执行，手机端用 `new Function` + IIFE 隔离。

### 取流策略

1. **`fish` 优先**：实测它是唯一能给完整版的音源，重试 3 次（不同音质档）
2. **并行竞速**：其余音源并发试探，谁先给出可用地址用谁
3. **外链过滤**：`music.163.com/song/media/outer/url` 是 302 占位，播放必失败，直接判无效
4. **残缺检测**：拿到时长明显短于原曲（<85%）时自动切换平台重取

### 音源加载（手机端）

6 个音源按体积排序，小的先并发，`fish`（625KB）单独最后加载，每个都有 7 秒硬超时，避免单个卡死拖垮整批。

## 构建

### 电脑端

```bash
# 编译外壳
csc /target:winexe /out:留声.exe /win32icon:LXMusic.ico \
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll \
    /r:Microsoft.Web.WebView2.Core.dll /r:Microsoft.Web.WebView2.WinForms.dll \
    scripts/NativeShell.cs

# 打包安装程序（内嵌 payload.zip）
tar -a -c -f build/payload.zip -C build/payload .
csc /target:winexe /out:留声-1.0.1-安装包.exe /win32icon:LXMusic.ico \
    /r:System.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll \
    /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll \
    /resource:build/payload.zip,payload.zip scripts/Installer.cs
```

### 手机端

```bash
node scripts/assemble-mobile-www.js
cd apk-build && powershell -File build-apk.ps1
```

## 依赖

- Node.js 18+（运行时已内置）
- ffmpeg（转码用，已内置）
- Windows 10/11 + WebView2 Runtime
- Android 7.0+

## 已知限制

- QQ 歌单需要登录 Cookie（设置页可填）
- 部分 VIP 歌曲音源无法提供完整版
- 手机端不支持 QQ 音乐直接下载

## 免责声明

本项目仅供学习与技术研究，音乐版权归各平台及版权方所有。请勿用于商业用途。
