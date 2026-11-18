'use strict'
const fs = require('node:fs')
const p = 'scripts/Installer.cs'
let s = fs.readFileSync(p, 'utf8')

const start = s.indexOf('        void Install()')
const end = s.indexOf('        static void CopySelf(')
if (start < 0 || end < 0) { console.log('锚点未找到', start, end); process.exit(1) }

const replacement = `        void Install()
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

`

s = s.slice(0, start) + replacement + s.slice(end)
fs.writeFileSync(p, s, 'utf8')
console.log('Install() 已改为调用 SetupCore')
