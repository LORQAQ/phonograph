'use strict'
/* 歌词页最终样式：颜色 + 布局一次到位（横竖屏都成立） */
const fs = require('node:fs')
let s = fs.readFileSync('public/style.css', 'utf8')

/* 移除历史追加的歌词样式块，避免互相覆盖 */
s = s.replace(/\/\* ===== 歌词页底部布局（最终版） ===== \*\/[\s\S]*$/, '')
s = s.replace(/\/\* ===== 全屏歌词页对比度修正 ===== \*\/[\s\S]*?(?=\.lyric-layer \.lyric-line span)/, '')
s = s.replace(/\/\* 关闭按钮（唯一有效定义） \*\/[\s\S]*?(?=\/\* =====|$)/, '')

const final = `
/* ================= 歌词页（统一版） ================= */
.lyric-layer{
  position:fixed;inset:0;z-index:110;display:none;
  background:#0d0b09;
}
.lyric-layer.show{display:block}
.lyric-layer::before{
  content:"";position:absolute;inset:0;z-index:0;pointer-events:none;
  background:radial-gradient(120% 90% at 50% 40%,rgba(12,10,8,.55),rgba(6,5,4,.9));
}
.lyric-layer .lyric-bg{position:absolute;inset:0;z-index:0;opacity:.18 !important;filter:blur(18px) !important}
.lyric-layer>*{position:relative;z-index:1}

/* 主体 */
.lyric-layer .lyric-panel{
  position:absolute;inset:0;z-index:2;
  display:flex;align-items:center;justify-content:center;gap:48px;
  padding:60px 56px 150px;box-sizing:border-box;overflow-y:auto;
}
.lyric-layer .lyric-head{flex:0 0 auto;max-width:320px;text-align:left}
.lyric-layer .lyric-head .disc{width:180px;height:180px;margin-bottom:18px}
.lyric-layer #lyricName{
  color:#ffffff !important;font-size:22px;font-weight:700;line-height:1.35;
  text-shadow:0 2px 12px rgba(0,0,0,.8);margin:0 0 8px;
}
.lyric-layer #lyricSinger{
  color:rgba(255,255,255,.72) !important;font-size:13.5px;
  text-shadow:0 1px 6px rgba(0,0,0,.7);
}
.lyric-layer .lyric-scroll{flex:1 1 auto;max-width:620px;max-height:100%;overflow-y:auto}
.lyric-layer .lyric-inner{padding:8px 0}
.lyric-layer .lyric-line{
  font-family:var(--serif);font-size:17px;line-height:2.15;
  color:rgba(255,255,255,.62) !important;
  text-shadow:0 1px 4px rgba(0,0,0,.65);
  padding:3px 10px;cursor:pointer;transition:.16s;
}
.lyric-layer .lyric-line:hover{color:rgba(255,255,255,.9) !important}
.lyric-layer .lyric-line.active{
  color:var(--accent) !important;font-size:20px;font-weight:700;
  text-shadow:0 2px 14px rgba(0,0,0,.85);
}
.lyric-layer .lyric-empty{color:rgba(255,255,255,.55) !important;font-size:13px;text-align:center;padding:24px 0}

/* 播放控制（底部居中） */
.lyric-layer .lyric-ctrl{
  position:absolute;left:50%;transform:translateX(-50%);bottom:64px;z-index:6;
  display:flex;align-items:center;gap:26px;
}
.lyric-layer .lyric-ctrl button{
  width:46px;height:46px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.24);
  color:#fff;cursor:pointer;transition:.15s;
}
.lyric-layer .lyric-ctrl button svg{width:19px;height:19px;fill:currentColor}
.lyric-layer .lyric-ctrl button:hover{background:rgba(255,255,255,.24)}
.lyric-layer .lyric-ctrl button.main{width:62px;height:62px;background:var(--accent);border-color:var(--accent)}
.lyric-layer .lyric-ctrl button.main svg{width:25px;height:25px}

/* 工具条（控制条下方） */
.lyric-layer .lyric-tools{
  position:absolute;left:50%;transform:translateX(-50%);bottom:18px;z-index:6;
  display:flex;align-items:center;gap:8px;white-space:nowrap;
}
.lyric-layer .lyric-tools *{color:rgba(255,255,255,.78) !important}
.lyric-layer .lyric-tools .btn-ghost{
  background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.22);
  border-radius:4px;padding:5px 10px;font-size:12.5px;cursor:pointer;
}

/* 关闭按钮（左上角，避开系统悬浮球） */
.lyric-layer .close-lyric{
  position:absolute;top:16px;left:16px;z-index:20;
  width:42px;height:42px;display:flex;align-items:center;justify-content:center;
  font-size:20px;line-height:1;color:#fff;cursor:pointer;
  border-radius:50%;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.26);
}
.lyric-layer .close-lyric:hover{background:rgba(255,255,255,.24)}

/* 竖屏手机：单列、封面小、歌词占满 */
@media (max-width:860px){
  .lyric-layer .lyric-panel{
    flex-direction:column;align-items:stretch;justify-content:flex-start;
    gap:14px;padding:64px 20px 156px;
  }
  .lyric-layer .lyric-head{max-width:100%;display:flex;flex-direction:column;align-items:flex-start}
  .lyric-layer .lyric-head .disc{width:88px;height:88px;margin-bottom:12px}
  .lyric-layer #lyricName{font-size:18px;margin:0 0 4px}
  .lyric-layer #lyricSinger{font-size:12.5px}
  .lyric-layer .lyric-scroll{max-width:100%;width:100%;flex:1 1 auto}
  .lyric-layer .lyric-line{font-size:16px;line-height:2.05;padding:2px 4px}
  .lyric-layer .lyric-line.active{font-size:18px}
  .lyric-layer .lyric-ctrl{bottom:72px;gap:22px}
  .lyric-layer .lyric-ctrl button{width:44px;height:44px}
  .lyric-layer .lyric-ctrl button.main{width:58px;height:58px}
  .lyric-layer .lyric-tools{bottom:16px;gap:6px}
  .lyric-layer .lyric-tools .btn-ghost{padding:5px 8px;font-size:12px}
  .lyric-layer .close-lyric{top:10px;left:10px;width:38px;height:38px;font-size:18px}
}
`
s += final
fs.writeFileSync('public/style.css', s, 'utf8')
console.log('统一歌词样式已写入:', s.includes('歌词页（统一版）'))
