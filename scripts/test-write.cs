using System;
using System.IO;

class T
{
    static void Main()
    {
        var paths = new string[] {
            Path.Combine(Environment.CurrentDirectory, "write-test-cwd.txt"),
            Path.Combine(Path.GetTempPath(), "write-test-temp.txt"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "write-test-la.txt"),
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "write-test-home.txt")
        };
        Console.WriteLine("user=" + Environment.UserName + " cwd=" + Environment.CurrentDirectory);
        foreach (var p in paths)
        {
            try { File.WriteAllText(p, "ok"); Console.WriteLine("OK   " + p); }
            catch (Exception ex) { Console.WriteLine("FAIL " + p + " :: " + ex.GetType().Name + " " + ex.Message); }
        }
    }
}
