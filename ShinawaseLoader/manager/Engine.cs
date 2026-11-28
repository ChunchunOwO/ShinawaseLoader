// Install engine for the Shinawase Manager. The pipeline follows
// scripts/setup-modloader.ps1 step for step (same files, same config keys,
// same launchers) so either entry point can repair or update the other's
// install. Trust: Node is pinned by the SHA-256 in loader-version.json, npm by
// package-lock.json, and remote loader sources go through manager-helper.mjs,
// which verifies the Ed25519-signed mirror manifest (or uses GitHub over HTTPS).
using System;
using System.Collections.Generic;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Management;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace Shinawase.Manager
{
    public sealed class LoaderVersionInfo
    {
        public string Version;
        public string NodeVersion;
        public string NodeSha256;

        public static LoaderVersionInfo Read(string loaderDir)
        {
            var data = loaderDir == null ? null : Json.TryReadObject(Path.Combine(loaderDir, "loader-version.json"));
            if (data == null) return null;
            return new LoaderVersionInfo { Version = data.Str("version"), NodeVersion = data.Str("nodeVersion"), NodeSha256 = data.Str("nodeSha256") };
        }
    }

    public sealed class EchoTarget : Bindable
    {
        public string ExePath;
        public string Root;
        public string LoaderRoot;
        public string EchoVersion;
        public bool IsPlaytest;
        public int Rank;
        private string loaderVersion;
        private bool hasHost;
        private bool hasRuntime;
        private bool selected;
        private string edition = "external";

        public static EchoTarget FromExe(string exe)
        {
            var full = Paths.Full(exe);
            var root = Path.GetDirectoryName(full);
            var target = new EchoTarget
            {
                ExePath = full,
                Root = root,
                LoaderRoot = Path.Combine(root, "ShinawaseLoader"),
                IsPlaytest = Discovery.IsPlaytest(full),
                Rank = Discovery.RankOf(full),
            };
            try { target.EchoVersion = FileVersionInfo.GetVersionInfo(full).ProductVersion; } catch { }
            target.Refresh();
            return target;
        }

        public void Refresh()
        {
            var info = LoaderVersionInfo.Read(LoaderRoot);
            LoaderVersion = info == null ? null : info.Version;
            HasHost = File.Exists(ModdedExe);
            HasRuntime = File.Exists(RuntimeExe);
            // workshop.json is written by the Workshop edition (workshop-bootstrap.mjs);
            // setup records the chosen edition there. Without a mark, an install
            // that has no ECHO.modded.exe but a Workshop state is the Workshop edition.
            var workshop = Json.TryReadObject(WorkshopState);
            var marked = workshop == null ? null : workshop.Str("edition");
            Edition = marked == "workshop" || marked == "external" ? marked : (!hasHost && workshop != null ? "workshop" : "external");
            try { EchoVersion = FileVersionInfo.GetVersionInfo(ExePath).ProductVersion; } catch { }
            Raise("DetailText");
            Raise("Installed");
            Raise("Healthy");
        }

        public string WorkshopState { get { return Path.Combine(LoaderRoot, "workshop.json"); } }
        public string Edition { get { return edition; } private set { Set(ref edition, value, "Edition"); Raise("IsWorkshop"); } }
        public bool IsWorkshop { get { return edition == "workshop"; } }
        public string HostScript { get { return Path.Combine(LoaderRoot, "echo-modded-host.mjs"); } }

        public string ModdedExe { get { return Path.Combine(Root, "ECHO.modded.exe"); } }
        public bool IsZankyo { get { return File.Exists(Path.Combine(Root, "EchoZankyo.exe"))
            || File.Exists(Path.Combine(Root, "echo-gpui.exe")) || !File.Exists(Path.Combine(Root, "resources", "app.asar")); } }
        public string RuntimeExe { get { return IsZankyo
            ? (File.Exists(Path.Combine(Root, "EchoZankyo.exe"))
                ? Path.Combine(Root, "EchoZankyo.exe")
                : (File.Exists(Path.Combine(Root, "echo-gpui.exe")) ? Path.Combine(Root, "echo-gpui.exe") : ExePath))
            : Path.Combine(LoaderRoot, "modded-runtime", "ECHO.exe"); } }
        public string LoaderVersion { get { return loaderVersion; } private set { Set(ref loaderVersion, value, "LoaderVersion"); } }
        public bool HasHost { get { return hasHost; } private set { Set(ref hasHost, value, "HasHost"); } }
        public bool HasRuntime { get { return hasRuntime; } private set { Set(ref hasRuntime, value, "HasRuntime"); } }
        public bool Installed { get { return loaderVersion != null; } }
        // The Workshop edition starts through echo-modded-host.mjs, not ECHO.modded.exe.
        public bool Healthy { get { return Installed && hasRuntime && (hasHost || (IsWorkshop && File.Exists(HostScript))); } }
        public bool IsSelected { get { return selected; } set { Set(ref selected, value, "IsSelected"); } }

        public string Title { get { return Path.GetFileNameWithoutExtension(ExePath); } }
        public string PathText { get { return Root; } }
        public string RankText
        {
            get
            {
                if (IsPlaytest) return L.T("rank.playtest");
                return ExePath.IndexOf("\\steamapps\\common\\", StringComparison.OrdinalIgnoreCase) >= 0 ? L.T("rank.steam") : L.T("rank.other");
            }
        }
        public string DetailText
        {
            get
            {
                var parts = new List<string>();
                if (!string.IsNullOrEmpty(EchoVersion)) parts.Add(L.F("target.version", EchoVersion));
                parts.Add(Installed ? L.F("target.loader", LoaderVersion) : L.T("target.noLoader"));
                if (Installed && IsWorkshop) parts.Add(L.T("target.workshop"));
                return string.Join("  ·  ", parts);
            }
        }
        public void Relabel() { Raise("RankText"); Raise("DetailText"); }

        public JObject Config { get { return Json.TryReadObject(Path.Combine(LoaderRoot, "loader.config.json")) ?? new JObject(); } }

        public int DebugPort
        {
            get
            {
                var value = Config.Num("debugPort");
                return value.HasValue && value > 0 && value < 65536 ? (int)value.Value : 9229;
            }
        }

        public int ApiPort
        {
            get
            {
                var value = Config.Num("port");
                return value.HasValue && value > 0 && value < 65536 ? (int)value.Value : 17862;
            }
        }

        public string NodePath
        {
            get
            {
                var bundled = Path.Combine(LoaderRoot, "node.exe");
                if (File.Exists(bundled)) return bundled;
                var configured = Config.Str("runtimePath");
                if (!string.IsNullOrEmpty(configured) && File.Exists(configured)) return configured;
                if (UsesEchoNode) return ExePath;
                return SystemNode.OnPath() ?? "node";
            }
        }

        // Workshop installs ship no node.exe: the Loader runs on ECHO's own
        // executable (Electron's RunAsNode fuse), recorded as nodeRuntime "echo".
        public bool UsesEchoNode
        {
            get
            {
                if (File.Exists(Path.Combine(LoaderRoot, "node.exe"))) return false;
                var configured = Config.Str("runtimePath");
                if (!string.IsNullOrEmpty(configured) && File.Exists(configured)) return false;
                return string.Equals(Config.Str("nodeRuntime"), "echo", StringComparison.OrdinalIgnoreCase);
            }
        }

        // Environment for running NodePath; null for a real Node.
        public Dictionary<string, string> NodeEnv { get { return UsesEchoNode ? EchoNode.Env() : null; } }
    }

    public static class EchoNode
    {
        public static Dictionary<string, string> Env()
        {
            return new Dictionary<string, string> { { "ELECTRON_RUN_AS_NODE", "1" }, { "ELECTRON_NO_ASAR", "1" } };
        }

        public static Dictionary<string, string> Merge(IDictionary<string, string> first, IDictionary<string, string> second)
        {
            var merged = new Dictionary<string, string>();
            foreach (var source in new[] { first, second })
            {
                if (source == null) continue;
                foreach (var pair in source) merged[pair.Key] = pair.Value;
            }
            return merged;
        }
    }

    public static class Discovery
    {
        // Current Steam ships ECHO.exe; NEXT / Playtest / Steam are older names.
        private static readonly Regex ExePattern = new Regex(@"^(?:ECHO(?:\s+(?:NEXT|Playtest|Steam))?|EchoZankyo|echo-gpui)\.exe$", RegexOptions.IgnoreCase);

        public static bool IsEchoExe(string path)
        {
            return ExePattern.IsMatch(Path.GetFileName(path) ?? "") && path.IndexOf("\\modded-runtime\\", StringComparison.OrdinalIgnoreCase) < 0;
        }

        public static bool IsPlaytest(string exe)
        {
            var name = Path.GetFileName(exe) ?? "";
            var parent = Path.GetFileName(Path.GetDirectoryName(exe) ?? "") ?? "";
            return Regex.IsMatch(name, @"^ECHO Playtest\.exe$", RegexOptions.IgnoreCase)
                || parent.IndexOf("ECHO Playtest", StringComparison.OrdinalIgnoreCase) >= 0
                || exe.IndexOf("\\ECHO Playtest\\", StringComparison.OrdinalIgnoreCase) >= 0;
        }

        // Same ordering as Get-EchoInstallRank in setup-modloader.ps1.
        public static int RankOf(string exe)
        {
            var name = Path.GetFileName(exe) ?? "";
            var parent = Path.GetFileName(Path.GetDirectoryName(exe) ?? "") ?? "";
            if (IsPlaytest(exe)) return 80;
            if (name.Equals("ECHO NEXT.exe", StringComparison.OrdinalIgnoreCase) || parent.Equals("ECHO NEXT", StringComparison.OrdinalIgnoreCase)) return 70;
            if (Regex.IsMatch(exe, @"\\common\\ECHO\\ECHO\.exe$", RegexOptions.IgnoreCase)) return 0;
            if (name.Equals("ECHO Steam.exe", StringComparison.OrdinalIgnoreCase)) return 10;
            if (name.Equals("ECHO.exe", StringComparison.OrdinalIgnoreCase)) return 20;
            return 40;
        }

        private static void AddExesIn(string dir, HashSet<string> found, int depth)
        {
            if (depth < 0 || !Directory.Exists(dir) || Fs.IsReparsePoint(dir)) return;
            try
            {
                foreach (var file in Directory.GetFiles(dir, "ECHO*.exe"))
                {
                    if (IsEchoExe(file)) found.Add(Paths.Full(file));
                }
                if (depth == 0) return;
                foreach (var sub in Directory.GetDirectories(dir))
                {
                    var name = Path.GetFileName(sub);
                    if (name.Equals("ShinawaseLoader", StringComparison.OrdinalIgnoreCase) || name.Equals("resources", StringComparison.OrdinalIgnoreCase) || name.Equals("locales", StringComparison.OrdinalIgnoreCase)) continue;
                    AddExesIn(sub, found, depth - 1);
                }
            }
            catch { }
        }

        public static List<EchoTarget> Scan(string hint)
        {
            var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            if (!string.IsNullOrEmpty(hint))
            {
                if (File.Exists(hint) && IsEchoExe(hint)) found.Add(Paths.Full(hint));
                else if (Directory.Exists(hint)) AddExesIn(hint, found, 1);
            }
            var saved = Selection.Read().Str("echoExe");
            if (!string.IsNullOrEmpty(saved) && File.Exists(saved) && IsEchoExe(saved)) found.Add(Paths.Full(saved));
            var steamRoot = Steam.FindRoot();
            var libraries = Steam.Libraries(steamRoot);
            foreach (var library in libraries)
            {
                foreach (var app in Steam.AppManifests(library))
                {
                    if ((app.Name ?? "").IndexOf("ECHO", StringComparison.OrdinalIgnoreCase) >= 0) AddExesIn(app.InstallDir, found, 0);
                }
                var common = Path.Combine(library, "steamapps", "common");
                if (!Directory.Exists(common)) continue;
                try
                {
                    foreach (var dir in Directory.GetDirectories(common, "*ECHO*")) AddExesIn(dir, found, 1);
                }
                catch { }
            }
            var roots = new List<string>();
            foreach (var env in new[] { "ProgramFiles", "ProgramFiles(x86)" })
            {
                var value = Environment.GetEnvironmentVariable(env);
                if (!string.IsNullOrEmpty(value)) roots.Add(Path.Combine(value, "ECHO"));
            }
            var programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
            if (Directory.Exists(programs))
            {
                try { roots.AddRange(Directory.GetDirectories(programs, "*ECHO*")); } catch { }
            }
            if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SHINAWASE_STEAM_ROOT")))
            {
                foreach (var drive in DriveInfo.GetDrives())
                {
                    try
                    {
                        if (drive.DriveType != DriveType.Fixed || !drive.IsReady) continue;
                        foreach (var lib in new[] { Path.Combine(drive.RootDirectory.FullName, "SteamLibrary", "steamapps", "common"), Path.Combine(drive.RootDirectory.FullName, "steamapps", "common") })
                        {
                            if (Directory.Exists(lib)) roots.AddRange(Directory.GetDirectories(lib, "*ECHO*"));
                        }
                    }
                    catch { }
                }
            }
            foreach (var root in roots) AddExesIn(root, found, 1);
            return found.Where(File.Exists)
                .Select(EchoTarget.FromExe)
                .OrderBy(t => t.Rank)
                .ThenBy(t => t.ExePath, StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        // The automatic pick never lands on Playtest when a release exists.
        public static EchoTarget Preferred(List<EchoTarget> targets)
        {
            var saved = Selection.Read().Str("echoExe");
            var match = targets.FirstOrDefault(t => Paths.Same(t.ExePath, saved));
            if (match != null) return match;
            return targets.FirstOrDefault(t => !t.IsPlaytest) ?? targets.FirstOrDefault();
        }
    }

    public static class SystemNode
    {
        public static string OnPath()
        {
            var path = Environment.GetEnvironmentVariable("PATH") ?? "";
            foreach (var dir in path.Split(';'))
            {
                if (string.IsNullOrWhiteSpace(dir)) continue;
                try
                {
                    var candidate = Path.Combine(dir.Trim().Trim('"'), "node.exe");
                    if (File.Exists(candidate)) return candidate;
                }
                catch { }
            }
            return null;
        }

        // Same acceptance rule as Find-SystemNode: a newer major is fine, the
        // pinned major must be at least the pinned version.
        public static async Task<Tuple<string, string>> FindAsync(string minimum)
        {
            var node = OnPath();
            if (node == null) return null;
            try
            {
                var result = await Proc.RunAsync(node, new[] { "--version" }, null, null, 10000, null, CancellationToken.None);
                var text = (result.StdOut ?? "").Trim().TrimStart('v', 'V');
                Version have, min;
                if (!Version.TryParse(text, out have)) return null;
                if (!Version.TryParse((minimum ?? "").TrimStart('v', 'V'), out min)) min = have;
                if (have.Major < min.Major) return null;
                if (have.Major == min.Major && have < min) return null;
                return Tuple.Create(node, text);
            }
            catch { return null; }
        }
    }

    public enum StepState { Pending, Active, Done, Warning, Failed, Skipped }

    public sealed class StepVm : Bindable
    {
        public string Key;
        public double Weight;
        private StepState state;
        private string detail;
        private double progress = -1;

        public string Title { get { return L.T("step." + Key); } }
        public StepState State { get { return state; } set { Set(ref state, value, "State"); } }
        public string Detail { get { return detail; } set { Set(ref detail, value, "Detail"); } }
        public double Progress { get { return progress; } set { Set(ref progress, value, "Progress"); } }
        public void Relabel() { Raise("Title"); }
    }

    public sealed class PackageInfo : Bindable
    {
        public string Id;
        public string Name { get; set; }
        public string DescKey;
        public string FileName;
        private string localPath;
        private string version;
        private string installedVersion;
        private bool selected = true;
        private bool busy;

        public string Description { get { return DescKey == null ? "" : L.T(DescKey); } }
        public string LocalPath { get { return localPath; } set { Set(ref localPath, value, "LocalPath"); } }
        public string Version { get { return version; } set { if (Set(ref version, value, "Version")) Raise("ActionText"); } }
        public string InstalledVersion { get { return installedVersion; } set { if (Set(ref installedVersion, value, "InstalledVersion")) { Raise("ActionText"); Raise("CanInstall"); Raise("IsInstalled"); } } }
        public bool IsSelected { get { return selected; } set { Set(ref selected, value, "IsSelected"); } }
        public bool Busy { get { return busy; } set { if (Set(ref busy, value, "Busy")) Raise("CanInstall"); } }
        public bool IsInstalled { get { return installedVersion != null; } }
        public bool UpdateAvailable { get { return installedVersion != null && version != null && Versions.Compare(version, installedVersion) > 0; } }
        public bool CanInstall { get { return !busy && (installedVersion == null || UpdateAvailable); } }
        public string ActionText
        {
            get
            {
                if (installedVersion == null) return L.T("mods.install");
                if (UpdateAvailable) return L.F("mods.updateTo", version);
                return L.T("mods.installedTag");
            }
        }
        public string VersionText { get { return version == null ? "" : "v" + version; } }
        public void Relabel() { Raise("Description"); Raise("ActionText"); }
    }

    public static class Packages
    {
        public static List<PackageInfo> Bundled()
        {
            return new List<PackageInfo>
            {
                new PackageInfo { Id = "echo.community-streaming", Name = "ECHO Streaming", DescKey = "pkg.streaming.desc", FileName = "ECHO-Streaming.echomod" },
                new PackageInfo { Id = "echo.mv", Name = "ECHO MV", DescKey = "pkg.mv.desc", FileName = "ECHO-MV.echomod" },
                new PackageInfo { Id = "echo.lyrics-match-whitebox", Name = "ECHO Lyrics Match Whitebox", DescKey = "pkg.lyrics.desc", FileName = "ECHO-LyricsMatchWhitebox.echomod" },
            };
        }

        public static JObject ReadManifest(string echomod)
        {
            try
            {
                using (var zip = ZipFile.OpenRead(echomod))
                {
                    foreach (var name in new[] { "echo.mod.json", "echo.plugin.json", "manifest.json" })
                    {
                        var entry = zip.Entries.FirstOrDefault(e => string.Equals(e.FullName, name, StringComparison.OrdinalIgnoreCase));
                        if (entry == null) continue;
                        using (var reader = new StreamReader(entry.Open(), Encoding.UTF8)) return Json.ParseObject(reader.ReadToEnd());
                    }
                }
            }
            catch { }
            return null;
        }

        public static string InstalledVersion(EchoTarget target, string id)
        {
            if (target == null) return null;
            foreach (var pair in new[] { new[] { "Mods", "echo.mod.json" }, new[] { "Plugins", "echo.plugin.json" } })
            {
                var manifest = Json.TryReadObject(Path.Combine(target.Root, pair[0], "installed", id, pair[1]));
                if (manifest != null) return manifest.Str("version") ?? "1.0.0";
            }
            return null;
        }

        public static void Resolve(List<PackageInfo> packages, IEnumerable<string> searchDirs, EchoTarget target)
        {
            var dirs = searchDirs.Where(d => !string.IsNullOrEmpty(d) && Directory.Exists(d)).ToList();
            foreach (var package in packages)
            {
                package.LocalPath = null;
                foreach (var dir in dirs)
                {
                    var candidate = Path.Combine(dir, package.FileName);
                    if (File.Exists(candidate)) { package.LocalPath = candidate; break; }
                }
                if (package.LocalPath != null)
                {
                    var manifest = ReadManifest(package.LocalPath);
                    if (manifest != null) package.Version = manifest.Str("version");
                }
                package.InstalledVersion = InstalledVersion(target, package.Id);
            }
        }
    }

    public sealed class InstallPlan
    {
        public EchoTarget Target;
        public string SourceDir;          // a loader tree (contains ShinawaseLoader.mjs)
        public bool UseRemote;
        public string RemoteVersion;
        public List<PackageInfo> Packages = new List<PackageInfo>();
        public bool StartMenu = true;
        public bool Desktop;
        public bool SetSteam = true;
        public string Mode = "install";   // install | update | repair
        public List<string> PackageDirs = new List<string>();
        // external: ECHO.modded.exe + the Loader's self-update.
        // workshop: the ECHO Workshop item installs, starts and updates the Loader.
        public string Edition = "external";
        public string WorkshopZip;        // bundled shinawase-workshop.zip, if any
        public bool Launch;               // workshop: switch ECHO to the Mods runtime when done
    }

    // The Workshop edition ships beside the loader tree: <release>/workshop/ in a
    // release or the setup payload, <repo>/dist/ in a source checkout.
    public static class WorkshopPackage
    {
        public const string FileName = "shinawase-workshop.zip";

        public static string Find(string sourceDir)
        {
            if (string.IsNullOrEmpty(sourceDir)) return null;
            var root = Path.GetDirectoryName(sourceDir.TrimEnd('\\'));
            if (root == null) return null;
            foreach (var candidate in new[] { Path.Combine(root, "workshop", FileName), Path.Combine(root, "dist", FileName) })
            {
                if (File.Exists(candidate)) return candidate;
            }
            return null;
        }
    }

    public sealed class InstallResult
    {
        public bool Ok;
        public string FailedStep;
        public string Error;
        public string LoaderVersion;
        public string EchoVersion;
        public int PackagesInstalled;
        public List<string> Warnings = new List<string>();
        public bool AccessDenied;
        public string DeniedPath;
        public bool SteamPending;
        public bool SteamApplied;
        public bool ManagerUpdated;
        public bool Cancelled;
        public bool WorkshopImported;
        public bool Switched;
    }

    public sealed class StepFailure : Exception
    {
        public StepFailure(string message) : base(message) { }
    }

    public sealed class Installer : Bindable
    {
        private static readonly string[] CopySkip =
        {
            "node.exe", "node_modules", "loader-state.json", "loader-debug.log", "loader.config.json", "Logs", "backups",
            "modded-runtime", ".api-token", "native-host.json", ".update-staging", ".update-backup", ".processed",
            "ShinawaseManager.exe", "echo-original.ico", "ECHO.modded.exe.build", @"native\build",
        };

        public readonly ObservableCollection<StepVm> Steps = new ObservableCollection<StepVm>();
        private readonly NetState net;
        private readonly Prefs prefs;
        private double overall;
        private string nodePath;
        private bool nodeIsSystem;
        private string nodeCacheDir;
        private string source;
        private string stagedPackages;
        private readonly StringBuilder logText = new StringBuilder();

        public Installer(NetState net, Prefs prefs)
        {
            this.net = net;
            this.prefs = prefs;
        }

        public double Overall { get { return overall; } private set { Set(ref overall, value, "Overall"); } }
        // Set when the run installed a fetched remote source (staging folders).
        public string FetchedSource { get; private set; }
        public string FetchedPackages { get { return stagedPackages; } }
        public string LogText { get { lock (logText) return logText.ToString(); } }
        public event Action<string> LogAppended;

        private void Note(string message)
        {
            Log.Info(message);
            var line = "[" + DateTime.Now.ToString("HH:mm:ss", CultureInfo.InvariantCulture) + "] " + message;
            lock (logText) logText.AppendLine(line);
            var handler = LogAppended;
            if (handler != null) handler(line);
        }

        public void Prepare(InstallPlan plan)
        {
            Steps.Clear();
            Action<string, double> add = (key, weight) => Steps.Add(new StepVm { Key = key, Weight = weight });
            if (plan.Edition == "workshop")
            {
                add("prepare", 2);
                if (plan.UseRemote || string.IsNullOrEmpty(plan.WorkshopZip)) add("fetch", 14);
                add("ws.echo", 8);
                add("ws.import", 14);
                add("ws.approve", 8);
                add("ws.loader", 40);
                add("ws.switch", plan.Launch ? 14 : 4);
                Overall = 0;
                return;
            }
            add("prepare", 2);
            add("node", 14);
            if (plan.UseRemote) add("fetch", 8);
            add("copy", 5);
            add("config", 4);
            add("deps", 18);
            add("runtime", 25);
            add("host", 8);
            add("launchers", 3);
            add("packages", 8);
            if (plan.SetSteam) add("steam", 3);
            Overall = 0;
        }

        private void UpdateOverall()
        {
            var total = Steps.Sum(s => s.Weight);
            double done = 0;
            foreach (var step in Steps)
            {
                if (step.State == StepState.Done || step.State == StepState.Warning || step.State == StepState.Skipped || step.State == StepState.Failed) done += step.Weight;
                else if (step.State == StepState.Active && step.Progress > 0) done += step.Weight * Math.Min(1, step.Progress);
                else if (step.State == StepState.Active) done += step.Weight * 0.08;
            }
            Overall = total <= 0 ? 0 : Math.Min(1, done / total);
        }

        private StepVm Step(string key) { return Steps.FirstOrDefault(s => s.Key == key); }

        private async Task RunStep(string key, Func<StepVm, Task<StepState>> body, CancellationToken token)
        {
            var step = Step(key);
            if (step == null) return;
            token.ThrowIfCancellationRequested();
            step.State = StepState.Active;
            step.Progress = -1;
            PropertyChangedHandler(step);
            UpdateOverall();
            Note("== " + L.T("step." + key));
            var state = await body(step);
            step.State = state;
            step.Progress = 1;
            UpdateOverall();
        }

        private void PropertyChangedHandler(StepVm step)
        {
            step.PropertyChanged -= OnStepChanged;
            step.PropertyChanged += OnStepChanged;
        }

        private void OnStepChanged(object sender, System.ComponentModel.PropertyChangedEventArgs e)
        {
            if (e.PropertyName == "Progress") UpdateOverall();
        }

        // Shows elapsed seconds in a step's detail while a long task runs.
        private static async Task<T> WithTicker<T>(StepVm step, Func<int, string> text, Task<T> work)
        {
            var clock = Stopwatch.StartNew();
            step.Detail = text(0);
            while (true)
            {
                var finished = await Task.WhenAny(work, Task.Delay(1000));
                if (finished == work) return await work;
                step.Detail = text((int)clock.Elapsed.TotalSeconds);
            }
        }

        public async Task<InstallResult> RunAsync(InstallPlan plan, CancellationToken token)
        {
            if (plan.Edition == "workshop") return await RunWorkshopAsync(plan, token);
            var result = new InstallResult();
            var target = plan.Target;
            source = plan.SourceDir;
            stagedPackages = null;
            FetchedSource = null;
            var current = "prepare";
            Note("ShinawaseManager " + BuildInfo.Version + " · " + plan.Mode + " · " + target.ExePath);
            Note("source " + source);
            try
            {
                current = "prepare";
                await RunStep("prepare", async step =>
                {
                    if (!File.Exists(target.ExePath)) throw new StepFailure("ECHO.exe not found: " + target.ExePath);
                    if (!File.Exists(Path.Combine(source, "ShinawaseLoader.mjs"))) throw new StepFailure("Loader source is incomplete: " + source);
                    await Task.Run(() =>
                    {
                        foreach (var dir in new[] { target.LoaderRoot, Path.Combine(target.Root, "Mods"), Path.Combine(target.Root, "Plugins"), Path.Combine(target.LoaderRoot, "Logs") })
                            Directory.CreateDirectory(dir);
                        var probe = Path.Combine(target.Root, ".shinawase-write-test");
                        File.WriteAllText(probe, "ok");
                        File.Delete(probe);
                        var running = Lifecycle.EchoProcesses(target);
                        var count = running.Count;
                        foreach (var p in running) p.Dispose();
                        if (count > 0) throw new StepFailure(L.F("echoRunning.body", count));
                        Lifecycle.StopLoader(target.LoaderRoot);
                        // Installing on purpose lifts an earlier uninstall's opt-out.
                        Fs.TryDelete(Path.Combine(target.Root, ".shinawase-uninstalled"));
                    });
                    return StepState.Done;
                }, token);

                current = "node";
                var localInfo = LoaderVersionInfo.Read(source);
                if (localInfo == null) throw new StepFailure("loader-version.json is missing from " + source);
                await RunStep("node", step => EnsureNode(localInfo, step, token), token);

                if (plan.UseRemote)
                {
                    current = "fetch";
                    await RunStep("fetch", async step =>
                    {
                        var fetched = await FetchRemote(plan, step, token);
                        if (fetched == null) return StepState.Skipped;
                        var remoteInfo = LoaderVersionInfo.Read(fetched);
                        if (remoteInfo != null && remoteInfo.NodeVersion != localInfo.NodeVersion)
                        {
                            Note("remote pins Node " + remoteInfo.NodeVersion);
                            await EnsureNode(remoteInfo, step, token);
                        }
                        source = fetched;
                        FetchedSource = fetched;
                        return StepState.Done;
                    }, token);
                }

                current = "copy";
                await RunStep("copy", async step =>
                {
                    if (Paths.Same(source, target.LoaderRoot))
                    {
                        step.Detail = L.T("d.copy.same");
                        return StepState.Skipped;
                    }
                    var count = 0;
                    await Task.Run(() => Fs.CopyTree(source, target.LoaderRoot, CopySkip, file =>
                    {
                        count++;
                        if (count % 25 == 0) step.Detail = L.F("d.copy.files", count);
                    }));
                    step.Detail = L.F("d.copy.files", count);
                    Note("copied " + count + " files");
                    return StepState.Done;
                }, token);

                current = "config";
                await RunStep("config", async step =>
                {
                    var runtime = await Task.Run(() => PlaceNode(target));
                    var config = Json.TryReadObject(Path.Combine(target.LoaderRoot, "loader.config.json"))
                        ?? Json.TryReadObject(Path.Combine(source, "loader.config.json"))
                        ?? new JObject();
                    config["runtimePath"] = runtime;
                    if (!config.ContainsKey("autoStart")) config["autoStart"] = false;
                    if (!config.ContainsKey("autoStartMode")) config["autoStartMode"] = "manual";
                    config["loadMode"] = "external-cdp";
                    config["locale"] = L.Locale;
                    Json.WriteObject(Path.Combine(target.LoaderRoot, "loader.config.json"), config);
                    var init = await Proc.RunAsync(runtime, new[] { Path.Combine(target.LoaderRoot, "ShinawaseLoader.mjs"), "init" }, target.LoaderRoot, null, 120000, null, token);
                    if (init.ExitCode != 0) throw new StepFailure("ShinawaseLoader.mjs init: " + init.Tail(6));
                    step.Detail = runtime;
                    return StepState.Done;
                }, token);

                current = "deps";
                await RunStep("deps", step => InstallDeps(target, step, result, token), token);
                // Enable the asar bridge only once the bridge's dependencies had their chance.
                var finalConfig = Json.TryReadObject(Path.Combine(target.LoaderRoot, "loader.config.json")) ?? new JObject();
                finalConfig["autoStart"] = !target.IsZankyo;
                finalConfig["autoStartMode"] = target.IsZankyo ? "manual" : "app-asar-bridge";
                Json.WriteObject(Path.Combine(target.LoaderRoot, "loader.config.json"), finalConfig);

                current = "runtime";
                await RunStep("runtime", async step =>
                {
                    var sync = Path.Combine(target.LoaderRoot, "runtime-sync.mjs");
                    var run = Proc.RunAsync(nodeForTarget(target), new[] { sync, "--echo", target.Root, "--loader", target.LoaderRoot, "--force", "--skip-update" }, target.LoaderRoot, null, 15 * 60 * 1000, null, token);
                    var output = await WithTicker(step, s => L.F("d.runtime.copy", s), run);
                    var json = ParseLooseJson(output.StdOut);
                    if (output.ExitCode != 0)
                    {
                        var detail = json != null && json.Str("error") != null ? json.Str("error") : output.Tail(6);
                        throw new StepFailure("runtime-sync: " + (string.IsNullOrEmpty(detail) ? "exit " + output.ExitCode : detail));
                    }
                    result.EchoVersion = json == null ? null : json.Str("echoVersion");
                    step.Detail = L.F("d.runtime.done", result.EchoVersion ?? "?", json == null ? "" : json.Str("status"));
                    Note("runtime " + step.Detail + " patch=" + (json == null ? "?" : json.Str("patch")));
                    return StepState.Done;
                }, token);

                current = "host";
                await RunStep("host", async step =>
                {
                    step.Detail = L.T("d.host.compile");
                    await Task.Run(() => BuildModdedHost(target));
                    step.Detail = target.ModdedExe;
                    return StepState.Done;
                }, token);

                current = "launchers";
                await RunStep("launchers", async step =>
                {
                    var warnings = await Task.Run(() => WriteLaunchers(target, plan, result));
                    foreach (var warning in warnings) { result.Warnings.Add(warning); Note("warning: " + warning); }
                    return warnings.Count > 0 ? StepState.Warning : StepState.Done;
                }, token);

                current = "packages";
                await RunStep("packages", step => ImportPackages(plan, step, result, token), token);

                if (plan.SetSteam)
                {
                    current = "steam";
                    await RunStep("steam", async step =>
                    {
                        var info = await Task.Run(() => Steam.Inspect(target.Root));
                        if (!info.Found || string.IsNullOrEmpty(info.AppId) || info.Accounts.Count == 0)
                        {
                            step.Detail = !info.Found ? L.T("tile.steam.noSteam") : (string.IsNullOrEmpty(info.AppId) ? L.T("tile.steam.noApp") : L.T("steam.noAccounts"));
                            return StepState.Skipped;
                        }
                        if (info.Relevant.All(a => a.State == "set"))
                        {
                            result.SteamApplied = true;
                            step.Detail = L.F("steam.applied", info.Relevant.Count);
                            return StepState.Done;
                        }
                        if (Steam.IsRunning(info))
                        {
                            result.SteamPending = true;
                            step.Detail = L.T("d.steam.waiting");
                            return StepState.Warning;
                        }
                        var written = await Task.Run(() => Steam.Apply(info, info.Relevant, target.Root, prefs));
                        result.SteamApplied = written > 0;
                        step.Detail = L.F("steam.applied", written);
                        return StepState.Done;
                    }, token);
                }

                Selection.Update(new Dictionary<string, object> { { "echoExe", target.ExePath }, { "locale", L.Locale }, { "selectedAt", DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) } });
                target.Refresh();
                result.Ok = true;
                result.LoaderVersion = target.LoaderVersion;
                // Both editions share this folder; record which one setup installed.
                var workshopState = Json.TryReadObject(target.WorkshopState);
                if (workshopState != null)
                {
                    workshopState["edition"] = "external";
                    Json.WriteObject(target.WorkshopState, workshopState);
                    target.Refresh();
                }
                Note("done · loader " + result.LoaderVersion);
            }
            catch (OperationCanceledException)
            {
                result.Cancelled = true;
                result.FailedStep = current;
                result.Error = L.T("wiz.cancelling");
                MarkFailed(current);
                Note("cancelled at " + current);
            }
            catch (Exception error)
            {
                var denied = FindAccessDenied(error);
                result.FailedStep = current;
                result.Error = error is StepFailure ? error.Message : error.GetType().Name + ": " + error.Message;
                if (denied != null)
                {
                    result.AccessDenied = true;
                    result.DeniedPath = target.Root;
                }
                MarkFailed(current);
                Note("FAILED at " + current + ": " + result.Error);
                Log.Error(error.ToString());
            }
            UpdateOverall();
            return result;
        }

        // ---- Workshop edition ------------------------------------------------
        // Mirrors workshop-setup.mjs: ECHO imports shinawase-workshop.zip through its
        // own Workshop page and asks the user for the system:full approval in its own
        // dialog; the item's trusted module then installs the Loader. Everything runs
        // on ECHO's executable in Node mode, so this edition needs no Node download.
        private static readonly string[] WorkshopStages = { "ws.echo", "ws.import", "ws.approve", "ws.loader", "ws.switch" };

        private async Task<InstallResult> RunWorkshopAsync(InstallPlan plan, CancellationToken token)
        {
            var result = new InstallResult();
            var target = plan.Target;
            source = plan.SourceDir;
            stagedPackages = null;
            FetchedSource = null;
            var current = "prepare";
            Note("ShinawaseManager " + BuildInfo.Version + " · workshop " + plan.Mode + " · " + target.ExePath);
            try
            {
                var script = Path.Combine(source, "workshop-setup.mjs");
                await RunStep("prepare", async step =>
                {
                    if (!File.Exists(target.ExePath)) throw new StepFailure("ECHO.exe not found: " + target.ExePath);
                    if (target.IsZankyo) throw new StepFailure("Workshop edition is not supported for ECHO Zankyo (GPUI); use the external edition.");
                    if (!File.Exists(script)) throw new StepFailure("workshop-setup.mjs is missing from " + source);
                    await Task.Run(() =>
                    {
                        Directory.CreateDirectory(target.LoaderRoot);
                        var running = Lifecycle.EchoProcesses(target);
                        var count = running.Count;
                        foreach (var p in running) p.Dispose();
                        if (count > 0) throw new StepFailure(L.F("echoRunning.body", count));
                    });
                    return StepState.Done;
                }, token);

                var zip = plan.WorkshopZip;
                if (Step("fetch") != null)
                {
                    current = "fetch";
                    await RunStep("fetch", async step =>
                    {
                        zip = await FetchWorkshop(plan, step, token);
                        return StepState.Done;
                    }, token);
                }
                if (string.IsNullOrEmpty(zip) || !File.Exists(zip)) throw new StepFailure(L.T("ws.noZip"));

                var args = new List<string> { script, "install", "--echo", target.Root, "--zip", zip };
                if (!plan.Launch) args.Add("--no-switch");
                string active = null;
                JObject final = null;
                Action<string> enter = key =>
                {
                    if (active == key) return;
                    var started = false;
                    foreach (var name in WorkshopStages)
                    {
                        var step = Step(name);
                        if (step == null) continue;
                        if (name == key) { started = true; step.State = StepState.Active; step.Progress = -1; PropertyChangedHandler(step); Note("== " + L.T("step." + name)); break; }
                        if (step.State == StepState.Active || step.State == StepState.Pending) step.State = step.State == StepState.Active ? StepState.Done : StepState.Skipped;
                    }
                    if (started) { active = key; current = key; }
                    UpdateOverall();
                };
                var run = Proc.RunAsync(target.ExePath, args, target.Root, EchoNode.Env(), 60 * 60 * 1000, line =>
                {
                    JObject evt;
                    try { evt = Json.ParseObject(line); } catch { return; }
                    var kind = evt.Str("event");
                    if (kind == "result") { final = evt; return; }
                    if (kind == "log") { Note("workshop: " + evt.Str("message")); return; }
                    if (kind != "stage") return;
                    switch (evt.Str("stage"))
                    {
                        case "zip": Note("workshop item " + evt.Str("version") + " · loader " + evt.Str("loaderVersion")); break;
                        case "echo": enter("ws.echo"); Step("ws.echo").Detail = L.T("d.ws.echo"); break;
                        case "import":
                            enter("ws.import");
                            if (evt.Bool("already") == true) { Step("ws.import").Detail = L.T("d.ws.current"); }
                            else Step("ws.import").Detail = L.T("d.ws.import");
                            break;
                        case "approve": enter("ws.approve"); Step("ws.approve").Detail = L.T("d.ws.approve"); break;
                        case "loader":
                            enter("ws.loader");
                            var percent = evt.Num("percent");
                            var loaderStep = Step("ws.loader");
                            if (percent.HasValue && percent.Value > 0) loaderStep.Progress = Math.Min(1, percent.Value / 100.0);
                            loaderStep.Detail = string.IsNullOrEmpty(evt.Str("step")) ? L.T("d.ws.loader") : L.F("d.ws.loaderStep", evt.Str("step"));
                            UpdateOverall();
                            break;
                        case "switch": enter("ws.switch"); Step("ws.switch").Detail = plan.Launch ? L.T("d.ws.switch") : L.T("d.ws.close"); break;
                    }
                }, token);
                var output = await run;
                if (final == null || final.Bool("ok") != true)
                {
                    var reason = final != null ? final.Str("error") : output.Tail(6);
                    throw new StepFailure(WorkshopError(reason));
                }
                foreach (var name in WorkshopStages)
                {
                    var step = Step(name);
                    if (step == null) continue;
                    if (step.State == StepState.Active) step.State = StepState.Done;
                    else if (step.State == StepState.Pending) step.State = StepState.Skipped;
                    step.Progress = 1;
                }
                Selection.Update(new Dictionary<string, object> { { "echoExe", target.ExePath }, { "locale", L.Locale }, { "selectedAt", DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) } });
                target.Refresh();
                result.Ok = true;
                result.LoaderVersion = final.Str("loaderVersion") ?? target.LoaderVersion;
                result.EchoVersion = target.EchoVersion;
                result.WorkshopImported = final.Bool("imported") == true;
                result.Switched = final.Bool("switched") == true;
                Note("done · workshop · loader " + result.LoaderVersion);
            }
            catch (OperationCanceledException)
            {
                result.Cancelled = true;
                result.FailedStep = current;
                result.Error = L.T("wiz.cancelling");
                MarkFailed(current);
            }
            catch (Exception error)
            {
                result.FailedStep = current;
                result.Error = error is StepFailure ? error.Message : error.GetType().Name + ": " + error.Message;
                MarkFailed(current);
                Note("FAILED at " + current + ": " + result.Error);
                Log.Error(error.ToString());
            }
            UpdateOverall();
            return result;
        }

        private static string WorkshopError(string reason)
        {
            if (string.IsNullOrEmpty(reason)) return L.T("ws.err.unknown");
            if (reason == "approval_declined") return L.T("ws.err.declined");
            if (reason == "approval_timeout") return L.T("ws.err.timeout");
            if (reason == "echo_already_running") return L.T("ws.err.running");
            if (reason.StartsWith("workshop_zip_", StringComparison.Ordinal)) return L.F("ws.err.zip", reason);
            return reason;
        }

        // The Workshop zip of the newest release: signed mirror first, then the
        // GitHub release asset; the helper checks it carries the expected Loader.
        private async Task<string> FetchWorkshop(InstallPlan plan, StepVm step, CancellationToken token)
        {
            var helper = Path.Combine(plan.SourceDir, "manager", "manager-helper.mjs");
            if (!File.Exists(helper)) throw new StepFailure("manager-helper.mjs is missing");
            var staging = Path.Combine(Paths.UserDataRoot, "staging-workshop");
            Fs.TryDelete(staging);
            Directory.CreateDirectory(staging);
            var dest = Path.Combine(staging, WorkshopPackage.FileName);
            var args = new List<string> { helper, "fetch-workshop", "--dest", dest, "--cache", Path.Combine(Paths.UserDataRoot, "update-cache") };
            args.AddRange(net.HelperMirrorArgs());
            step.Detail = L.T("d.fetch.check");
            JObject final = null;
            var run = Proc.RunAsync(plan.Target.ExePath, args, staging, EchoNode.Env(), 20 * 60 * 1000, line =>
            {
                JObject evt;
                try { evt = Json.ParseObject(line); } catch { return; }
                var kind = evt.Str("event");
                if (kind == "result") final = evt;
                else if (kind == "stage") step.Detail = L.F("d.fetch.get", evt.Str("label") ?? evt.Str("stage"));
                else if (kind == "log") Note("helper: " + evt.Str("message"));
            }, token);
            var output = await WithTicker(step, s => step.Detail, run);
            if (final == null || final.Bool("ok") != true)
            {
                if (!string.IsNullOrEmpty(plan.WorkshopZip) && File.Exists(plan.WorkshopZip))
                {
                    Note("fetch-workshop failed, using the bundled zip: " + (final != null ? final.Str("error") : output.Tail(3)));
                    step.Detail = L.T("d.ws.bundled");
                    return plan.WorkshopZip;
                }
                throw new StepFailure("fetch: " + (final != null ? final.Str("error") : output.Tail(6)));
            }
            step.Detail = "v" + final.Str("loaderVersion") + " · " + final.Str("via");
            Note("fetched workshop " + final.Str("version") + " via " + final.Str("via"));
            return final.Str("path");
        }

        private static Exception FindAccessDenied(Exception error)
        {
            for (var e = error; e != null; e = e.InnerException)
            {
                if (e is UnauthorizedAccessException) return e;
                var io = e as IOException;
                if (io != null && (Marshal.GetHRForException(io) & 0xFFFF) == 5) return e;
                if (e.Message.IndexOf("EPERM", StringComparison.Ordinal) >= 0 || e.Message.IndexOf("EACCES", StringComparison.Ordinal) >= 0) return e;
            }
            return null;
        }

        private void MarkFailed(string key)
        {
            var step = Step(key);
            if (step != null) step.State = StepState.Failed;
        }

        private string nodeForTarget(EchoTarget target)
        {
            var bundled = Path.Combine(target.LoaderRoot, "node.exe");
            return File.Exists(bundled) ? bundled : nodePath;
        }

        private static JObject ParseLooseJson(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            var start = text.IndexOf('{');
            var end = text.LastIndexOf('}');
            if (start < 0 || end <= start) return null;
            try { return Json.ParseObject(text.Substring(start, end - start + 1)); } catch { return null; }
        }

        // ---- Node -------------------------------------------------------------
        private async Task<StepState> EnsureNode(LoaderVersionInfo info, StepVm step, CancellationToken token)
        {
            if (string.IsNullOrEmpty(info.NodeVersion) || !Regex.IsMatch(info.NodeVersion, @"^\d+\.\d+\.\d+$")) throw new StepFailure("Invalid nodeVersion in loader-version.json");
            var system = await SystemNode.FindAsync(info.NodeVersion);
            if (system != null)
            {
                nodePath = system.Item1;
                nodeIsSystem = true;
                nodeCacheDir = Path.GetDirectoryName(system.Item1);
                step.Detail = L.F("d.node.system", system.Item2);
                Note("system node " + system.Item1 + " v" + system.Item2);
                return StepState.Done;
            }
            nodeIsSystem = false;
            var cacheDir = Path.Combine(Paths.RuntimeCache, "node-" + info.NodeVersion);
            var cachedNode = Path.Combine(cacheDir, "node.exe");
            var cachedNpm = Path.Combine(cacheDir, "node_modules", "npm", "bin", "npm-cli.js");
            if (File.Exists(cachedNode) && File.Exists(cachedNpm))
            {
                nodePath = cachedNode;
                nodeCacheDir = cacheDir;
                step.Detail = L.F("d.node.cached", info.NodeVersion);
                return StepState.Done;
            }
            // Fail closed: a version file without a pin must not turn the check off.
            if (string.IsNullOrEmpty(info.NodeSha256)) throw new StepFailure("loader-version.json has no nodeSha256; refusing an unverified Node archive.");
            Directory.CreateDirectory(Paths.RuntimeCache);
            var zip = Path.Combine(Paths.RuntimeCache, "node-" + info.NodeVersion + ".zip");
            var fetched = false;
            string lastError = null;
            foreach (var candidate in net.NodeCandidates(info.NodeVersion))
            {
                token.ThrowIfCancellationRequested();
                step.Detail = L.F("d.node.connecting", candidate.Label);
                step.Progress = -1;
                Note("node source " + candidate.Label + " " + candidate.Url);
                try
                {
                    var label = candidate.Label;
                    var progress = new Progress<DownloadProgress>(p =>
                    {
                        if (p.Total > 0) step.Progress = (double)p.Received / p.Total * 0.92;
                        step.Detail = L.F("d.node.download", Fs.FormatBytes(p.Received), p.Total > 0 ? Fs.FormatBytes(p.Total) : "?", Fs.FormatBytes(p.BytesPerSecond), label);
                    });
                    await Net.DownloadAsync(candidate.Url, zip, candidate.ConnectMs, 20000, 160L * 1024 * 1024, label, progress, token);
                    step.Detail = L.T("d.node.verify");
                    var hash = await Task.Run(() => Fs.Sha256File(zip));
                    if (!string.Equals(hash, info.NodeSha256, StringComparison.OrdinalIgnoreCase)) throw new NetError("sha256_mismatch", label);
                    fetched = true;
                    break;
                }
                catch (OperationCanceledException) { Fs.TryDelete(zip); Fs.TryDelete(zip + ".part"); throw; }
                catch (Exception error)
                {
                    lastError = error.Message;
                    Note("  failed: " + error.Message);
                    Fs.TryDelete(zip);
                    Fs.TryDelete(zip + ".part");
                    step.Detail = L.F("d.node.next", candidate.Label);
                }
            }
            if (!fetched) throw new StepFailure("Node download failed: " + lastError);
            step.Detail = L.T("d.node.extract");
            step.Progress = 0.95;
            var extract = Path.Combine(Paths.RuntimeCache, ".node-" + Guid.NewGuid().ToString("N"));
            try
            {
                await Task.Run(() =>
                {
                    ZipFile.ExtractToDirectory(zip, extract);
                    var exe = Directory.GetFiles(extract, "node.exe", SearchOption.AllDirectories).FirstOrDefault();
                    if (exe == null) throw new StepFailure("node.exe was not found in the downloaded archive.");
                    Fs.CopyTree(Path.GetDirectoryName(exe), cacheDir, null, null);
                });
            }
            finally
            {
                Fs.TryDelete(zip);
                Fs.TryDelete(extract);
            }
            nodePath = cachedNode;
            nodeCacheDir = cacheDir;
            step.Detail = L.F("d.node.cached", info.NodeVersion);
            return StepState.Done;
        }

        // Copies the portable Node (and its npm) next to the loader like the
        // PowerShell installer; a system Node is referenced in place.
        private string PlaceNode(EchoTarget target)
        {
            if (nodeIsSystem) return nodePath;
            var local = Path.Combine(target.LoaderRoot, "node.exe");
            try
            {
                Fs.CopyFile(nodePath, local);
                foreach (var name in new[] { "npm.cmd", "npm", "npx.cmd", "npx", "corepack.cmd", "corepack" })
                {
                    var src = Path.Combine(nodeCacheDir, name);
                    if (File.Exists(src)) Fs.CopyFile(src, Path.Combine(target.LoaderRoot, name));
                }
                var npmSrc = Path.Combine(nodeCacheDir, "node_modules", "npm");
                if (Directory.Exists(npmSrc)) Fs.CopyTree(npmSrc, Path.Combine(target.LoaderRoot, "node_modules", "npm"), null, null);
                nodePath = local;
                return local;
            }
            catch (Exception error)
            {
                Note("node copy failed, using cache: " + error.Message);
                return nodePath;
            }
        }

        // ---- remote source ------------------------------------------------------
        private async Task<string> FetchRemote(InstallPlan plan, StepVm step, CancellationToken token)
        {
            var helper = Path.Combine(plan.SourceDir, "manager", "manager-helper.mjs");
            if (!File.Exists(helper)) throw new StepFailure("manager-helper.mjs is missing");
            var staging = Path.Combine(Paths.UserDataRoot, "staging");
            Fs.TryDelete(staging);
            Directory.CreateDirectory(staging);
            var args = new List<string> { helper, "fetch", "--dest", staging, "--cache", Path.Combine(Paths.UserDataRoot, "update-cache") };
            args.AddRange(net.HelperMirrorArgs());
            var wanted = plan.Packages.Where(p => p.IsSelected).Select(p => p.Id).ToList();
            if (wanted.Count > 0) { args.Add("--packages"); args.Add(string.Join(",", wanted)); }
            step.Detail = L.T("d.fetch.check");
            JObject final = null;
            var run = Proc.RunAsync(nodePath, args, staging, null, 20 * 60 * 1000, line =>
            {
                JObject evt;
                try { evt = Json.ParseObject(line); } catch { return; }
                var kind = evt.Str("event");
                if (kind == "result") final = evt;
                else if (kind == "stage") step.Detail = L.F("d.fetch.get", evt.Str("label") ?? evt.Str("stage"));
                else if (kind == "log") Note("helper: " + evt.Str("message"));
            }, token);
            var output = await WithTicker(step, s => step.Detail, run);
            if (final == null || final.Bool("ok") != true)
            {
                var reason = final != null ? final.Str("error") : output.Tail(6);
                throw new StepFailure("fetch: " + reason);
            }
            var loaderDir = final.Str("loaderDir");
            if (string.IsNullOrEmpty(loaderDir) || !File.Exists(Path.Combine(loaderDir, "ShinawaseLoader.mjs"))) throw new StepFailure("fetch: archive has no loader");
            stagedPackages = Path.Combine(staging, "packages");
            plan.PackageDirs.Insert(0, stagedPackages);
            step.Detail = "v" + final.Str("version") + " · " + final.Str("via");
            Note("fetched loader " + final.Str("version") + " via " + final.Str("via"));
            return loaderDir;
        }

        // ---- npm ----------------------------------------------------------------
        private async Task<StepState> InstallDeps(EchoTarget target, StepVm step, InstallResult result, CancellationToken token)
        {
            var root = target.LoaderRoot;
            if (!File.Exists(Path.Combine(root, "package.json"))) { step.Detail = L.T("d.steam.skip"); return StepState.Skipped; }
            var node = nodeForTarget(target);
            var npmCli = Path.Combine(root, "node_modules", "npm", "bin", "npm-cli.js");
            if (!File.Exists(npmCli)) npmCli = Path.Combine(Path.GetDirectoryName(node) ?? "", "node_modules", "npm", "bin", "npm-cli.js");
            var marker = Path.Combine(root, "node_modules", "@neteasecloudmusicapienhanced", "api", "package.json");
            var lockFile = Path.Combine(root, "package-lock.json");
            var stamp = Path.Combine(root, "node_modules", ".shinawase-deps-lock.sha256");
            var lockHash = File.Exists(lockFile) ? Fs.Sha256File(lockFile).ToUpperInvariant() : "";
            if (lockHash.Length > 0 && File.Exists(marker) && File.Exists(stamp) && string.Equals(File.ReadAllText(stamp).Trim(), lockHash, StringComparison.OrdinalIgnoreCase))
            {
                step.Detail = L.T("d.deps.cached");
                return StepState.Done;
            }
            if (!File.Exists(npmCli)) throw new StepFailure("npm-cli.js not found next to " + node);
            var lastError = "";
            foreach (var registry in net.NpmRegistries())
            {
                token.ThrowIfCancellationRequested();
                var label = registry.Label;
                Note("npm registry " + registry.Url);
                var env = new Dictionary<string, string> { { "npm_config_registry", registry.Url }, { "npm_config_engine_strict", "false" }, { "npm_config_update_notifier", "false" } };
                var args = new List<string> { npmCli, "install", "--omit=dev", "--no-audit", "--no-fund", "--engine-strict=false", "--replace-registry-host=always", "--fetch-timeout=30000", "--fetch-retries=1", "--registry=" + registry.Url };
                var run = Proc.RunAsync(node, args, root, env, registry.TimeoutSec * 1000, null, token);
                var output = await WithTicker(step, s => L.F("d.deps.via", label, s), run);
                if (output.ExitCode == 0 && File.Exists(marker))
                {
                    if (lockHash.Length > 0) File.WriteAllText(stamp, lockHash);
                    step.Detail = label;
                    return StepState.Done;
                }
                lastError = output.TimedOut ? "timeout" : output.Tail(4);
                Note("  npm via " + label + " failed: " + lastError);
            }
            var warning = L.F("d.deps.warn", string.IsNullOrEmpty(lastError) ? "?" : lastError);
            if (warning.Length > 220) warning = warning.Substring(0, 220) + "…";
            result.Warnings.Add(warning);
            step.Detail = warning;
            return StepState.Warning;
        }

        // ---- ECHO.modded.exe ----------------------------------------------------
        public static string FindCsc()
        {
            var windir = Environment.GetEnvironmentVariable("WINDIR") ?? @"C:\Windows";
            foreach (var path in new[] { Path.Combine(windir, @"Microsoft.NET\Framework64\v4.0.30319\csc.exe"), Path.Combine(windir, @"Microsoft.NET\Framework\v4.0.30319\csc.exe") })
            {
                if (File.Exists(path)) return path;
            }
            return null;
        }

        private void BuildModdedHost(EchoTarget target)
        {
            var sourceFile = Path.Combine(target.LoaderRoot, "modded-host.cs");
            if (!File.Exists(sourceFile)) throw new StepFailure("modded-host.cs is missing");
            var icon = Path.Combine(target.LoaderRoot, "echo-original.ico");
            using (var extracted = System.Drawing.Icon.ExtractAssociatedIcon(target.ExePath))
            {
                if (extracted == null) throw new StepFailure("Could not extract the icon from " + target.ExePath);
                using (var stream = File.Create(icon)) extracted.Save(stream);
            }
            var csc = FindCsc();
            if (csc == null) throw new StepFailure("Microsoft C# compiler was not found; cannot create ECHO.modded.exe.");
            var built = Path.Combine(target.LoaderRoot, "ECHO.modded.exe.build");
            var run = Proc.RunAsync(csc, new[] { "/nologo", "/target:winexe", "/optimize+", "/win32icon:" + icon, "/out:" + built, sourceFile }, target.LoaderRoot, null, 120000, null, CancellationToken.None).Result;
            if (run.ExitCode != 0 || !File.Exists(built)) throw new StepFailure("ECHO.modded.exe compilation failed: " + run.Tail(6));
            try { Fs.CopyFile(built, target.ModdedExe); }
            catch (Exception error) { throw new StepFailure("Cannot write " + target.ModdedExe + " (quit any running ECHO.modded.exe / ECHO.exe and retry): " + error.Message); }
            finally { Fs.TryDelete(built); }
        }

        // ---- launchers ----------------------------------------------------------
        private static void WriteCmd(string path, IEnumerable<string> lines)
        {
            File.WriteAllText(path, string.Join("\r\n", lines) + "\r\n", new UTF8Encoding(true));
        }

        private List<string> WriteLaunchers(EchoTarget target, InstallPlan plan, InstallResult result)
        {
            var warnings = new List<string>();
            var escapedRoot = target.Root.Replace("%", "%%");
            var node = nodeForTarget(target);
            WriteCmd(Path.Combine(target.LoaderRoot, "start-echo-with-mods.cmd"), new[] { "@echo off", "chcp 65001 >nul", "cd /d \"" + escapedRoot + "\"", "start \"\" \"" + target.ModdedExe + "\" %*" });
            var specs = new[] { new[] { "start-echo-debug.cmd", "run --debug --log-level debug" }, new[] { "start-echo-safe.cmd", "run --safe-mode" }, new[] { "attach-to-echo.cmd", "attach" } };
            foreach (var spec in specs)
            {
                WriteCmd(Path.Combine(target.LoaderRoot, spec[0]), new[] { "@echo off", "chcp 65001 >nul", "cd /d \"" + escapedRoot + "\"", "start \"\" \"" + node + "\" \"%~dp0ShinawaseLoader.mjs\" " + spec[1] + " --echo \"" + target.ExePath + "\" %*" });
            }
            var managerExe = Path.Combine(target.LoaderRoot, "ShinawaseManager.exe");
            // With ShinawaseSetup.exe installed, the app owns the Start menu entry
            // and the game folder needs no second copy of the manager.
            var appDir = AppInstall.InstalledDir();
            try
            {
                if (appDir == null && ManagerBuild.Deploy(Path.Combine(target.LoaderRoot, "manager"), managerExe)) result.ManagerUpdated = true;
            }
            catch (Exception error) { warnings.Add("Shinawase Manager: " + error.Message); }
            try
            {
                var startMenu = Shortcuts.StartMenuPath();
                if (plan.StartMenu && appDir == null && File.Exists(managerExe)) Shortcuts.Create(startMenu, managerExe, "", target.LoaderRoot, managerExe + ",0", "Shinawase Manager");
                var desktop = Shortcuts.DesktopPath();
                if (plan.Desktop) Shortcuts.Create(desktop, target.ModdedExe, "", target.Root, target.ModdedExe + ",0", "ECHO with Mods");
            }
            catch (Exception error) { warnings.Add("Shortcut: " + error.Message); }
            return warnings;
        }

        // ---- packages -----------------------------------------------------------
        private async Task<StepState> ImportPackages(InstallPlan plan, StepVm step, InstallResult result, CancellationToken token)
        {
            var target = plan.Target;
            var chosen = plan.Packages.Where(p => p.IsSelected).ToList();
            if (chosen.Count == 0) { step.Detail = L.T("d.packages.none"); return StepState.Skipped; }
            Packages.Resolve(chosen, plan.PackageDirs, target);
            var missing = chosen.Where(p => p.LocalPath == null).ToList();
            if (missing.Count > 0)
            {
                step.Detail = L.F("d.packages.fetch", string.Join(", ", missing.Select(p => p.Name)));
                try { await FetchPackages(plan, missing, token); }
                catch (OperationCanceledException) { throw; }
                catch (Exception error) { Note("package download failed: " + error.Message); }
                Packages.Resolve(chosen, plan.PackageDirs, target);
            }
            var state = StepState.Done;
            var index = 0;
            foreach (var package in chosen)
            {
                token.ThrowIfCancellationRequested();
                index++;
                step.Progress = (double)(index - 1) / chosen.Count;
                step.Detail = L.F("d.packages.item", package.Name);
                if (package.LocalPath == null)
                {
                    result.Warnings.Add(package.Name + ": package file not found");
                    state = StepState.Warning;
                    continue;
                }
                var run = await LoaderOps.RunAsync(target, nodeForTarget(target), token, "import", package.LocalPath, "--enable");
                if (run.ExitCode != 0)
                {
                    result.Warnings.Add(package.Name + ": " + run.Tail(3));
                    Note("import " + package.Id + " failed: " + run.Tail(6));
                    state = StepState.Warning;
                    continue;
                }
                result.PackagesInstalled++;
                Note("imported " + package.Id + " " + package.Version);
            }
            step.Detail = L.F("wiz.sumPackages", result.PackagesInstalled);
            return state;
        }

        private async Task FetchPackages(InstallPlan plan, List<PackageInfo> missing, CancellationToken token)
        {
            var helper = Path.Combine(plan.SourceDir, "manager", "manager-helper.mjs");
            if (!File.Exists(helper)) helper = Path.Combine(plan.Target.LoaderRoot, "manager", "manager-helper.mjs");
            if (!File.Exists(helper)) throw new FileNotFoundException("manager-helper.mjs");
            var dest = Path.Combine(Paths.UserDataRoot, "staging-packages");
            Fs.TryDelete(dest);
            Directory.CreateDirectory(dest);
            var args = new List<string> { helper, "fetch", "--no-loader", "--dest", dest, "--cache", Path.Combine(Paths.UserDataRoot, "update-cache"), "--packages", string.Join(",", missing.Select(p => p.Id)) };
            args.AddRange(net.HelperMirrorArgs());
            var run = await Proc.RunAsync(nodeForTarget(plan.Target), args, dest, null, 10 * 60 * 1000, null, token);
            if (run.ExitCode != 0) throw new StepFailure(run.Tail(4));
            plan.PackageDirs.Add(Path.Combine(dest, "packages"));
        }
    }

    public static class LoaderOps
    {
        public static Task<ProcResult> RunAsync(EchoTarget target, string node, CancellationToken token, params string[] args)
        {
            var env = new Dictionary<string, string> { { "ECHO_MOD_HOME", target.LoaderRoot }, { "ECHO_GAME_ROOT", target.Root }, { "NO_COLOR", "1" } };
            var all = new List<string> { Path.Combine(target.LoaderRoot, "ShinawaseLoader.mjs") };
            all.AddRange(args);
            return Proc.RunAsync(node ?? target.NodePath, all, target.LoaderRoot, node == null ? EchoNode.Merge(env, target.NodeEnv) : env, 180000, null, token);
        }

        public static List<ModVm> ReadMods(EchoTarget target)
        {
            var output = new List<ModVm>();
            if (target == null || !target.Installed) return output;
            var state = Json.TryReadObject(Path.Combine(target.LoaderRoot, "loader-state.json"));
            var mods = state == null ? null : state.Obj("mods");
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var kind in new[] { "mod", "plugin" })
            {
                var dir = Path.Combine(target.Root, kind == "plugin" ? "Plugins" : "Mods", "installed");
                if (!Directory.Exists(dir)) continue;
                foreach (var packageDir in Directory.GetDirectories(dir))
                {
                    var id = Path.GetFileName(packageDir);
                    if (!Regex.IsMatch(id, @"^[a-z0-9][a-z0-9._-]{1,63}$", RegexOptions.IgnoreCase) || !seen.Add(id)) continue;
                    JObject manifest = null;
                    foreach (var name in new[] { "echo.mod.json", "echo.plugin.json", "manifest.json" })
                    {
                        manifest = Json.TryReadObject(Path.Combine(packageDir, name));
                        if (manifest != null) break;
                    }
                    if (manifest == null) continue;
                    var entry = mods == null ? null : mods.Obj(id);
                    var vm = new ModVm
                    {
                        Id = id,
                        Kind = kind,
                        Name = manifest.Str("name") ?? id,
                        Version = manifest.Str("version") ?? "1.0.0",
                        Description = manifest.Str("description") ?? "",
                        Directory = packageDir,
                    };
                    vm.SetEnabled(entry != null && entry.Bool("enabled") == true);
                    vm.Icon = LoadIcon(packageDir, manifest.Str("icon"));
                    output.Add(vm);
                }
            }
            return output.OrderBy(m => m.Name, StringComparer.CurrentCultureIgnoreCase).ToList();
        }

        private static ImageSource LoadIcon(string dir, string relative)
        {
            if (string.IsNullOrEmpty(relative)) return null;
            try
            {
                var clean = relative.Replace('/', '\\').TrimStart('\\');
                if (clean.Contains("..")) return null;
                var path = Path.Combine(dir, clean);
                var ext = Path.GetExtension(path).ToLowerInvariant();
                if (!File.Exists(path) || (ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".ico" && ext != ".gif" && ext != ".bmp")) return null;
                var image = new BitmapImage();
                image.BeginInit();
                image.CacheOption = BitmapCacheOption.OnLoad;
                image.DecodePixelWidth = 96;
                image.UriSource = new Uri(path);
                image.EndInit();
                image.Freeze();
                return image;
            }
            catch { return null; }
        }
    }

    public sealed class ModVm : Bindable
    {
        public string Id;
        public string Kind;
        public string Name;
        public string Version;
        public string Description;
        public string Directory;
        private bool enabled;
        private bool busy;
        private ImageSource icon;

        public string Title { get { return Name; } }
        public string Meta { get { return "v" + Version + "  ·  " + Id; } }
        public string Desc { get { return Description; } }
        public string KindText { get { return Kind == "plugin" ? "Plugin" : "Mod"; } }
        public bool Enabled { get { return enabled; } }
        public void SetEnabled(bool value) { Set(ref enabled, value, "Enabled"); }
        public void Reset() { Raise("Enabled"); }
        public bool Busy { get { return busy; } set { if (Set(ref busy, value, "Busy")) Raise("Idle"); } }
        public bool Idle { get { return !busy; } }
        public ImageSource Icon { get { return icon; } set { if (Set(ref icon, value, "Icon")) Raise("HasIcon"); } }
        public bool HasIcon { get { return icon != null; } }
        public string Initial { get { return string.IsNullOrEmpty(Name) ? "?" : Name.Substring(0, 1).ToUpperInvariant(); } }
        public Brush AvatarBrush
        {
            get
            {
                var hues = new[] { "#5B66F0", "#E0679B", "#2EA67A", "#E59A2F", "#3E9BE0", "#9A6AE6", "#D2553F" };
                var hash = 0;
                foreach (var ch in Id ?? "") hash = (hash * 31 + ch) & 0x7fffffff;
                var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hues[hash % hues.Length]));
                brush.Freeze();
                return brush;
            }
        }
    }

    public sealed class RunStatus
    {
        public bool StockRunning;
        public bool ModdedRunning;
        public bool Cdp;
        public bool LoaderApi;
        public bool Any { get { return StockRunning || ModdedRunning; } }
    }

    public sealed class LaunchOutcome
    {
        public bool Started;
        public bool CdpReady;
        public bool AlreadyRunning;
        public string Error;
        public int Port;
    }

    public static class Lifecycle
    {
        public static List<Process> EchoProcesses(EchoTarget target)
        {
            return Proc.FindByImage(
                new[] { Path.Combine(target.Root, "ECHO.exe"), Path.Combine(target.Root, "EchoZankyo.exe"), Path.Combine(target.Root, "echo-gpui.exe"), target.ModdedExe, target.RuntimeExe },
                "ECHO", "ECHO.modded", "EchoZankyo", "echo-gpui");
        }

        public static void StopLoader(string loaderRoot)
        {
            try
            {
                using (var searcher = new ManagementObjectSearcher("SELECT ProcessId, CommandLine FROM Win32_Process WHERE Name = 'node.exe'"))
                {
                    foreach (ManagementObject item in searcher.Get())
                    {
                        using (item)
                        {
                            var command = Convert.ToString(item["CommandLine"]);
                            if (command.IndexOf(loaderRoot, StringComparison.OrdinalIgnoreCase) < 0 || command.IndexOf("ShinawaseLoader.mjs", StringComparison.OrdinalIgnoreCase) < 0) continue;
                            try
                            {
                                using (var process = Process.GetProcessById(Convert.ToInt32(item["ProcessId"])))
                                {
                                    process.Kill();
                                    process.WaitForExit(3000);
                                }
                            }
                            catch { }
                        }
                    }
                }
            }
            catch (Exception error) { Log.Warn("stop loader: " + error.Message); }
        }

        // Asks ECHO windows to close first; whatever is left after the grace
        // period is ended. Only processes of this installation are touched.
        public static async Task<bool> CloseEchoAsync(EchoTarget target)
        {
            var processes = EchoProcesses(target);
            if (processes.Count == 0) return true;
            foreach (var process in processes)
            {
                try { if (process.MainWindowHandle != IntPtr.Zero) process.CloseMainWindow(); } catch { }
            }
            for (var i = 0; i < 16; i++)
            {
                await Task.Delay(500);
                if (processes.All(p => { try { return p.HasExited; } catch { return true; } })) break;
            }
            foreach (var process in processes)
            {
                try { if (!process.HasExited) Proc.KillTree(process); } catch { }
                process.Dispose();
            }
            await Task.Delay(800);
            var left = EchoProcesses(target);
            var ok = left.Count == 0;
            foreach (var p in left) p.Dispose();
            return ok;
        }

        public static async Task<bool> CdpAsync(int port)
        {
            try
            {
                var text = await Net.GetStringAsync("http://127.0.0.1:" + port + "/json/list", 900, 2 * 1024 * 1024);
                var list = Json.Parse(text) as List<object>;
                return list != null && list.OfType<JObject>().Any(t => t.Str("type") == "page" && !string.IsNullOrEmpty(t.Str("webSocketDebuggerUrl")));
            }
            catch { return false; }
        }

        public static async Task<bool> LoaderApiAsync(int port)
        {
            try
            {
                var text = await Net.GetStringAsync("http://127.0.0.1:" + port + "/api/status", 900, 4 * 1024 * 1024);
                return Json.ParseObject(text).Bool("ok") == true;
            }
            catch { return false; }
        }

        public static async Task<bool> ZankyoAsync(int port)
        {
            try
            {
                var text = await Net.GetStringAsync("http://127.0.0.1:" + port + "/api/status", 900, 4 * 1024 * 1024);
                var status = Json.ParseObject(text);
                var native = status.Obj("zankyo");
                return status.Str("runtime") == "gpui" && native != null && native.Bool("connected") == true;
            }
            catch { return false; }
        }

        public static async Task<RunStatus> StatusAsync(EchoTarget target)
        {
            var status = new RunStatus();
            if (target == null) return status;
            var processes = await Task.Run(() => EchoProcesses(target));
            var windowlessStock = 0;
            var stock = 0;
            foreach (var process in processes)
            {
                var image = Proc.ImagePath(process);
                if (Paths.Same(image, target.RuntimeExe) || Paths.Same(image, target.ModdedExe)) status.ModdedRunning = true;
                else
                {
                    stock++;
                    try { if (process.MainWindowHandle == IntPtr.Zero) windowlessStock++; } catch { }
                }
                process.Dispose();
            }
            // The Workshop edition's launcher is ECHO.exe in Node mode (no window)
            // that stays alive beside the Mods runtime; it is not a stock ECHO.
            status.StockRunning = stock > 0 && !(status.ModdedRunning && target.IsWorkshop && windowlessStock == stock);
            if (status.ModdedRunning)
            {
                var cdp = target.IsZankyo ? ZankyoAsync(target.ApiPort) : CdpAsync(target.DebugPort);
                var api = LoaderApiAsync(target.ApiPort);
                status.Cdp = await cdp;
                status.LoaderApi = await api;
            }
            return status;
        }

        public static async Task<LaunchOutcome> LaunchAsync(EchoTarget target, CancellationToken token)
        {
            var outcome = new LaunchOutcome { Port = target.DebugPort };
            // The Workshop edition has no ECHO.modded.exe: the same host runs as
            // echo-modded-host.mjs on ECHO's own executable in Node mode.
            var useNodeHost = !File.Exists(target.ModdedExe) && target.IsWorkshop && File.Exists(target.HostScript) && File.Exists(target.ExePath);
            if (!File.Exists(target.ModdedExe) && !useNodeHost) { outcome.Error = "ECHO.modded.exe is missing"; return outcome; }
            var status = await StatusAsync(target);
            if (status.ModdedRunning && status.Cdp)
            {
                outcome.AlreadyRunning = true;
                outcome.Started = true;
                outcome.CdpReady = true;
                return outcome;
            }
            Process host;
            try
            {
                if (useNodeHost)
                {
                    var info = new ProcessStartInfo(target.ExePath, Proc.Quote(target.HostScript)) { WorkingDirectory = target.Root, UseShellExecute = false, CreateNoWindow = true };
                    foreach (var pair in EchoNode.Env()) info.EnvironmentVariables[pair.Key] = pair.Value;
                    info.EnvironmentVariables["ECHO_GAME_ROOT"] = target.Root;
                    info.EnvironmentVariables["ECHO_MOD_HOME"] = target.LoaderRoot;
                    host = Process.Start(info);
                }
                else host = Process.Start(new ProcessStartInfo(target.ModdedExe) { WorkingDirectory = target.Root, UseShellExecute = false });
            }
            catch (Exception error) { outcome.Error = error.Message; return outcome; }
            outcome.Started = true;
            // ECHO.modded.exe runs the loader's auto-update (capped at 45 s) and the
            // runtime sync before ECHO itself, so give CDP a generous window.
            var deadline = DateTime.UtcNow.AddSeconds(120);
            while (DateTime.UtcNow < deadline)
            {
                token.ThrowIfCancellationRequested();
                if (await (target.IsZankyo ? ZankyoAsync(target.ApiPort) : CdpAsync(outcome.Port))) { outcome.CdpReady = true; break; }
                if (host != null && host.HasExited)
                {
                    var code = host.ExitCode;
                    if (code == 4) outcome.Error = L.T("toast.alreadyRunning");
                    else if (code != 0) outcome.Error = (useNodeHost ? "echo-modded-host.mjs" : "ECHO.modded.exe") + " exit " + code + " (" + Path.Combine(target.LoaderRoot, "Logs", "modded-host.log") + ")";
                    if (code != 0) break;
                }
                await Task.Delay(800, token);
            }
            if (host != null) host.Dispose();
            return outcome;
        }

        public static void RunLauncher(EchoTarget target, string cmdName)
        {
            var path = Path.Combine(target.LoaderRoot, cmdName);
            if (!File.Exists(path)) throw new FileNotFoundException(cmdName);
            Process.Start(new ProcessStartInfo(path) { UseShellExecute = true, WorkingDirectory = target.Root, WindowStyle = ProcessWindowStyle.Minimized });
        }

        public static void Uninstall(EchoTarget target)
        {
            StopLoader(target.LoaderRoot);
            if (File.Exists(target.ModdedExe)) File.Delete(target.ModdedExe);
            foreach (var link in new[] { Shortcuts.StartMenuPath(), Shortcuts.DesktopPath() })
            {
                var pointsHere = Shortcuts.Target(link);
                if (pointsHere != null && (Paths.IsUnder(pointsHere, target.LoaderRoot) || Paths.Same(pointsHere, target.ModdedExe))) Fs.TryDelete(link);
            }
            // Never follows the runtime's junctions into the Steam folder.
            if (Directory.Exists(target.LoaderRoot))
            {
                var self = Assembly.GetEntryAssembly().Location;
                if (Paths.IsUnder(self, target.LoaderRoot))
                {
                    // Cannot delete our own running image: remove everything else
                    // and leave the manager to be cleaned on its next start.
                    foreach (var entry in new DirectoryInfo(target.LoaderRoot).GetFileSystemInfos())
                    {
                        if (Paths.Same(entry.FullName, self)) continue;
                        if ((entry.Attributes & FileAttributes.Directory) != 0) Fs.DeleteTree(entry.FullName);
                        else { File.SetAttributes(entry.FullName, FileAttributes.Normal); File.Delete(entry.FullName); }
                    }
                }
                else Fs.DeleteTree(target.LoaderRoot);
            }
            // An enabled ShinawaseLoader Workshop item would reinstall the Loader on
            // ECHO's next start; this marker (workshop-bootstrap.mjs OPT_OUT_FILE)
            // stops that until the user installs again on purpose.
            try { File.WriteAllText(Path.Combine(target.Root, ".shinawase-uninstalled"), DateTime.UtcNow.ToString("o", CultureInfo.InvariantCulture) + Environment.NewLine); }
            catch (Exception error) { Log.Warn("uninstall marker: " + error.Message); }
            target.Refresh();
        }
    }

    public static class Shortcuts
    {
        public static string StartMenuPath()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Shinawase Manager.lnk");
        }

        public static string DesktopPath()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "ECHO (Mods).lnk");
        }

        public static string DesktopManagerPath()
        {
            return Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "Shinawase Manager.lnk");
        }

        public static bool PointsInto(string link, string dir)
        {
            var target = Target(link);
            return target != null && Paths.IsUnder(target, dir);
        }

        public static void Create(string path, string target, string arguments, string workDir, string icon, string description)
        {
            var type = Type.GetTypeFromProgID("WScript.Shell");
            object shell = null;
            object link = null;
            try
            {
                shell = Activator.CreateInstance(type);
                link = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                var linkType = link.GetType();
                linkType.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
                linkType.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { arguments ?? "" });
                linkType.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link, new object[] { workDir });
                linkType.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link, new object[] { icon });
                linkType.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { description });
                linkType.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
            }
            finally
            {
                if (link != null) Marshal.FinalReleaseComObject(link);
                if (shell != null) Marshal.FinalReleaseComObject(shell);
            }
        }

        public static string Target(string path)
        {
            if (!File.Exists(path)) return null;
            var type = Type.GetTypeFromProgID("WScript.Shell");
            object shell = null;
            object link = null;
            try
            {
                shell = Activator.CreateInstance(type);
                link = type.InvokeMember("CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { path });
                return Convert.ToString(link.GetType().InvokeMember("TargetPath", BindingFlags.GetProperty, null, link, null));
            }
            catch { return null; }
            finally
            {
                if (link != null) Marshal.FinalReleaseComObject(link);
                if (shell != null) Marshal.FinalReleaseComObject(shell);
            }
        }
    }

    // The manager compiles itself the same way the installer compiles
    // modded-host.cs: from the sources shipped in ShinawaseLoader/manager with the
    // .NET Framework compiler. BuildInfo.SourceHash says which sources the
    // running binary came from, so an unchanged tree is copied instead.
    public static class ManagerBuild
    {
        public static readonly string[] ReferenceNames =
        {
            "System.dll", "System.Core.dll", "System.Xml.dll", "System.Xaml.dll", "System.Drawing.dll", "System.Management.dll", "System.Windows.Forms.dll",
            "System.Net.Http.dll", "System.IO.Compression.dll", "System.IO.Compression.FileSystem.dll", "Microsoft.CSharp.dll",
            @"WPF\PresentationFramework.dll", @"WPF\PresentationCore.dll", @"WPF\WindowsBase.dll",
        };

        public static string SourceHash(string dir)
        {
            var files = Directory.GetFiles(dir).Where(f => f.EndsWith(".cs", StringComparison.OrdinalIgnoreCase) || f.EndsWith(".xaml", StringComparison.OrdinalIgnoreCase))
                .OrderBy(f => Path.GetFileName(f).ToLowerInvariant(), StringComparer.Ordinal).ToList();
            var sb = new StringBuilder();
            foreach (var file in files)
            {
                sb.Append(Path.GetFileName(file).ToLowerInvariant()).Append('\n');
                sb.Append(File.ReadAllText(file, Encoding.UTF8).Replace("\r", "")).Append('\n');
            }
            return Fs.Sha256Text(sb.ToString());
        }

        // Returns true when a different (newer) manager binary was written.
        public static bool Deploy(string sourceDir, string targetExe)
        {
            var self = Assembly.GetEntryAssembly().Location;
            if (!Directory.Exists(sourceDir)) return false;
            foreach (var stale in Directory.GetFiles(Path.GetDirectoryName(targetExe), Path.GetFileName(targetExe) + ".old-*")) Fs.TryDelete(stale);
            var hash = SourceHash(sourceDir);
            if (hash == BuildInfo.SourceHash)
            {
                if (Paths.Same(self, targetExe)) return false;
                ReplaceExe(self, targetExe);
                return false;
            }
            var temp = Path.Combine(Path.GetTempPath(), "shinawase-manager-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(temp);
            try
            {
                var icon = Path.Combine(temp, "app.ico");
                IconArt.WriteIco(icon);
                var built = Compile(sourceDir, Path.Combine(temp, "ShinawaseManager.exe"), icon, LoaderVersionInfo.Read(Path.GetDirectoryName(sourceDir)), hash);
                ReplaceExe(built, targetExe);
                return true;
            }
            finally { Fs.TryDelete(temp); }
        }

        public static void ReplaceExe(string source, string targetExe)
        {
            if (File.Exists(targetExe))
            {
                try { File.Delete(targetExe); }
                catch
                {
                    // A running image cannot be deleted but can be renamed.
                    File.Move(targetExe, targetExe + ".old-" + DateTime.UtcNow.Ticks);
                }
            }
            File.Copy(source, targetExe, true);
        }

        public static string Compile(string sourceDir, string outExe, string icon, LoaderVersionInfo version, string hash)
        {
            var csc = Installer.FindCsc();
            if (csc == null) throw new InvalidOperationException("csc.exe not found");
            var frameworkDir = Path.GetDirectoryName(csc);
            var info = Path.Combine(Path.GetDirectoryName(outExe), "BuildInfo.g.cs");
            File.WriteAllText(info, "namespace Shinawase.Manager { public static class BuildInfo { public const string Version = \"" + (version == null ? "0.0.0" : version.Version) + "\"; public const string SourceHash = \"" + hash + "\"; } }\n", new UTF8Encoding(false));
            var args = new List<string> { "/nologo", "/target:winexe", "/optimize+", "/codepage:65001", "/out:" + outExe };
            if (icon != null) args.Add("/win32icon:" + icon);
            foreach (var xaml in Directory.GetFiles(sourceDir, "*.xaml").OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
                args.Add("/resource:" + xaml + ",Shinawase.Manager." + Path.GetFileName(xaml));
            foreach (var reference in ReferenceNames) args.Add("/r:" + Path.Combine(frameworkDir, reference));
            args.AddRange(Directory.GetFiles(sourceDir, "*.cs").OrderBy(f => f, StringComparer.OrdinalIgnoreCase));
            args.Add(info);
            var run = Proc.RunAsync(csc, args, sourceDir, null, 180000, null, CancellationToken.None).Result;
            if (run.ExitCode != 0 || !File.Exists(outExe)) throw new InvalidOperationException("manager compile failed: " + run.Tail(8));
            return outExe;
        }
    }
}
