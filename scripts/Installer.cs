using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

namespace PhonographSetup
{
    static class Program
    {
        public const string AppName = "留声";
        public const string AppId = "Phonograph";
        public static string DefaultDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "Phonograph");

        [STAThread]
        static void Main(string[] args)
        {
            if (args.Length >= 2 && args[0] == "--purge")
            {
                Purge(args[1]);
                return;
            }
            if (args.Length >= 1 && args[0] == "--uninstall")
            {
                string self = Assembly.GetExecutingAssembly().Location;
                string tmp = Path.Combine(Path.GetTempPath(), "phonograph-uninstall.exe");
                try { File.Copy(self, tmp, true); } catch { }
                Process.Start(tmp, "--purge \"" + DefaultDir + "\"");
                return;
            }
            if (args.Length >= 1 && args[0] == "--silent")
            {
                string dir = args.Length >= 2 ? args[1] : DefaultDir;
                try
                {
                    SetupCore.InstallTo(dir, null);
                    Console.WriteLine("OK " + dir);
                }
                catch (Exception ex) { Console.WriteLine("ERR " + ex.GetType().Name + " :: " + ex.Message + "\n" + ex.StackTrace); }
                return;
            }
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }

        static void Purge(string dir)
        {
            Thread.Sleep(900);
            try
            {
                foreach (var p in Process.GetProcessesByName("留声")) { try { p.Kill(); } catch { } }
                foreach (var p in Process.GetProcessesByName("node")) { }
                Thread.Sleep(600);
                if (Directory.Exists(dir)) Directory.Delete(dir, true);
            }
            catch { }
            try
            {
                string desk = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
                string menu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                if (File.Exists(Path.Combine(desk, AppName + ".lnk"))) File.Delete(Path.Combine(desk, AppName + ".lnk"));
                string sm = Path.Combine(menu, AppName);
                if (File.Exists(Path.Combine(sm, AppName + ".lnk"))) File.Delete(Path.Combine(sm, AppName + ".lnk"));
                if (Directory.Exists(sm) && Directory.GetFiles(sm).Length == 0) Directory.Delete(sm);
                Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\" + AppId, false);
            }
            catch { }
            try
            {
                string self = Assembly.GetExecutingAssembly().Location;
                Process.Start(new ProcessStartInfo("cmd.exe", "/c timeout /t 2 >nul & del \"" + self + "\"") { WindowStyle = ProcessWindowStyle.Hidden });
            }
            catch { }
        }
    }

    static class SetupCore
    {
        public static void InstallTo(string dir, Action<int, string> progress)
        {
            Directory.CreateDirectory(dir);
            var asm = Assembly.GetExecutingAssembly();
            using (var s = asm.GetManifestResourceStream("payload.zip"))
            {
                if (s == null) throw new Exception("安装包数据缺失");
                using (var za = new ZipArchive(s, ZipArchiveMode.Read))
                {
                    int total = za.Entries.Count, done = 0;
                    foreach (var e in za.Entries)
                    {
                        string dest = Path.Combine(dir, e.FullName.Replace('/', '\\'));
                        if (string.IsNullOrEmpty(e.Name)) { Directory.CreateDirectory(dest); }
                        else
                        {
                            Directory.CreateDirectory(Path.GetDirectoryName(dest));
                            e.ExtractToFile(dest, true);
                        }
                        done++;
                        if (progress != null) progress(Math.Min(100, done * 100 / total), "正在释放文件 " + done + " / " + total);
                    }
                }
            }

            string exe = Path.Combine(dir, "留声.exe");
            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            MakeShortcut(Path.Combine(desktop, Program.AppName + ".lnk"), exe, dir);

            string menuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), Program.AppName);
            Directory.CreateDirectory(menuDir);
            MakeShortcut(Path.Combine(menuDir, Program.AppName + ".lnk"), exe, dir);

            string uninst = Path.Combine(dir, "卸载.exe");
            try { File.Copy(Assembly.GetExecutingAssembly().Location, uninst, true); } catch { }
            MakeShortcut(Path.Combine(menuDir, "卸载 " + Program.AppName + ".lnk"), uninst, dir);

            Register(exe, dir);
        }

        public static void MakeShortcut(string lnkPath, string target, string workDir)
        {
            try
            {
                var t = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(t);
                dynamic lnk = shell.CreateShortcut(lnkPath);
                lnk.TargetPath = target;
                lnk.WorkingDirectory = workDir;
                lnk.IconLocation = target + ",0";
                lnk.Description = "留声 · 桌面音乐播放器";
                lnk.Save();
            }
            catch { }
        }

        static void Register(string exe, string dir)
        {
            const string key = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Phonograph";
            using (var k = Registry.CurrentUser.CreateSubKey(key))
            {
                if (k == null) return;
                k.SetValue("DisplayName", "留声 Phonograph");
                k.SetValue("DisplayIcon", exe);
                k.SetValue("DisplayVersion", "1.0.0");
                k.SetValue("Publisher", "Phonograph");
                k.SetValue("InstallLocation", dir);
                k.SetValue("UninstallString", "\"" + Path.Combine(dir, "卸载.exe") + "\" --uninstall");
                k.SetValue("QuietUninstallString", "\"" + Path.Combine(dir, "卸载.exe") + "\" --uninstall");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                try
                {
                    long size = 0;
                    foreach (var f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) size += new FileInfo(f).Length;
                    k.SetValue("EstimatedSize", (int)(size / 1024), RegistryValueKind.DWord);
                }
                catch { }
            }
        }
    }

    class SetupForm : Form
    {
        readonly TextBox _path = new TextBox();
        readonly Button _browse = new Button();
        readonly Button _install = new Button();
        readonly Button _cancel = new Button();
        readonly ProgressBar _bar = new ProgressBar();
        readonly Label _status = new Label();

        public SetupForm()
        {
            Text = "留声 · 安装程序";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            MaximizeBox = false;
            MinimizeBox = false;
            StartPosition = FormStartPosition.CenterScreen;
            ClientSize = new Size(520, 250);
            BackColor = Color.FromArgb(246, 248, 244);
            Font = new Font("Microsoft YaHei UI", 9f);

            var title = new Label
            {
                Text = "留声 Phonograph",
                Font = new Font("Microsoft YaHei UI", 16f, FontStyle.Bold),
                ForeColor = Color.FromArgb(27, 33, 26),
                Location = new Point(24, 20),
                AutoSize = true
            };
            var sub = new Label
            {
                Text = "桌面音乐播放器 · 网易云 / QQ / 酷狗 三平台",
                ForeColor = Color.FromArgb(79, 90, 75),
                Location = new Point(26, 56),
                AutoSize = true
            };

            var lbl = new Label { Text = "安装位置", ForeColor = Color.FromArgb(79, 90, 75), Location = new Point(26, 96), AutoSize = true };
            _path.Location = new Point(26, 118);
            _path.Size = new Size(390, 26);
            _path.Text = Program.DefaultDir;

            _browse.Text = "浏览…";
            _browse.Location = new Point(424, 117);
            _browse.Size = new Size(70, 27);
            _browse.Click += (s, e) =>
            {
                using (var d = new FolderBrowserDialog { SelectedPath = _path.Text })
                    if (d.ShowDialog() == DialogResult.OK) _path.Text = Path.Combine(d.SelectedPath, "Phonograph");
            };

            _bar.Location = new Point(26, 158);
            _bar.Size = new Size(468, 10);
            _bar.Style = ProgressBarStyle.Continuous;

            _status.Location = new Point(26, 174);
            _status.Size = new Size(468, 20);
            _status.ForeColor = Color.FromArgb(79, 90, 75);
            _status.Text = "";

            _install.Text = "安装";
            _install.Location = new Point(320, 202);
            _install.Size = new Size(84, 32);
            _install.BackColor = Color.FromArgb(31, 157, 85);
            _install.ForeColor = Color.White;
            _install.FlatStyle = FlatStyle.Flat;
            _install.FlatAppearance.BorderSize = 0;
            _install.Click += (s, e) => Install();

            _cancel.Text = "取消";
            _cancel.Location = new Point(412, 202);
            _cancel.Size = new Size(82, 32);
            _cancel.FlatStyle = FlatStyle.Flat;
            _cancel.Click += (s, e) => Close();

            Controls.AddRange(new Control[] { title, sub, lbl, _path, _browse, _bar, _status, _install, _cancel });
        }

        void Install()
        {
            string dir = _path.Text.Trim();
            if (dir.Length < 4 || !Path.IsPathRooted(dir)) { MessageBox.Show("请填写有效的安装路径。", Program.AppName); return; }
            _install.Enabled = false; _browse.Enabled = false; _path.Enabled = false;
            try
            {
                SetupCore.InstallTo(dir, (p, msg) => { _bar.Value = p; _status.Text = msg; Application.DoEvents(); });
                _bar.Value = 100;
                _status.Text = "安装完成";
                if (MessageBox.Show("安装完成，是否立即启动留声？", Program.AppName, MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                    Process.Start(new ProcessStartInfo(Path.Combine(dir, "留声.exe")) { WorkingDirectory = dir });
                Close();
            }
            catch (Exception ex)
            {
                MessageBox.Show("安装失败：" + ex.Message, Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
                _install.Enabled = true; _browse.Enabled = true; _path.Enabled = true;
            }
        }

        static void CopySelf(string dest)
        {
            try { File.Copy(Assembly.GetExecutingAssembly().Location, dest, true); } catch { }
        }

        static void MakeShortcut(string lnkPath, string target, string workDir)
        {
            try
            {
                var t = Type.GetTypeFromProgID("WScript.Shell");
                dynamic shell = Activator.CreateInstance(t);
                dynamic lnk = shell.CreateShortcut(lnkPath);
                lnk.TargetPath = target;
                lnk.WorkingDirectory = workDir;
                lnk.IconLocation = target + ",0";
                lnk.Description = "留声 · 桌面音乐播放器";
                lnk.Save();
            }
            catch { }
        }

        static void Register(string exe, string dir)
        {
            const string key = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\Phonograph";
            using (var k = Registry.CurrentUser.CreateSubKey(key))
            {
                if (k == null) return;
                k.SetValue("DisplayName", "留声 Phonograph");
                k.SetValue("DisplayIcon", exe);
                k.SetValue("DisplayVersion", "1.0.0");
                k.SetValue("Publisher", "Phonograph");
                k.SetValue("InstallLocation", dir);
                k.SetValue("UninstallString", "\"" + Path.Combine(dir, "卸载.exe") + "\" --uninstall");
                k.SetValue("QuietUninstallString", "\"" + Path.Combine(dir, "卸载.exe") + "\" --uninstall");
                k.SetValue("NoModify", 1, RegistryValueKind.DWord);
                k.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                try
                {
                    long size = 0;
                    foreach (var f in Directory.GetFiles(dir, "*", SearchOption.AllDirectories)) size += new FileInfo(f).Length;
                    k.SetValue("EstimatedSize", (int)(size / 1024), RegistryValueKind.DWord);
                }
                catch { }
            }
        }
    }
}
