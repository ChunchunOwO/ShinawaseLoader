using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32;
using Microsoft.UI;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using WinRT.Interop;

namespace Echo.AudioBand;

internal static class Native
{
    private const int GwlExstyle = -20;
    private const int GwlStyle = -16;
    private const int GwlpHwndParent = -8;
    private const int WsExToolwindow = 0x00000080;
    private const int WsExNoactivate = 0x08000000;
    private const int WsExAppwindow = 0x00040000;
    private const int WsExTopmost = 0x00000008;
    private const int WsCaption = 0x00C00000;
    private const int WsThickframe = 0x00040000;
    private const int WsSysmenu = 0x00080000;
    private const int WsMinimizebox = 0x00020000;
    private const int WsMaximizebox = 0x00010000;
    private const int WsBorder = 0x00800000;
    private const int WsDlgframe = 0x00400000;
    private const int WsPopup = unchecked((int)0x80000000);
    private const int HwndTopmost = -1;
    private const uint SwpNosize = 0x0001;
    private const uint SwpNomove = 0x0002;
    private const uint SwpNozorder = 0x0004;
    private const uint SwpNoactivate = 0x0010;
    private const uint SwpFramechanged = 0x0020;
    private const uint SwpHidewindow = 0x0080;
    private const int SwShowna = 8;
    private const uint EventSystemForeground = 0x0003;
    private const uint EventSystemMinimizeStart = 0x0016;
    private const uint EventSystemMinimizeEnd = 0x0017;
    private const uint WineventOutofcontext = 0;
    private const uint WmWindowposchanging = 0x0046;
    private const uint WmShowwindow = 0x0018;
    private const int DwmwaCloak = 13;
    private const int DwmwaCloaked = 14;
    private const int GclpHbrBackground = -10;
    private const uint MonitorDefaultToNearest = 2;
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaWindowCornerPreference = 33;
    private const int DwmwaBorderColor = 34;
    private const int DwmwaCaptionColor = 35;
    private const int DwmwaColorNone = unchecked((int)0xFFFFFFFE);
    private const int DwmwcpDonotround = 1;
    private const int DwmwcpRoundSmall = 3;

    private static readonly string[] ShellClasses =
    [
        "Shell_TrayWnd",
        "Shell_SecondaryTrayWnd",
        "Progman",
        "WorkerW",
        "NotifyIconOverflowWindow",
        "ForegroundStaging",
        "ImmersiveLauncher",
        "Windows.UI.Core.CoreWindow",
    ];

    private delegate bool EnumProc(nint hwnd, nint lParam);
    private delegate void WinEventDelegate(nint hWinEventHook, uint eventType, nint hwnd, int idObject, int idChild, uint dwEventThread, uint dwmsEventTime);
    private delegate nint SubclassProc(nint hWnd, uint uMsg, nint wParam, nint lParam, nuint uIdSubclass, nuint dwRefData);

    private static readonly WinEventDelegate ForegroundHook = OnWinEvent;
    private static readonly SubclassProc BandSubclass = OnSubclass;
    private static Action? _shellPulse;
    private static Func<bool>? _stayVisible;
    private static nint _foregroundHook;
    private static nint _minimizeHook;
    private static nint _subclassHwnd;

