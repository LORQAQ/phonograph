using System;
using System.IO;
using System.IO.Compression;
using System.Text;

/* 用安装器完全相同的 API（ZipArchive）读条目名，
   验证 UTF-8 标志置位后 .NET 能正确解码中文 */
class ZipProbe
{
    static void Main(string[] args)
    {
        if (args.Length < 1) { Console.WriteLine("用法: ZipProbe <zip>"); return; }
        try
        {
            using (var fs = new FileStream(args[0], FileMode.Open, FileAccess.Read))
            using (var za = new ZipArchive(fs, ZipArchiveMode.Read))
            {
                Console.WriteLine("Encoding.Default = " + Encoding.Default.WebName);
                int n = 0, cn = 0;
                bool hasExe = false;
                foreach (var e in za.Entries)
                {
                    n++;
                    bool nonAscii = false;
                    foreach (char c in e.FullName) if (c > 127) { nonAscii = true; break; }
                    if (nonAscii)
                    {
                        cn++;
                        if (cn <= 5) Console.WriteLine("  [" + e.FullName + "] len=" + e.Length);
                    }
                    var norm = e.FullName.Replace('\\', '/').TrimStart('.', '/');
                    if (norm == "留声.exe") hasExe = true;
                }
                Console.WriteLine("条目总数=" + n + " 非ASCII=" + cn);
                Console.WriteLine(hasExe ? "OK 找到 留声.exe（文件名解码正确）" : "FAIL 找不到 留声.exe（解码错误）");
            }
        }
        catch (Exception ex)
        {
            Console.WriteLine("ERR " + ex.Message);
        }
    }
}