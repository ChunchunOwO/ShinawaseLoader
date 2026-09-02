using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

internal static class EchoModdedHost
{
    // echo-steam current Steam host / AppId 5105150. Launch the isolated copy at
    // ShinawaseLoader\modded-runtime\ECHO.exe — never the Steam original, and
    // never a hardlink of that exe (Electron 43.3 embeds the asar header hash).
    // userData is %APPDATA%\ECHO Steam unless ECHO_USER_DATA_PATH_OVERRIDE is set.
    // Steam updates replace the stock asar/exe; sync the isolated runtime first.
    private const string SteamAppId = "5105150";

    private static string Quote(string value)
    {
        return "\"" + (value ?? string.Empty).Replace("\"", "\\\"") + "\"";
    }

    private static string FindNode(string loaderRoot)
    {
        var bundled = Path.Combine(loaderRoot, "node.exe");
        if (File.Exists(bundled)) return bundled;
        var configPath = Path.Combine(loaderRoot, "loader.config.json");
        if (File.Exists(configPath))
        {
            var text = File.ReadAllText(configPath);
            var marker = "\"runtimePath\"";
            var at = text.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (at >= 0)
            {
                var colon = text.IndexOf(':', at + marker.Length);
                var first = colon >= 0 ? text.IndexOf('"', colon + 1) : -1;
                var second = first >= 0 ? text.IndexOf('"', first + 1) : -1;
                if (first >= 0 && second > first)
                {
                    var path = text.Substring(first + 1, second - first - 1).Replace("\\\\", "\\");
                    if (File.Exists(path)) return path;
                }
            }
        }
        return "node";
    }

    private static void RunNodeScript(string root, string loaderRoot, string scriptName, string extraArgs)
    {
        var script = Path.Combine(loaderRoot, scriptName);
        if (!File.Exists(script)) return;
        var node = FindNode(loaderRoot);
        var logDir = Path.Combine(loaderRoot, "Logs");
        try { Directory.CreateDirectory(logDir); } catch { }
        var info = new ProcessStartInfo
        {
            FileName = node,
            Arguments = Quote(script) + " " + extraArgs,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true
        };
        info.EnvironmentVariables["ECHO_MOD_HOME"] = loaderRoot;
        info.EnvironmentVariables["ECHO_GAME_ROOT"] = root;
        try
        {
            using (var proc = Process.Start(info))
            {
                if (proc == null) return;
                var stdout = proc.StandardOutput.ReadToEnd();
                var stderr = proc.StandardError.ReadToEnd();
                if (!proc.WaitForExit(180000))
                {
                    try { proc.Kill(); } catch { }
                    return;
                }
                try
                {
                    File.AppendAllText(Path.Combine(logDir, Path.GetFileNameWithoutExtension(scriptName) + ".log"),
                        "[" + DateTime.UtcNow.ToString("o") + "] exit=" + proc.ExitCode + Environment.NewLine
                        + stdout + stderr + Environment.NewLine);
                }
                catch { }
            }
        }
        catch { }
    }

    public static int Main(string[] args)
    {
        var root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var loaderRoot = Path.Combine(root, "ShinawaseLoader");
        RunNodeScript(root, loaderRoot, "ShinawaseLoader.mjs", "self-update --auto --quiet");
        RunNodeScript(root, loaderRoot, "runtime-sync.mjs", "--echo " + Quote(root) + " --skip-update");
        var moddedExe = Path.Combine(loaderRoot, "modded-runtime", "ECHO.exe");
        if (!File.Exists(moddedExe))
        {
            Console.Error.WriteLine("ECHO.modded.exe is not installed. Run setup-modloader.bat first.");
            return 2;
        }

        bool acquired;
        using (var mutex = new System.Threading.Mutex(true, "Local\\ECHO-Modded-5105150", out acquired))
        {
            if (!acquired) return 0;

        var launchArgs = args.ToList();
        if (!launchArgs.Any(value => value.StartsWith("--remote-debugging-port=", StringComparison.OrdinalIgnoreCase)))
            launchArgs.Add("--remote-debugging-port=9229");
        if (!launchArgs.Any(value => value.StartsWith("--inspect=", StringComparison.OrdinalIgnoreCase)))
            launchArgs.Add("--inspect=9230");
        var info = new ProcessStartInfo
        {
            FileName = moddedExe,
            WorkingDirectory = root,
            UseShellExecute = false,
            CreateNoWindow = true,
            Arguments = String.Join(" ", launchArgs.Select(Quote))
        };
        info.EnvironmentVariables["ECHO_MOD_ROOT"] = root;
        info.EnvironmentVariables["ECHO_MOD_HOME"] = loaderRoot;
        info.EnvironmentVariables["ECHO_GAME_ROOT"] = root;
        info.EnvironmentVariables["ECHO_MODDED_HOST"] = "1";
        info.EnvironmentVariables["SteamAppId"] = SteamAppId;
        info.EnvironmentVariables["SteamGameId"] = SteamAppId;
        info.EnvironmentVariables["ECHO_MODS_HOME"] = Path.Combine(root, "Mods");
        info.EnvironmentVariables["ECHO_PLUGINS_HOME"] = Path.Combine(root, "Plugins");
        info.EnvironmentVariables["ECHO_LOGS_HOME"] = Path.Combine(loaderRoot, "Logs");

            using (var child = Process.Start(info))
            {
                if (child == null)
                {
                    Console.Error.WriteLine("Could not start the modded ECHO runtime.");
                    return 3;
                }
                child.WaitForExit();
                return child.ExitCode;
            }
        }
    }
}