    [StructLayout(LayoutKind.Sequential)]
    private struct Rect
    {
        public int Left, Top, Right, Bottom;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowPos
    {
        public nint Hwnd;
        public nint HwndInsertAfter;
        public int X, Y, Cx, Cy;
        public uint Flags;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MonitorInfo
    {
        public int CbSize;
        public Rect RcMonitor;
        public Rect RcWork;
        public uint DwFlags;
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern nint FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern nint FindWindowEx(nint hwndParent, nint hwndChildAfter, string? lpszClass, string? lpszWindow);

    [DllImport("user32.dll")]
    private static extern bool GetWindowRect(nint hWnd, out Rect lpRect);

    [DllImport("user32.dll")]
    private static extern nint GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern nint MonitorFromWindow(nint hwnd, uint dwFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, EntryPoint = "GetMonitorInfoW")]
    private static extern bool GetMonitorInfo(nint hMonitor, ref MonitorInfo lpmi);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetClassName(nint hWnd, StringBuilder lpClassName, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool EnumWindows(EnumProc lpEnumFunc, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(nint hWndParent, EnumProc lpEnumFunc, nint lParam);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern nint GetWindowLongPtr64(nint hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongW")]
    private static extern int GetWindowLong32(nint hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern nint SetWindowLongPtr64(nint hWnd, int nIndex, nint dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongW")]
    private static extern int SetWindowLong32(nint hWnd, int nIndex, int dwNewLong);

    [DllImport("user32.dll")]
    private static extern bool SetWindowPos(nint hWnd, nint hWndInsertAfter, int x, int y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetWindowText(nint hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    private static extern bool IsWindowVisible(nint hWnd);

    [DllImport("user32.dll")]
    private static extern int SetWindowRgn(nint hWnd, nint hRgn, bool bRedraw);

    [DllImport("gdi32.dll")]
    private static extern nint CreateRoundRectRgn(int nLeftRect, int nTopRect, int nRightRect, int nBottomRect, int nWidthEllipse, int nHeightEllipse);

    [DllImport("user32.dll")]
    private static extern bool IsIconic(nint hWnd);

    [DllImport("user32.dll")]
    private static extern nint SetWinEventHook(uint eventMin, uint eventMax, nint hmodWinEventProc, WinEventDelegate lpfnWinEventProc, uint idProcess, uint idThread, uint dwFlags);

    [DllImport("user32.dll")]
    private static extern bool UnhookWinEvent(nint hWinEventHook);

    [DllImport("comctl32.dll", ExactSpelling = true)]
    private static extern bool SetWindowSubclass(nint hWnd, SubclassProc pfnSubclass, nuint uIdSubclass, nuint dwRefData);

    [DllImport("comctl32.dll", ExactSpelling = true)]
    private static extern bool RemoveWindowSubclass(nint hWnd, SubclassProc pfnSubclass, nuint uIdSubclass);

    [DllImport("comctl32.dll", ExactSpelling = true)]
    private static extern nint DefSubclassProc(nint hWnd, uint uMsg, nint wParam, nint lParam);

    [DllImport("user32.dll")]
    private static extern bool SetForegroundWindow(nint hWnd);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(nint hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(nint hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentThreadId();

    [DllImport("kernel32.dll")]
    private static extern uint GetCurrentProcessId();

    [DllImport("gdi32.dll")]
    private static extern nint CreateSolidBrush(uint crColor);

    [DllImport("user32.dll", EntryPoint = "SetClassLongPtrW")]
    private static extern nint SetClassLongPtr64(nint hWnd, int nIndex, nint dwNewLong);

    [DllImport("user32.dll", EntryPoint = "SetClassLongW")]
    private static extern int SetClassLong32(nint hWnd, int nIndex, int dwNewLong);

    private static nint _darkBrush;

    [DllImport("user32.dll")]
    private static extern bool AllowSetForegroundWindow(int dwProcessId);

    [StructLayout(LayoutKind.Sequential)]
    private struct Margins
    {
        public int CxLeftWidth, CxRightWidth, CyTopHeight, CyBottomHeight;
    }

    [DllImport("dwmapi.dll")]
    private static extern int DwmGetWindowAttribute(nint hwnd, int dwAttribute, out int pvAttribute, int cbAttribute);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(nint hwnd, int dwAttribute, ref int pvAttribute, int cbAttribute);

    [DllImport("dwmapi.dll")]
    private static extern int DwmExtendFrameIntoClientArea(nint hwnd, ref Margins pMarInset);

    [DllImport("shell32.dll")]
    private static extern int SHQueryUserNotificationState(out int pquns);

    public static bool IsWindows11
    {
        get
        {
            try { return Environment.OSVersion.Version.Build >= 22000; }
            catch { return false; }
        }
    }

    public static nint HwndOf(Window window)
    {
        try { return WindowNative.GetWindowHandle(window); }
        catch { return 0; }
    }

    public static AppWindow? AppWindowOf(Window window)
    {
        try
        {
            var hwnd = HwndOf(window);
            if (hwnd == 0) return null;
            return AppWindow.GetFromWindowId(Win32Interop.GetWindowIdFromWindow(hwnd));
        }
        catch
        {
            return null;
        }
    }

    public static bool ApplyToolWindow(nint hwnd) => ApplyPopupChrome(hwnd);

    public static bool ApplyPopupChrome(nint hwnd, bool extendFrame = false, bool glassCaption = false)
    {
        if (hwnd == 0) return false;
        try
        {
            var style = GetWindowLong(hwnd, GwlStyle);
            var nextStyle = style;
            nextStyle &= unchecked((nint)~(WsCaption | WsThickframe | WsSysmenu | WsMinimizebox | WsMaximizebox | WsBorder | WsDlgframe));
            nextStyle |= unchecked((nint)WsPopup);
            if (nextStyle != style) SetWindowLong(hwnd, GwlStyle, nextStyle);

            var ex = GetWindowLong(hwnd, GwlExstyle);
            var nextEx = ex | (nint)(WsExToolwindow | WsExNoactivate | WsExTopmost);
            nextEx &= ~(nint)WsExAppwindow;
            if (nextEx != ex) SetWindowLong(hwnd, GwlExstyle, nextEx);

            if (glassCaption)
            {
                var none = DwmwaColorNone;
                _ = DwmSetWindowAttribute(hwnd, DwmwaBorderColor, ref none, sizeof(int));
                _ = DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref none, sizeof(int));
            }
            var dark = 1;
            _ = DwmSetWindowAttribute(hwnd, DwmwaUseImmersiveDarkMode, ref dark, sizeof(int));
            if (extendFrame)
            {
                var margins = new Margins { CxLeftWidth = -1, CxRightWidth = -1, CyTopHeight = -1, CyBottomHeight = -1 };
                _ = DwmExtendFrameIntoClientArea(hwnd, ref margins);
            }
            else
            {
                var margins = new Margins();
                _ = DwmExtendFrameIntoClientArea(hwnd, ref margins);
            }
            SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpNoactivate | SwpFramechanged);
            return nextStyle != style || nextEx != ex;
        }
        catch
        {
            return false;
        }
    }

    public static void ApplyCaptionColor(nint hwnd, bool dark)
    {
        if (hwnd == 0) return;
        try
        {
            var color = dark ? 0x00101010 : 0x00F3F3F3;
            _ = DwmSetWindowAttribute(hwnd, DwmwaCaptionColor, ref color, sizeof(int));
            _ = DwmSetWindowAttribute(hwnd, DwmwaBorderColor, ref color, sizeof(int));
        }
        catch { }
    }

    public static void Cloak(nint hwnd, bool cloak)
    {
        if (hwnd == 0) return;
        try
        {
            var value = cloak ? 1 : 0;
            _ = DwmSetWindowAttribute(hwnd, DwmwaCloak, ref value, sizeof(int));
        }
        catch { }
    }

    public static void SetDarkClassBrush(nint hwnd)
    {
        if (hwnd == 0) return;
        try
        {
            if (_darkBrush == 0) _darkBrush = CreateSolidBrush(0x00101010);
            if (_darkBrush == 0) return;
            if (nint.Size == 8) SetClassLongPtr64(hwnd, GclpHbrBackground, _darkBrush);
            else SetClassLong32(hwnd, GclpHbrBackground, (int)_darkBrush);
        }
        catch { }
    }

    public static void RaiseTopmost(nint hwnd)
    {
        if (hwnd == 0) return;
        try { SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpNoactivate); } catch { }
    }

    public static void ApplyCorners(nint hwnd, bool round)
    {
        if (hwnd == 0) return;
        try
        {
            var pref = round ? DwmwcpRoundSmall : DwmwcpDonotround;
            _ = DwmSetWindowAttribute(hwnd, DwmwaWindowCornerPreference, ref pref, sizeof(int));
        }
        catch { }
    }

    public static void ApplyRoundRegion(nint hwnd, int radius)
    {
        if (hwnd == 0 || radius <= 0) return;
        try
        {
            var rect = FromHwnd(hwnd);
            if (rect is not { } r || r.W < 8 || r.H < 8) return;
            var rgn = CreateRoundRectRgn(0, 0, r.W + 1, r.H + 1, radius * 2, radius * 2);
            if (rgn != 0) SetWindowRgn(hwnd, rgn, true);
        }
        catch { }
    }

    public static void WatchShell(nint hwnd, Action pulse, Func<bool> stayVisible)
    {
        _shellPulse = pulse;
        _stayVisible = stayVisible;
        try
        {
            if (_foregroundHook == 0)
            {
                _foregroundHook = SetWinEventHook(EventSystemForeground, EventSystemForeground, 0, ForegroundHook, 0, 0, WineventOutofcontext);
            }
        }
        catch { }
    }

    public static void StopWatch(nint hwnd)
    {
        _shellPulse = null;
        _stayVisible = null;
        try { if (_foregroundHook != 0) UnhookWinEvent(_foregroundHook); } catch { }
        try { if (_minimizeHook != 0) UnhookWinEvent(_minimizeHook); } catch { }
        _foregroundHook = 0;
        _minimizeHook = 0;
        try
        {
            if (hwnd != 0) RemoveWindowSubclass(hwnd, BandSubclass, 1);
            else if (_subclassHwnd != 0) RemoveWindowSubclass(_subclassHwnd, BandSubclass, 1);
        }
        catch { }
        _subclassHwnd = 0;
    }

    public static void KeepOnTaskbar(nint hwnd, nint owner = 0)
    {
        if (hwnd == 0) return;
        try
        {
            var tray = owner != 0 ? owner : PickTrayHwnd(hwnd);
            if (tray != 0 && GetWindowLong(hwnd, GwlpHwndParent) != tray)
            {
                SetWindowLong(hwnd, GwlpHwndParent, tray);
            }
            SetWindowPos(hwnd, HwndTopmost, 0, 0, 0, 0, SwpNomove | SwpNosize | SwpNoactivate);
        }
        catch { }
    }

    public static bool IsOnScreen(nint hwnd)
    {
        if (hwnd == 0) return false;
        try
        {
            if (!IsWindowVisible(hwnd) || IsIconic(hwnd)) return false;
            if (DwmGetWindowAttribute(hwnd, DwmwaCloaked, out var cloaked, sizeof(int)) == 0 && cloaked != 0) return false;
            var rect = FromHwnd(hwnd);
            return rect is { } r && r.W > 8 && r.H > 8;
        }
        catch
        {
            return false;
        }
    }

    public static void Reveal(nint hwnd)
    {
        if (hwnd == 0) return;
        try
        {
            if (IsIconic(hwnd) || !IsWindowVisible(hwnd)) ShowWindow(hwnd, SwShowna);
            if (DwmGetWindowAttribute(hwnd, DwmwaCloaked, out var cloaked, sizeof(int)) == 0 && cloaked != 0)
            {
                var zero = 0;
                _ = DwmSetWindowAttribute(hwnd, DwmwaCloaked, ref zero, sizeof(int));
                ShowWindow(hwnd, SwShowna);
            }
            KeepOnTaskbar(hwnd);
        }
        catch { }
    }

    public static bool IsShowDesktop()
    {
        try
        {
            var cls = ClassName(GetForegroundWindow());
            return cls is "Progman" or "WorkerW" or "ForegroundStaging" or "Shell_TrayWnd" or "Shell_SecondaryTrayWnd";
        }
        catch
        {
            return false;
        }
    }

    private static void OnWinEvent(nint hook, uint eventType, nint hwnd, int idObject, int idChild, uint thread, uint time)
    {
        try { _shellPulse?.Invoke(); } catch { }
    }

    private static nint OnSubclass(nint hWnd, uint msg, nint wParam, nint lParam, nuint id, nuint data)
        => DefSubclassProc(hWnd, msg, wParam, lParam);

    private static string ClassName(nint hwnd)
    {
        if (hwnd == 0) return "";
        var name = new StringBuilder(256);
        return GetClassName(hwnd, name, name.Capacity) > 0 ? name.ToString() : "";
    }

    public static bool FocusEcho()
    {
        nint best = 0;
        var bestArea = 0;
        EnumWindows((hwnd, _) =>
        {
            try
            {
                if (!IsWindowVisible(hwnd)) return true;
                var cls = new StringBuilder(64);
                if (GetClassName(hwnd, cls, cls.Capacity) <= 0) return true;
                if (!cls.ToString().StartsWith("Chrome_WidgetWin", StringComparison.OrdinalIgnoreCase)) return true;
                var title = new StringBuilder(512);
                if (GetWindowText(hwnd, title, title.Capacity) <= 0) return true;
                var name = title.ToString();
                if (name.Contains("AudioBand", StringComparison.OrdinalIgnoreCase)) return true;
                if (name.Contains("Taskbar Mini Player", StringComparison.OrdinalIgnoreCase)) return true;
                if (name.Contains("Desktop Lyrics", StringComparison.OrdinalIgnoreCase)) return true;
                if (name.Contains("ECHO Pet", StringComparison.OrdinalIgnoreCase)) return true;
                var rect = FromHwnd(hwnd);
                if (rect is not { } r || r.W < 240 || r.H < 180) return true;
                var area = r.W * r.H;
                if (area > bestArea)
                {
                    bestArea = area;
                    best = hwnd;
                }
            }
            catch { }
            return true;
        }, 0);
        if (best == 0) return false;
        try
        {
            ShowWindow(best, 9);
            var fg = GetForegroundWindow();
            var fgThread = GetWindowThreadProcessId(fg, out _);
            var self = GetCurrentThreadId();
            if (fgThread != 0 && fgThread != self) AttachThreadInput(self, fgThread, true);
            AllowSetForegroundWindow(-1);
            SetForegroundWindow(best);
            SetWindowPos(best, 0, 0, 0, 0, 0, SwpNomove | SwpNosize);
            SetForegroundWindow(best);
            if (fgThread != 0 && fgThread != self) AttachThreadInput(self, fgThread, false);
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static bool TryMove(AppWindow app, RectI geo, bool keepOnTaskbar = true)
    {
        try
        {
            var cur = app.Position;
            var size = app.Size;
            if (cur.X == geo.X && cur.Y == geo.Y && size.Width == geo.W && size.Height == geo.H) return false;
            app.MoveAndResize(new Windows.Graphics.RectInt32(geo.X, geo.Y, geo.W, geo.H));
            if (keepOnTaskbar)
            {
                try
                {
                    var hwnd = Win32Interop.GetWindowFromWindowId(app.Id);
                    KeepOnTaskbar(hwnd);
                }
                catch { }
            }
            return true;
        }
        catch
        {
            return false;
        }
    }

    public static ShellSnap QueryShell(nint self)
    {
        RectI? tray = null;
        RectI? notify = null;
        RectI? apps = null;
        var align = ReadTaskbarAlign();
        var light = false;
        var d3d = false;
        var presentation = false;
        var exclusive = false;
        try { light = ReadLightTheme(); } catch { }
        try
        {
            var trayHwnd = PickTrayHwnd(self);
            if (trayHwnd != 0)
            {
                tray = FromHwnd(trayHwnd);
                var notifyHwnd = FindWindowEx(trayHwnd, 0, "TrayNotifyWnd", null);
                if (notifyHwnd != 0) notify = FromHwnd(notifyHwnd);
                apps = FindTaskList(trayHwnd, tray);
            }
        }
        catch { }
        try
        {
            if (SHQueryUserNotificationState(out var state) == 0)
            {
                d3d = state == 3;
                presentation = state == 4;
            }
        }
        catch { }
        try { exclusive = !IsShowDesktop() && ForegroundCoversMonitor(self); } catch { }
        if (IsShowDesktop()) d3d = false;
        return new ShellSnap(tray, notify, apps, align, light, d3d, presentation, exclusive);
    }

    public static double UiScale(BandConfig cfg)
    {
        var n = cfg.UiScale;
        if (n < 50 || n > 200) n = 100;
        return n / 100.0;
    }

    public static RectI ComputeGeometry(BandConfig cfg, ShellSnap snap)
    {
        try
        {
            var display = PickDisplay(cfg.Monitor);
            var scale = UiScale(cfg);
            var width = Clamp((int)Math.Round(Clamp(cfg.WidgetWidth, 200, 800, 360) * scale), 120, 1600, 360);
            if (display is null)
            {
                return new RectI(80, 80, width, Clamp((int)Math.Round(Clamp(cfg.CustomHeight, 28, 80, 48) * scale), 20, 160, 48));
            }

            var bounds = ToRect(display.OuterBounds);
            var work = ToRect(display.WorkArea);
            var left = Math.Max(0, work.X - bounds.X);
            var top = Math.Max(0, work.Y - bounds.Y);
            var right = Math.Max(0, (bounds.X + bounds.W) - (work.X + work.W));
            var bottom = Math.Max(0, (bounds.Y + bounds.H) - (work.Y + work.H));
            var edge = "bottom";
            var thickness = bottom;
            if (top > thickness) { edge = "top"; thickness = top; }
            if (left > thickness) { edge = "left"; thickness = left; }
            if (right > thickness) { edge = "right"; thickness = right; }
            var vertical = edge is "left" or "right";
            var floating = vertical || thickness < 8;
            if (!floating && snap.Tray is { } tray && Overlaps(tray, bounds))
            {
                thickness = edge is "top" or "bottom" ? Math.Max(1, tray.H) : Math.Max(1, tray.W);
            }
            var baseHeight = floating ? Clamp(cfg.CustomHeight, 32, 80, 40) : Math.Min(80, Math.Max(28, thickness));
            var height = Clamp((int)Math.Round(baseHeight * scale), 20, 160, baseHeight);

            int x;
            int y;
            if (!floating)
            {
                if (snap.Tray is { } strip && Overlaps(strip, bounds))
                {
                    y = (edge == "top" ? strip.Y : strip.Y + strip.H - height) + cfg.OffsetY;
                }
                else
                {
                    var stripY = edge == "top" ? bounds.Y : bounds.Y + bounds.H - thickness;
                    y = (edge == "top" ? stripY : stripY + thickness - height) + cfg.OffsetY;
                }
                x = AlignOnStrip(cfg, snap, bounds, width);
            }
            else
            {
                const int margin = 10;
                y = work.Y + work.H - height - margin + cfg.OffsetY;
                if (cfg.Alignment == "left") x = work.X + margin + cfg.OffsetX;
                else if (cfg.Alignment == "center") x = work.X + (work.W - width) / 2;
                else x = work.X + work.W - width - margin;
            }

            x = Math.Max(bounds.X, Math.Min(x, bounds.X + bounds.W - width));
            y = Math.Max(bounds.Y, Math.Min(y, bounds.Y + bounds.H - height));
            return new RectI(x, y, width, height);
        }
        catch
        {
            return new RectI(80, 80, Clamp((int)Math.Round(Clamp(cfg.WidgetWidth, 200, 800, 360) * UiScale(cfg)), 120, 1600, 360), Clamp((int)Math.Round(Clamp(cfg.CustomHeight, 28, 80, 48) * UiScale(cfg)), 20, 160, 48));
        }
    }

    private static int AlignOnStrip(BandConfig cfg, ShellSnap snap, RectI bounds, int width)
    {
        const int gap = 8;
        var startReserve = IsWindows11 ? 168 : 72;
        var trayLeft = snap.Tray is { } tray ? tray.X : bounds.X;
        var trayRight = snap.Tray is { } t2 ? t2.Right : bounds.X + bounds.W;
        var freeLeft = trayLeft + startReserve;
        var freeRight = trayRight - gap;
        var centered = string.Equals(snap.TaskbarAlign, "center", StringComparison.OrdinalIgnoreCase);

        if (snap.Apps is { } apps && Overlaps(apps, bounds))
        {
            if (centered)
            {
                freeLeft = trayLeft + gap;
            }
            else
            {
                freeLeft = Math.Max(freeLeft, apps.Right + gap);
            }
        }

        if (cfg.AutoAvoidTray && snap.Notify is { } notify && NotifyInDisplay(notify, bounds))
        {
            freeRight = Math.Min(freeRight, notify.X - gap);
        }
        else if (cfg.Alignment == "right")
        {
            freeRight = trayRight - Math.Max(gap, cfg.OffsetX);
        }

        if (freeRight - freeLeft < width)
        {
            return Math.Max(bounds.X, freeRight - width);
        }

        if (cfg.Alignment == "left")
        {
            return freeLeft + cfg.OffsetX;
        }

        if (cfg.Alignment == "center")
        {
            if (centered && snap.Apps is { } icons && Overlaps(icons, bounds))
            {
                var rightGap = freeRight - icons.Right;
                var leftGap = icons.X - trayLeft;
                if (rightGap >= width) return icons.Right + (rightGap - width) / 2;
                if (leftGap >= width) return trayLeft + (leftGap - width) / 2;
            }
            return freeLeft + (freeRight - freeLeft - width) / 2;
        }

        return freeRight - width;
    }

    private static DisplayArea? PickDisplay(string monitor)
    {
        try
        {
            if (monitor != "primary" && int.TryParse(monitor, out var index) && index >= 0)
            {
                var all = DisplayArea.FindAll();
                if (index < all.Count) return all[index];
            }
            return DisplayArea.Primary;
        }
        catch
        {
            return null;
        }
    }

    private static nint PickTrayHwnd(nint self)
    {
        var trays = new List<nint>();
        EnumWindows((hwnd, _) =>
        {
            var name = new StringBuilder(64);
            if (GetClassName(hwnd, name, name.Capacity) <= 0) return true;
            var cls = name.ToString();
            if (cls is "Shell_TrayWnd" or "Shell_SecondaryTrayWnd") trays.Add(hwnd);
            return true;
        }, 0);

        if (trays.Count == 0)
        {
            var primary = FindWindow("Shell_TrayWnd", null);
            return primary;
        }

        var origin = self != 0 ? self : trays[0];
        var monitor = MonitorFromWindow(origin, MonitorDefaultToNearest);
        foreach (var hwnd in trays)
        {
            if (MonitorFromWindow(hwnd, MonitorDefaultToNearest) == monitor) return hwnd;
        }
        return trays[0];
    }

    private static RectI? FindTaskList(nint trayHwnd, RectI? tray)
    {
        RectI? found = null;
        EnumChildWindows(trayHwnd, (hwnd, _) =>
        {
            var name = new StringBuilder(128);
            if (GetClassName(hwnd, name, name.Capacity) <= 0) return true;
            var cls = name.ToString();
            if (!cls.Contains("TaskList", StringComparison.OrdinalIgnoreCase)
                && !string.Equals(cls, "MSTaskSwWClass", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            var rect = FromHwnd(hwnd);
            if (rect is not { } row || row.W < 40 || row.H < 10) return true;
            if (tray is { } t && row.W > t.W * 0.85) return true;
            if (found is not { } current || row.W > current.W) found = row;
            return true;
        }, 0);
        return found;
    }

    private static RectI ToRect(Windows.Graphics.RectInt32 r) => new(r.X, r.Y, r.Width, r.Height);

    private static bool NotifyInDisplay(RectI notify, RectI bounds)
    {
        var cx = notify.X + notify.W / 2;
        var cy = notify.Y + notify.H / 2;
        return cx >= bounds.X && cx < bounds.X + bounds.W && cy >= bounds.Y && cy < bounds.Y + bounds.H;
    }

    private static bool Overlaps(RectI a, RectI b)
    {
        var cx = a.X + a.W / 2;
        var cy = a.Y + a.H / 2;
        return cx >= b.X && cx < b.X + b.W && cy >= b.Y && cy < b.Y + b.H;
    }

    private static bool ReadLightTheme()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize");
            var value = key?.GetValue("SystemUsesLightTheme");
            return value is int i && i == 1;
        }
        catch
        {
            return false;
        }
    }

    private static string ReadTaskbarAlign()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Explorer\Advanced");
            var value = key?.GetValue("TaskbarAl");
            if (value is int i) return i == 0 ? "left" : "center";
        }
        catch { }
        return IsWindows11 ? "center" : "left";
    }

    private static RectI? FromHwnd(nint hwnd)
    {
        if (hwnd == 0 || !GetWindowRect(hwnd, out var r)) return null;
        return new RectI(r.Left, r.Top, r.Right - r.Left, r.Bottom - r.Top);
    }

    private static bool ForegroundCoversMonitor(nint self)
    {
        var fg = GetForegroundWindow();
        if (fg == 0 || (self != 0 && fg == self)) return false;
        GetWindowThreadProcessId(fg, out var pid);
        if (pid != 0 && pid == GetCurrentProcessId()) return false;
        var cls = ClassName(fg);
        if (cls.Length == 0) return false;
        foreach (var item in ShellClasses)
        {
            if (string.Equals(item, cls, StringComparison.Ordinal)) return false;
        }
        var title = new StringBuilder(512);
        var name = "";
        if (GetWindowText(fg, title, title.Capacity) > 0)
        {
            name = title.ToString();
            if (name.Contains("AudioBand", StringComparison.OrdinalIgnoreCase)) return false;
            if (name.Contains("Taskbar Mini Player", StringComparison.OrdinalIgnoreCase)) return false;
            if (name.Contains("Desktop Lyrics", StringComparison.OrdinalIgnoreCase)) return false;
            if (name.Contains("ECHO Pet", StringComparison.OrdinalIgnoreCase)) return false;
        }
        var style = (int)GetWindowLong(fg, GwlStyle);
        if ((style & WsCaption) != 0) return false;
        var ex = (int)GetWindowLong(fg, GwlExstyle);
        if ((ex & WsExToolwindow) != 0 && (ex & WsExNoactivate) != 0) return false;
        var monitor = MonitorFromWindow(fg, MonitorDefaultToNearest);
        if (monitor == 0) return false;
        var info = new MonitorInfo { CbSize = Marshal.SizeOf<MonitorInfo>() };
        if (!GetMonitorInfo(monitor, ref info)) return false;
        if (!GetWindowRect(fg, out var wr)) return false;
        const int slop = 6;
        var covers = wr.Left <= info.RcMonitor.Left + slop
            && wr.Top <= info.RcMonitor.Top + slop
            && wr.Right >= info.RcMonitor.Right - slop
            && wr.Bottom >= info.RcMonitor.Bottom - slop;
        if (!covers) return false;
        if (cls.StartsWith("Chrome_WidgetWin", StringComparison.OrdinalIgnoreCase)
            && name.StartsWith("ECHO", StringComparison.OrdinalIgnoreCase)
            && (style & WsThickframe) != 0)
        {
            return false;
        }
        return true;
    }

    private static nint GetWindowLong(nint hwnd, int index)
        => nint.Size == 8 ? GetWindowLongPtr64(hwnd, index) : GetWindowLong32(hwnd, index);

    private static void SetWindowLong(nint hwnd, int index, nint value)
    {
        if (nint.Size == 8) SetWindowLongPtr64(hwnd, index, value);
        else SetWindowLong32(hwnd, index, (int)value);
    }

    private static int Clamp(int value, int min, int max, int fallback)
        => value < min || value > max ? fallback : value;
}
