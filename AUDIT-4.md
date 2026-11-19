# 留声 1.0.21 — 第四轮自检报告

审查方式：3 个独立审查员 + 自检脚本，所有结论经实测复现。

## P0（2 项，都是本轮引入的回归）

### P0-1 缓存写入多包一层 → 同一首歌播第二次失败

```
cacheSet(urlCache, cacheKey, { value: payload, exp: ... }, 5*60e3, 300)
                              ^^^^^^^^^^^^^^^^^^^^^^^ 多余
cacheSet 自己会包 { value, exp } → 存成 { value: {value,exp}, exp }
```

实测：
```
1st /api/url → {"id":...,"url":"http://fs...mp3"}
2nd /api/url → {"cached":true,"value":{...},"exp":...}   ← 没有 url
/api/stream  → HTTP 502
```

修法：`cacheSet(urlCache, cacheKey, payload, 5*60e3, 300)`

修复后：`第 1 次 226ms / 第 2 次 3ms 都有 url；stream 两次都 200`

### P0-2 Origin:null 放行 + 写接口不校验 Content-Type → 任意网页可写本地接口

沙箱 iframe 的 Origin 就是 `null`，任意网页都能造出来。配合 `text/plain`（CORS 简单请求，不发预检）：

```
POST /api/settings   Origin: null + text/plain + {...} → HTTP 200（生效）
POST /api/sources/import Origin: null + text/plain     → HTTP 400「缺少脚本内容」
    （400 而不是 403，说明已越过守卫，只差一个 url 参数就是 RCE）
```

修法：
- `if (o === 'null') return false`
- 写接口强制 `application/json`（跨站发 JSON 必须过预检，预检会失败）

修复后：`Origin:null → 403`，`text/plain POST → 403`

## P1（4 项）

### P1-1 备用接口只能顶一页 → 800 首歌单只导入 300 首

`usedAlt` 是一次性开关，第 2 页仍先打 `song_v2`，失败就 `break`。

实测：`S3 song_v2 第1页限流 → 300 首；S4 第2页限流 → 600 首（total=800）`

修法：把「用哪个接口」做成 `backend` 状态机，成功的接口后续页直接复用。

### P1-2 total/truncated 被丢掉，前端以为导全了

`fetchGcidPlaylist` 认真算了 `truncated`，但 `fromKugou` 只返回 `{name, cover, songs}`。

修法：透传 `total` / `truncated`。

### P1-3 remark 覆盖歌名 → 《勋章》变成「《我是证人》电影主题曲」

`remark` 不是「中文名」，是任意备注：
```
TYSM - Normal More (Explicit)        → 不再普普通通
鹿晗 - 勋章                          → 《我是证人》电影主题曲   ← 歌名没了
```

修法：原名保留，备注进 `alias`。

### P1-4 LocalProxy 重启竞态（实测 190/200 次命中）

`stop() → start()` 后旧 accept 线程对着新 socket 继续 accept，退出时 `finally { acceptorAlive=false; port=0 }` 把新代理状态抹掉 → `proxyUrl()` 返回空 → 静默直连 → 防盗链 403。

**这就是「点了不播放」的根源。**

修法：加代际标记 `gen`，acceptor 只在自己那代有效时才清状态。

## P2（12 项）

| 项 | 问题 | 修法 |
|---|---|---|
| P2-4 | `d += chunk` 跨 TCP 分片的中文变 U+FFFD | `Buffer.concat` 后整体解码 |
| P2-5 | 歌单封面 `{size}` 没替换 → 404 破图 | `replace('{size}', '400')` |
| P2-11 | 无条件 `rejectUnauthorized: false` | 改按需 `opts.insecure` |
| P2-12 | `list.length < pageSize` 误判结束 | 改「本页有无新增」判 |
| P2-7 | 裸 `gcid_xxx` 粘贴识别不了 | `detect()` 加裸 gcid 分支 |
| M2 | 手机端 gcid 没限流重试 + 写死 clienttime | 换 mid 退避重试 3 次 |
| M3 | 手机端丢 truncated | 透传 |
| M4/M15 | gcid 大小写 / 纯数字误判 | 统一处理 |
| M6 | `lyricShow` 返回值没人消费 | 加失败提示 |
| M8 | md5 计算异常报成「缺库」 | 区分 |

## P3

- 431 响应没有 reason phrase
- `decodeInfo.title` 恒 undefined（兜底是死代码）
- `flushDb` 失败后永久 3 秒重试无退避
- `WRITE_PATHS` 漏 `/api/download`（`save=1` 会落盘）
- `isPrivateHost` 对 `127.1`/`0x7f.0.0.1`/`2130706433` 判错（有白名单兜底）

## 验证

| 项 | 结果 |
|---|---|
| Java 编译 | ✓ |
| JS 语法（15 文件） | ✓ |
| APK 内容 | 30/30 |
| 安装包内容 | 26/26 |
| 同一首歌二次播放 | 226ms → 3ms ✓ |
| /api/stream 二次 | 200 / 200 ✓ |
| Origin:null | 403 ✓ |
| gcid 全量 | 45 首 ✓ |
