using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

// =============================================================
//  留声 Phonograph · 原生窗口外壳（WinForms + WebView2）
//  - 主窗口：普通窗口，加载本地服务页面
//  - 桌面歌词：无边框 + 透明 + 置顶，文字直接浮在桌面上
// =============================================================
static class Program
{
    const int PORT = 37621;
    static string Root { get { return AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\'); } }
    static Process serverProc = null;

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    static extern bool SetDllDirectory(string lpPathName);

    [DllImport("user32.dll")]
    static extern bool SetProcessDpiAwarenessContext(IntPtr value);

    [STAThread]
    static void Main(string[] args)
    {
        // 高 DPI 感知（PerMonitorV2），避免缩放屏上文字发虚
        try { SetProcessDpiAwarenessContext(new IntPtr(-4)); } catch { }
        AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        {
            try { File.AppendAllText(Path.Combine(Root, "shell-error.log"), DateTime.Now + " " + e.ExceptionObject + "\n\n"); } catch { }
        };
        try { Run(args); }
        catch (Exception ex)
        {
            try { File.AppendAllText(Path.Combine(Root, "shell-error.log"), DateTime.Now + " MAIN " + ex + "\n\n"); } catch { }
            MessageBox.Show(ex.Message, "留声 · Phonograph", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    static void Run(string[] args)
    {
        var wvDir = Path.Combine(Root, @"runtime\webview2");
        AppDomain.CurrentDomain.AssemblyResolve += (s, e) =>
        {
            var name = new AssemblyName(e.Name).Name;
            var p = Path.Combine(wvDir, name + ".dll");
            return File.Exists(p) ? Assembly.LoadFrom(p) : null;
        };
        try { SetDllDirectory(wvDir); } catch { }

        if (args.Length > 0 && args[0] == "--stop") { StopServer(); return; }

        bool already = false;
        using (var mutex = new Mutex(true, "LXPhonograph.SingleInstance", out already))
        {
            if (!already) { MessageBox.Show("LX Phonograph 已在运行。", "留声 · Phonograph", MessageBoxButtons.OK, MessageBoxIcon.Information); return; }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            try
            {
                if (!PortOpen()) { StartServer(); WaitPort(20000); }
                if (!PortOpen())
                {
                    MessageBox.Show("本地服务启动失败。\n请手动运行：runtime\\node.exe app\\server.js 查看报错。",
                        "留声 · Phonograph", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }
                Application.Run(new MainForm());
            }
            finally
            {
                if (serverProc != null && !serverProc.HasExited) { try { serverProc.Kill(); } catch { } }
            }
        }
    }

    static bool PortOpen()
    {
        try
        {
            using (var c = new TcpClient())
            {
                var ar = c.BeginConnect("127.0.0.1", PORT, null, null);
                if (!ar.AsyncWaitHandle.WaitOne(350)) return false;
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
        if (!File.Exists(node) || !File.Exists(server)) return;
        serverProc = Process.Start(new ProcessStartInfo(node, "\"" + server + "\"")
        {
            WorkingDirectory = Root,
            UseShellExecute = false,
            CreateNoWindow = true,
        });
    }

    static void WaitPort(int ms)
    {
        for (int i = 0; i < ms / 200 && !PortOpen(); i++) Thread.Sleep(200);
    }

    static void StopServer()
    {
        try
        {
            using (var wc = new WebClient())
            {
                wc.Headers.Add("Content-Type", "application/json");
                wc.UploadString("http://127.0.0.1:" + PORT + "/api/shutdown", "POST", "{}");
                MessageBox.Show("后台服务已停止。", "留声 · Phonograph", MessageBoxButtons.OK, MessageBoxIcon.Information);
                return;
            }
        }
        catch { }
        var psi = new ProcessStartInfo("powershell",
            "-NoProfile -Command \"Get-CimInstance Win32_Process -Filter \\\"Name='node.exe'\\\" | Where-Object { $_.CommandLine -like '*app\\\\server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }\"")
        { UseShellExecute = false, CreateNoWindow = true };
        try { Process.Start(psi).WaitForExit(6000); } catch { }
        MessageBox.Show("已尝试停止后台服务。", "留声 · Phonograph", MessageBoxButtons.OK, MessageBoxIcon.Information);
    }
}

class MainForm : Form
{
    readonly WebView2 web;
    readonly string userData;
    LyricForm lyric;
    string logPath;
    CoreWebView2Environment env;

    public MainForm()
    {
        Text = "留声 · Phonograph";
        Width = 1600; Height = 1000;
        MinimumSize = new System.Drawing.Size(1100, 720);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = System.Drawing.Color.FromArgb(12, 10, 9);
        try { Icon = System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

        logPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "shell-error.log");
        userData = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, @"data\webview2");
        web = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(web);
        Load += async (s, e) => await InitAsync();
        FormClosing += (s, e) => { if (lyric != null && !lyric.IsDisposed) lyric.Close(); };
    }

    void Log(string s) { try { File.AppendAllText(logPath, DateTime.Now.ToString("HH:mm:ss") + " " + s + "\n"); } catch { } }

    async Task InitAsync()
    {
        try
        {
            var version = CoreWebView2Environment.GetAvailableBrowserVersionString();
            Log("runtime = " + version);
            if (string.IsNullOrEmpty(version))
            {
                MessageBox.Show("缺少 WebView2 运行时：\nhttps://go.microsoft.com/fwlink/p/?LinkId=2124703", "留声 · Phonograph");
                Close(); return;
            }
            Directory.CreateDirectory(userData);
            var debug = File.Exists(Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "debug.flag"));
            var opts = new CoreWebView2EnvironmentOptions(debug
                ? "--remote-debugging-port=9333 --remote-allow-origins=* --autoplay-policy=no-user-gesture-required"
                : "--autoplay-policy=no-user-gesture-required");
            var env2 = await CoreWebView2Environment.CreateAsync(null, userData, opts);
            env = env2;
            await web.EnsureCoreWebView2Async(env);

            web.CoreWebView2.Settings.AreDevToolsEnabled = true;
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.Settings.IsZoomControlEnabled = false;

            web.CoreWebView2.WebMessageReceived += (s, e) =>
            {
                var msg = e.TryGetWebMessageAsString();
                Log("msg = " + msg);
                if (msg == "desktopLyric") ToggleLyric();
                else if (msg == "minimize") WindowState = FormWindowState.Minimized;
                else if (msg == "maximize") WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                else if (msg == "close") Close();
                else if (msg.StartsWith("openDir:"))
                {
                    var dir = msg.Substring("openDir:".Length).Trim();
                    Log("openDir -> " + dir);
                    try
                    {
                        if (!System.IO.Directory.Exists(dir)) System.IO.Directory.CreateDirectory(dir);
                    }
                    catch (Exception ex) { Log("mkdir fail " + ex.Message); }

                    bool opened = false;
                    /* 方式1：交给系统 shell（最稳，不直接起 explorer.exe） */
                    try
                    {
                        var psi = new System.Diagnostics.ProcessStartInfo(dir);
                        psi.UseShellExecute = true;
                        System.Diagnostics.Process.Start(psi);
                        opened = true;
                        Log("openDir via shell ok");
                    }
                    catch (Exception ex) { Log("shell fail " + ex.Message); }

                    /* 方式2：rundll32 调系统文件夹对话框 */
                    if (!opened)
                    {
                        try
                        {
                            var psi2 = new System.Diagnostics.ProcessStartInfo("rundll32.exe");
                            psi2.Arguments = "shell32.dll,OpenAs_RunDLL " + dir;
                            psi2.UseShellExecute = true;
                            System.Diagnostics.Process.Start(psi2);
                            opened = true;
                            Log("openDir via rundll32 ok");
                        }
                        catch (Exception ex) { Log("rundll32 fail " + ex.Message); }
                    }

                    /* 都失败就把路径回给前端，让用户自己复制 */
                    if (!opened)
                    {
                        web.CoreWebView2.PostWebMessageAsString("openDirFail:" + dir);
                    }
                }
                else if (msg.StartsWith("openUrl:"))
                {
                    /* 检查更新用：前端发现新版就把 GitHub Release 页丢过来 */
                    var url = msg.Substring("openUrl:".Length).Trim();
                    Log("openUrl -> " + url);
                    if (!url.StartsWith("http://") && !url.StartsWith("https://"))
                    {
                        Log("openUrl rejected (not http)");
                        return;
                    }
                    try
                    {
                        var psi = new System.Diagnostics.ProcessStartInfo(url);
                        psi.UseShellExecute = true;
                        System.Diagnostics.Process.Start(psi);
                        Log("openUrl ok");
                    }
                    catch (Exception ex)
                    {
                        Log("openUrl fail " + ex.Message);
                        try { web.CoreWebView2.PostWebMessageAsString("openUrlFail:" + url); } catch { }
                    }
                }
                else if (msg == "pickDir")
                {
                    using (var dlg = new FolderBrowserDialog())
                    {
                        dlg.Description = "选择下载目录";
                        dlg.ShowNewFolderButton = true;
                        if (dlg.ShowDialog(this) == DialogResult.OK)
                        {
                            web.CoreWebView2.PostWebMessageAsString("dirPicked:" + dlg.SelectedPath);
                        }
                    }
                }
            };

            web.CoreWebView2.Navigate("http://127.0.0.1:37621/");
            Log("navigate ok");

            /* 下载：接管保存位置，不弹系统对话框 */
            web.CoreWebView2.DownloadStarting += (s2, e2) =>
            {
                try
                {
                    var dir = System.IO.Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                        "Downloads", "Liusheng");
                    System.IO.Directory.CreateDirectory(dir);
                    var name = System.IO.Path.GetFileName(e2.ResultFilePath);
                    if (string.IsNullOrEmpty(name)) name = "download.mp3";
                    e2.ResultFilePath = System.IO.Path.Combine(dir, name);
                    e2.Handled = true;
                    Log("download -> " + e2.ResultFilePath);
                }
                catch (Exception ex) { Log("download start fail " + ex.Message); }
            };
        }
        catch (Exception ex)
        {
            Log("INIT FAIL " + ex);
            MessageBox.Show("窗口初始化失败：" + ex.Message, "留声 · Phonograph");
        }
    }

    void ToggleLyric()
    {
        if (lyric != null && !lyric.IsDisposed) { lyric.Close(); lyric = null; return; }
        lyric = new LyricForm(env);
        lyric.Show();
    }
}

// ============ 透明桌面歌词窗口 ============
class LyricForm : Form
{
    [DllImport("user32.dll")] static extern bool ReleaseCapture();
    [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);
    const int WM_NCLBUTTONDOWN = 0xA1;
    const int HTCAPTION = 0x2;

    readonly WebView2 web;
    readonly CoreWebView2Environment env;

    public LyricForm(CoreWebView2Environment sharedEnv)
    {
        env = sharedEnv;
        FormBorderStyle = FormBorderStyle.None;
        ShowInTaskbar = false;
        TopMost = true;
        StartPosition = FormStartPosition.Manual;
        BackColor = System.Drawing.Color.Magenta;      // 键色：设为透明的部分
        TransparencyKey = System.Drawing.Color.Magenta;
        Size = new System.Drawing.Size(1040, 210);

        var wa = Screen.PrimaryScreen.WorkingArea;
        Location = new System.Drawing.Point(wa.X + (wa.Width - Width) / 2, wa.Y + wa.Height - Height - 40);

        web = new WebView2 { Dock = DockStyle.Fill };
        Controls.Add(web);
        Load += async (s, e) => await InitAsync();
    }

    async Task InitAsync()
    {
        try
        {
            await web.EnsureCoreWebView2Async(env);
            web.DefaultBackgroundColor = System.Drawing.Color.Transparent;
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            web.CoreWebView2.Settings.IsStatusBarEnabled = false;
            web.CoreWebView2.Settings.IsZoomControlEnabled = false;

            web.CoreWebView2.WebMessageReceived += (s, e) =>
            {
                var msg = e.TryGetWebMessageAsString();
                if (msg == "drag")
                {
                    ReleaseCapture();
                    SendMessage(Handle, WM_NCLBUTTONDOWN, HTCAPTION, 0);
                }
                else if (msg == "close-lyric") Close();
            };

            web.CoreWebView2.Navigate("http://127.0.0.1:37621/lyric-window.html");
        }
        catch { }
    }
}
