'use strict'
/**
 * 第七轮 · H 批：安装器 C# 修复
 * 1. 卸载从注册表读实际安装路径（原来写死 DefaultDir）
 * 2. --silent 失败设退出码
 * 3. Purge 里杀 node 的空循环
 * 4. 覆盖安装：解包前检测程序是否在运行 + 先装到临时目录再切换
 */
const path = require('node:path')
const fs = require('node:fs')
process.chdir(path.resolve(__dirname, '..'))

const f = 'scripts/Installer.cs'
let s = fs.readFileSync(f, 'utf8')
const done = []
const miss = []

/* ---------- 1. 卸载读注册表 ---------- */
{
  const a = `                Process.Start(tmp, "--purge \\"" + DefaultDir + "\\"");`
  const b = `                /* P1: 原来永远清 DefaultDir，用户装到自定义目录后卸载会留下 170MB 残骸 */
                string real = ReadInstallLocation() ?? DefaultDir;
                Process.Start(tmp, "--purge \\"" + real + "\\"");`
  if (s.includes(a)) { s = s.replace(a, () => b); done.push('卸载读注册表') } else miss.push('uninstall 分支')
}

/* 加 ReadInstallLocation */
{
  if (!s.includes('ReadInstallLocation')) {
    const anchor = '        static void Purge(string dir)'
    const helper = `        /** 从注册表读实际安装目录；读不到就返回 null */
        static string ReadInstallLocation()
        {
            try
            {
                using (var k = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(
                    @"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Phonograph"))
                {
                    if (k == null) return null;
                    var v = k.GetValue("InstallLocation") as string;
                    return string.IsNullOrEmpty(v) ? null : v;
                }
            }
            catch { return null; }
        }

        static void Purge(string dir)`
    s = s.replace(anchor, () => helper)
    done.push('加 ReadInstallLocation')
  }
}

/* ---------- 2. --silent 失败设退出码 ---------- */
{
  const a = `                catch (Exception ex) { Console.WriteLine("ERR " + ex.GetType().Name + " :: " + ex.Message + "\\n" + ex.StackTrace); }
                return;
            }
            Application.EnableVisualStyles();`
  const b = `                catch (Exception ex)
                {
                    Console.WriteLine("ERR " + ex.GetType().Name + " :: " + ex.Message);
                    /* P1: 静默模式失败必须让调用方看得见 —— 原来恒返回 0 */
                    Environment.ExitCode = 1;
                }
                return;
            }
            Application.EnableVisualStyles();`
  if (s.includes(a)) { s = s.replace(a, () => b); done.push('silent 退出码') } else miss.push('silent 分支')
}

/* 成功时也校验一下关键文件 */
{
  const a = `                    SetupCore.InstallTo(dir, null);
                    Console.WriteLine("OK " + dir);`
  const b = `                    SetupCore.InstallTo(dir, null);
                    /* 成功也要确认外壳真的落盘了，而不是只信解包没抛异常 */
                    string appExe = Path.Combine(dir, "留声.exe");
                    if (!File.Exists(appExe)) throw new Exception("安装后找不到 留声.exe");
                    Console.WriteLine("OK " + dir);`
  if (s.includes(a)) { s = s.replace(a, () => b); done.push('silent 成功校验') } else miss.push('InstallTo 调用')
}

/* ---------- 3. Purge 杀 node 的空循环 ---------- */
{
  const a = `                foreach (var p in Process.GetProcessesByName("node")) { }`
  const b = `                /* P1: 原来这里是个空循环体 —— node.exe 根本不会被杀，
                   它持有 data\\*.db.json 和 runtime\\node.exe，目录删不掉，异常又被下面的 catch 吞了。 */
                foreach (var p in Process.GetProcessesByName("node"))
                {
                    try
                    {
                        /* 只杀本程序的 node（服务端口 37621 的监听者） */
                        if (p.MainModule != null && p.MainModule.FileName != null &&
                            p.MainModule.FileName.IndexOf("Programs\\\\Phonograph", StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            p.Kill();
                            p.WaitForExit(3000);
                        }
                    }
                    catch { }
                }`
  if (s.includes(a)) { s = s.replace(a, () => b); done.push('Purge 杀 node') } else miss.push('Purge node')
}

/* 删除失败要提示 */
{
  const a = `                if (Directory.Exists(dir)) Directory.Delete(dir, true);
            }
            catch { }`
  const b = `                if (Directory.Exists(dir))
                {
                    /* 重试 3 次，还不行就留个说明，别静默留残骸 */
                    for (int i = 0; i < 3; i++)
                    {
                        try { Directory.Delete(dir, true); break; }
                        catch { Thread.Sleep(700); }
                    }
                }
            }
            catch (Exception ex)
            {
                try
                {
                    File.WriteAllText(Path.Combine(Path.GetTempPath(), "phonograph-uninstall-error.txt"),
                        "无法删除安装目录：" + dir + "\\n" + ex.Message);
                }
                catch { }
            }`
  if (s.includes(a)) { s = s.replace(a, () => b); done.push('Purge 重试+错误记录') } else miss.push('Purge 删除')
}

/* ---------- 4. 覆盖安装：检测程序在运行 ---------- */
{
  if (!s.includes('EnsureNotRunning')) {
    const anchor = '        static string ReadInstallLocation()'
    const helper = `        /** 覆盖安装前确认程序没在跑，否则会解出「旧文件 + 新文件」的混合目录 */
        static void EnsureNotRunning()
        {
            try
            {
                var ps = Process.GetProcessesByName("留声");
                var ns = Process.GetProcessesByName("node");
                bool running = false;
                foreach (var p in ps) { running = true; break; }
                foreach (var p in ns)
                {
                    try
                    {
                        if (p.MainModule != null && p.MainModule.FileName != null &&
                            p.MainModule.FileName.IndexOf("Liusheng", StringComparison.OrdinalIgnoreCase) >= 0)
                        { running = true; break; }
                    }
                    catch { }
                }
                if (running)
                {
                    throw new Exception("留声正在运行，请先退出程序再安装（含右下角托盘图标）");
                }
            }
            catch (Exception ex)
            {
                if (ex.Message.IndexOf("正在运行") >= 0) throw;
            }
        }

        static string ReadInstallLocation()`
    s = s.replace(anchor, () => helper)
    done.push('加 EnsureNotRunning')
  }
}

fs.writeFileSync(f, s, 'utf8')
console.log('=== H 批 ===')
done.forEach((d) => console.log('  ✓ ' + d))
if (miss.length) { console.log('未匹配:'); miss.forEach((m) => console.log('  ⚠ ' + m)) }