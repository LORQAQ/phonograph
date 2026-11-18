using System;
using System.Diagnostics;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

// LX Music 桌面启动器：
// 1) 启动内置 node 服务（runtime\node.exe app\server.js，无黑框）
// 2) 等待 127.0.0.1:37621 就绪
// 3) 用 Edge 的 --app 模式打开无地址栏应用窗口
// 参数：--stop 关闭后台服务
static class Launcher
{
    const int PORT = 37621;
    static string Root { get { return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'); } }

    static bool PortOpen()
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect("127.0.0.1", PORT, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(400)) return false;
                c.EndConnect(ar);
                return true;
            }
        }
        catch { return false; }
    }

    static void StartServer()
    {
        var node = Path.Combine(Root, @"runtime\node.exe");
        var server = Path.Combine(Root, @"app\server.js");
        if (!File.Exists(node) || !File.Exists(server))
        {
            MessageBox.Show("缺少运行文件：\n" + node + "\n" + server, "LX Music", MessageBoxButtons.OK, MessageBoxIcon.Error);
            Environment.Exit(1);
        }
        var psi = new ProcessStartInfo(node, "\"" + server + "\"");
        psi.WorkingDirectory = Root;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        psi.WindowStyle = ProcessWindowStyle.Hidden;
        Process.Start(psi);
    }

    static string FindEdge()
    {
        string[] candidates = new string[] {
            Environment.GetEnvironmentVariable("ProgramFiles(x86)") + @"\Microsoft\Edge\Application\msedge.exe",
            Environment.GetEnvironmentVariable("ProgramFiles") + @"\Microsoft\Edge\Application\msedge.exe",
            Environment.GetEnvironmentVariable("LOCALAPPDATA") + @"\Microsoft\Edge\Application\msedge.exe"
        };
        foreach (var c in candidates) if (!string.IsNullOrEmpty(c) && File.Exists(c)) return c;
        return null;
    }

    static void OpenWindow()
    {
        var url = "http://127.0.0.1:" + PORT + "/";
        var edge = FindEdge();
        var profile = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"LXMusic\browser");
        try { Directory.CreateDirectory(profile); } catch { }
        if (edge != null)
        {
            try
            {
                var args = "--app=" + url + " --window-size=1360,860 --user-data-dir=\"" + profile + "\" --no-first-run --disable-features=Translate,msImplicitSignin";
                Process.Start(new ProcessStartInfo(edge, args) { UseShellExecute = false });
                return;
            }
            catch { }
        }
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch (Exception ex) { MessageBox.Show("无法打开应用窗口：" + ex.Message + "\n请手动访问 " + url, "LX Music"); }
    }

    static void StopServer()
    {
        try
        {
            using (var wc = new System.Net.WebClient())
            {
                wc.Headers.Add("Content-Type", "application/json");
                wc.UploadString("http://127.0.0.1:" + PORT + "/api/shutdown", "POST", "{}");
                MessageBox.Show("后台音乐服务已停止。", "LX Music", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
        }
        catch { }

        var psi = new ProcessStartInfo("powershell",
            "-NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='node.exe'\\\" | Where-Object { $_.CommandLine -like '*app\\\\server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"");
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;
        try { Process.Start(psi).WaitForExit(6000); } catch { }
        MessageBox.Show("已尝试停止后台音乐服务。", "LX Music", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }

    [STAThread]
    static void Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--stop") { StopServer(); return; }

        bool started = PortOpen();
        if (!started)
        {
            StartServer();
            for (int i = 0; i < 120 && !PortOpen(); i++) Thread.Sleep(250);
            started = PortOpen();
        }
        if (!started)
        {
            MessageBox.Show("音乐服务启动失败，请查看 data 目录或手动运行 runtime\\node.exe app\\server.js 排查。", "LX Music", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }
        OpenWindow();
    }
}
