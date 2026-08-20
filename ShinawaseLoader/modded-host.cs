using System;
using System.Diagnostics;
using System.IO;
using System.Linq;

internal static class EchoModdedHost
{
    private const string SteamAppId = "5105150";

    private static string Quote(string value)
    {
        return "\"" + (value ?? string.Empty).Replace("\"", "\\\"") + "\"";
    }

    public static int Main(string[] args)
    {
        var root = AppDomain.CurrentDomain.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var loaderRoot = Path.Combine(root, "ShinawaseLoader");
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
