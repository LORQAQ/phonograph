'use strict'
/**
 * 音频转码模块（自包含，不依赖 server.js 内部状态）
 * 提供 mp3(320k) / flac 两种输出，依赖 runtime/bin/ffmpeg.exe
 */
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const FFMPEG_BIN = path.join(__dirname, '..', '..', 'runtime', 'bin', 'ffmpeg.exe')

function available () {
  try { return fs.existsSync(FFMPEG_BIN) } catch (e) { return false }
}

/**
 * 把音频文件转成目标格式
 * @returns {string|null} 输出文件路径，失败返回 null
 */
function transcodeAudio (srcFile, targetFormat, outFile) {
  if (!available()) return null
  if (!fs.existsSync(srcFile)) return null
  const args = targetFormat === 'flac'
    ? ['-y', '-i', srcFile, '-vn', '-c:a', 'flac', '-compression_level', '5', outFile]
    : ['-y', '-i', srcFile, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outFile]
  try {
    execFileSync(FFMPEG_BIN, args, { timeout: 180000, stdio: 'ignore', windowsHide: true })
    return (fs.existsSync(outFile) && fs.statSync(outFile).size > 4096) ? outFile : null
  } catch (e) {
    return null
  }
}

/** 按文件头判断真实格式 */
function sniffFormat (buf) {
  if (!buf || buf.length < 8) return 'unknown'
  const h = buf.slice(0, 16).toString('latin1')
  if (h.startsWith('ID3')) return 'mp3'
  if (/^\xFF[\xFA-\xFF]/.test(h)) return 'mp3'
  if (h.slice(4, 8) === 'ftyp') return 'm4a'
  if (h.startsWith('fLaC')) return 'flac'
  if (h.startsWith('OggS')) return 'ogg'
  if (h.startsWith('RIFF')) return 'wav'
  return 'unknown'
}

function mimeFor (fmt) {
  return fmt === 'flac' ? 'audio/flac' : fmt === 'm4a' ? 'audio/mp4' : fmt === 'ogg' ? 'audio/ogg' : 'audio/mpeg'
}

/** 异步转码（spawn + 超时），返回 Promise<boolean> */
function transcodeAsync (srcFile, targetFormat, outFile, timeoutMs = 180000) {
  return new Promise((resolve) => {
    if (!available()) return resolve(false)
    if (!fs.existsSync(srcFile)) return resolve(false)
    const args = targetFormat === 'flac'
      ? ['-y', '-i', srcFile, '-vn', '-c:a', 'flac', '-compression_level', '5', outFile]
      : ['-y', '-i', srcFile, '-vn', '-c:a', 'libmp3lame', '-b:a', '320k', outFile]
    const { spawn } = require('node:child_process')
    let done = false
    const child = spawn(FFMPEG_BIN, args, { windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try { child.kill('SIGKILL') } catch (e) { }
      resolve(false)
    }, timeoutMs)
    child.on('error', () => { if (!done) { done = true; clearTimeout(timer); resolve(false) } })
    child.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      try {
        resolve(code === 0 && fs.existsSync(outFile) && fs.statSync(outFile).size > 4096)
      } catch (e) { resolve(false) }
    })
  })
}

/** 解除 Windows「来自网络」标记（Zone.Identifier），避免 SmartScreen 提示 */
function unblockFile (filePath) {
  if (process.platform !== 'win32') return
  try { fs.unlinkSync(filePath + ':Zone.Identifier') } catch (e) { }
  try {
    const { execFile } = require('node:child_process')
    const esc = String(filePath).replace(/"/g, '`"')
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', 'Unblock-File -LiteralPath "' + esc + '"'], { windowsHide: true }, () => { })
  } catch (e) { }
}

module.exports = { unblockFile, transcodeAsync, transcodeAudio, available, sniffFormat, mimeFor, FFMPEG_BIN }
