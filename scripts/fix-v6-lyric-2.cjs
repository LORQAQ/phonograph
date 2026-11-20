'use strict'
/**
 * M5 第二步：把 show / update / hide / isShowing 的 UI 操作包进 runOnMain
 * 做法：把原方法体改名成 *Inner（纯 UI 操作），外层方法负责切线程。
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const p = '../apk-build/app/src/com/phonograph/player/LyricWindow.java'
let s = fs.readFileSync(p, 'utf8')

/* ---------- show ---------- */
const showOld = `    boolean show (String text, String nextText) {`
if (s.includes(showOld) && !s.includes('showInner')) {
  s = s.replace(showOld, () => `    boolean show (final String text, final String nextText) {
        /* M5: 切到主线程。桥线程没有 Looper，addView 会抛
           "The current thread must have a looper!" 并被下面吞掉，
           导致 show() 恒返回 false —— 桌面歌词 100% 打不开。 */
        final boolean[] ret = { false };
        runOnMain(new Runnable() {
            @Override
            public void run () { ret[0] = showInner(text, nextText); }
        }, 3000);
        return ret[0];
    }

    private boolean showInner (String text, String nextText) {`)
  console.log('✓ show 切主线程')
}

/* ---------- update ---------- */
const upOld = `    void update(String text, String nextText) {`
if (s.includes(upOld) && !s.includes('updateInner')) {
  s = s.replace(upOld, () => `    void update (final String text, final String nextText) {
        runOnMain(new Runnable() {
            @Override
            public void run () { updateInner(text, nextText); }
        }, 2000);
    }

    private void updateInner (String text, String nextText) {`)
  console.log('✓ update 切主线程')
}

/* ---------- hide ---------- */
const hideOld = `    void hide() {`
if (s.includes(hideOld) && !s.includes('hideInner')) {
  s = s.replace(hideOld, () => `    void hide () {
        runOnMain(new Runnable() {
            @Override
            public void run () { hideInner(); }
        }, 2000);
    }

    private void hideInner () {`)
  console.log('✓ hide 切主线程')
}

/* ---------- isShowing ---------- */
const isOld = `    boolean isShowing() {`
if (s.includes(isOld) && !s.includes('isShowingInner')) {
  s = s.replace(isOld, () => `    boolean isShowing () {
        final boolean[] ret = { false };
        runOnMain(new Runnable() {
            @Override
            public void run () { ret[0] = isShowingInner(); }
        }, 1500);
        return ret[0];
    }

    private boolean isShowingInner () {`)
  console.log('✓ isShowing 切主线程')
}

fs.writeFileSync(p, s, 'utf8')
console.log('完成')