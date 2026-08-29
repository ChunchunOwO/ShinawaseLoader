using System.Globalization;
using System.Runtime.InteropServices.WindowsRuntime;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Controls.Primitives;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Animation;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.ApplicationModel.DataTransfer;
using Windows.Foundation;
using Windows.Storage.Streams;
using Windows.UI;

namespace Echo.AudioBand;

public sealed partial class MainWindow : Window
{
    private readonly DispatcherQueueTimer _progressTimer;
    private readonly DispatcherQueueTimer _shellTimer;
    private readonly DispatcherQueueTimer _previewTimer;
    private PreviewWindow? _preview;
    private readonly MenuFlyout _menu;
    private Storyboard? _titleMarquee;
    private Storyboard? _artistMarquee;
    private Storyboard? _visBoard;
    private Storyboard? _lyricBoard;
    private readonly AppWindow? _appWindow;
    private readonly nint _hwnd;
    private readonly Storyboard _sweepBoard;

    private BandConfig _config = new();
    private BandStatus? _status;
    private long _statusAtMs;
    private ShellSnap _shell;
    private string _artKey = "";
    private string _artUrl = "";
    private string _lastTitle = "\0";
    private string _lastArtist = "\0";
    private string _lastLyric1 = "\0";
    private string _lastLyric2 = "\0";
    private bool _lastScroll;
    private double _lastRatio = -1;
    private string _lastTime = "\0";
    private string _lastBackdrop = "";
    private bool _lastLight;
    private bool _ready;
    private bool _wantVisible;
    private bool _systemHidden;
    private bool _lyricsMode;
    private bool _peeking;
    private bool _paneLyrics;
    private bool _officialEnabled = true;
    private bool _slidingLyrics;
    private Color _lyricCurrentColor = Color.FromArgb(255, 245, 245, 245);
    private Color _lyricNextColor = Color.FromArgb(255, 168, 168, 168);
    private string _lyricTrackKey = "";
    private string? _pendingLyric1;
    private string? _pendingLyric2;
    private long _stoppedSince;
    private int _coverEpoch;
    private double _lastOpacity = -1;
    private double _uiScale = 1;
    private double _idleOpacity = 1;
    private bool _fadeBusy;
    private bool _weHid;
    private long _hideArmedAt;
    private string _hideArmed = "";

    public MainWindow()
    {
        InitializeComponent();
        Protocol.Send("booting");
        _hwnd = Native.HwndOf(this);
        _appWindow = Native.AppWindowOf(this);
        try
        {
            if (_appWindow is not null)
            {
                _appWindow.IsShownInSwitchers = false;
                try { _appWindow.TitleBar.ExtendsContentIntoTitleBar = true; } catch { }
                try { _appWindow.TitleBar.PreferredHeightOption = TitleBarHeightOption.Collapsed; } catch { }
                try
                {
                    _appWindow.TitleBar.ButtonBackgroundColor = Color.FromArgb(0, 0, 0, 0);
                    _appWindow.TitleBar.ButtonInactiveBackgroundColor = Color.FromArgb(0, 0, 0, 0);
                    _appWindow.TitleBar.ButtonForegroundColor = Color.FromArgb(0, 0, 0, 0);
                }
                catch { }
                if (_appWindow.Presenter is OverlappedPresenter presenter)
                {
                    presenter.IsResizable = false;
                    presenter.IsMinimizable = false;
                    presenter.IsMaximizable = false;
                    try { presenter.SetBorderAndTitleBar(false, false); } catch { }
                    presenter.IsAlwaysOnTop = true;
                }
                Native.SetDarkClassBrush(_hwnd);
                Native.ApplyPopupChrome(_hwnd, extendFrame: false, glassCaption: false);
                Native.ApplyCaptionColor(_hwnd, true);
                try { _appWindow.Hide(); } catch { }
            }
            try { ExtendsContentIntoTitleBar = false; } catch { }
            Native.ApplyPopupChrome(_hwnd, extendFrame: false, glassCaption: false);
            Native.ApplyCaptionColor(_hwnd, true);
        }
        catch (Exception ex) { Protocol.Log("WARN", ex.Message); }

        _menu = new MenuFlyout();
        _menu.Items.Add(Item(IsChinese() ? "打开 ECHO" : "Open ECHO", FocusEcho));
        _menu.Items.Add(Item(IsChinese() ? "复制曲目" : "Copy track", CopyTrack));
        _menu.Items.Add(Item(IsChinese() ? "打开歌词页" : "Open lyrics page", () => Protocol.Command("openLyrics")));
        _menu.Items.Add(Item(IsChinese() ? "切换歌词 / 歌曲" : "Toggle lyrics / song", ToggleLyricsMode));

        var sweep = new DoubleAnimation
        {
            Duration = new Duration(TimeSpan.FromMilliseconds(280)),
            EnableDependentAnimation = false,
        };
        Storyboard.SetTarget(sweep, SweepX);
        Storyboard.SetTargetProperty(sweep, "X");
        var fade = new DoubleAnimation
        {
            From = 0.9,
            To = 0,
            Duration = new Duration(TimeSpan.FromMilliseconds(280)),
        };
        Storyboard.SetTarget(fade, LyricSweep);
        Storyboard.SetTargetProperty(fade, "Opacity");
        _sweepBoard = new Storyboard();
        _sweepBoard.Children.Add(sweep);
        _sweepBoard.Children.Add(fade);
        _sweepBoard.Completed += (_, _) =>
        {
            LyricSweep.Opacity = 0;
            SweepX.X = -Px(80);
        };

        var queue = DispatcherQueue;
        _progressTimer = queue.CreateTimer();
        _progressTimer.Interval = TimeSpan.FromMilliseconds(250);
        _progressTimer.Tick += (_, _) => ApplyProgress();
        _shellTimer = queue.CreateTimer();
        _shellTimer.Interval = TimeSpan.FromMilliseconds(200);
        _shellTimer.Tick += (_, _) => OnShellTick();
        Native.WatchShell(_hwnd, () => queue.TryEnqueue(OnShellTick), () => _wantVisible);
        _previewTimer = queue.CreateTimer();
        _previewTimer.IsRepeating = false;
        _previewTimer.Interval = TimeSpan.FromMilliseconds(320);
        _previewTimer.Tick += (_, _) => ShowPreview();

        TitleClip.SizeChanged += (_, _) => Clip(TitleClip);
        ArtistClip.SizeChanged += (_, _) => Clip(ArtistClip);
        Meta.SizeChanged += (_, _) => Clip(Meta);
        LyricViewport.SizeChanged += (_, _) => ApplyLyricWidths();
        Root.PointerPressed += OnRootPointer;
        Root.PointerWheelChanged += OnWheel;
        Closed += (_, _) =>
        {
            try { _progressTimer.Stop(); } catch { }
            try { _shellTimer.Stop(); } catch { }
            Native.StopWatch(_hwnd);
            HidePreview();
        };

        ApplyConfig(_config);
        ApplyStatus(null);
        _shellTimer.Start();
        Protocol.StartReader(queue, OnHostMessage, () =>
        {
            try { Close(); } catch { }
            try { Application.Current.Exit(); } catch { }
        });
        Protocol.Send("ready");
        _ready = true;
        OnShellTick();
    }

    private void OnHostMessage(string op, System.Text.Json.JsonElement payload)
    {
        if (op == "quit")
        {
            try { Close(); } catch { }
            try { Application.Current.Exit(); } catch { }
            return;
        }
        if (op == "config")
        {
            var next = Protocol.Read<BandConfig>(payload);
            if (next is not null) ApplyConfig(next);
            return;
        }
        if (op == "status") ApplyStatus(Protocol.Read<BandStatus>(payload));
    }

    private void ApplyConfig(BandConfig cfg)
    {
        _config = cfg;
        ArtButton.Visibility = cfg.ShowAlbumArt ? Visibility.Visible : Visibility.Collapsed;
        Controls.Visibility = cfg.ShowControls ? Visibility.Visible : Visibility.Collapsed;
        SeekHit.Visibility = cfg.ShowProgress ? Visibility.Visible : Visibility.Collapsed;
        var dark = ResolveDark();
        Root.RequestedTheme = dark ? ElementTheme.Dark : ElementTheme.Light;
        ApplyBackdrop(dark);
        ApplyLyricColors(dark);
        ApplyAccent(cfg.AccentColor);
        ApplyMetrics();
        Native.ApplyCorners(_hwnd, false);
        Bar.CornerRadius = new CornerRadius(0);
        if (!_config.HoverPreview) HidePreview();
        _lastTitle = "\0";
        _lastArtist = "\0";
        _lastLyric1 = "\0";
        _lastLyric2 = "\0";
        _lyricTrackKey = "";
        ApplyStatus(_status);
        LayoutBar();
        ApplyVisibility();
    }

    private void ApplyBackdrop(bool dark)
    {
        var key = $"solid|{_config.SeamlessMode}|{dark}|{_config.BackgroundOpacity}";
        if (key == _lastBackdrop) return;
        _lastBackdrop = key;
        SystemBackdrop = null;
        Root.Background = Solid(dark, _config.SeamlessMode ? 100 : _config.BackgroundOpacity);
        Bar.Background = Root.Background;
    }

    private void ApplyAccent(string hex)
    {
        if (!TryParseColor(hex, out var color)) color = Color.FromArgb(255, 77, 163, 255);
        var brush = new SolidColorBrush(color);
        Root.Resources["BandAccent"] = brush;
        SeekFill.Background = brush;
    }

    private double Px(double n) => n * _uiScale;

    private int Pxi(double n) => Math.Max(1, (int)Math.Round(n * _uiScale));

    private void ApplyMetrics()
    {
        _uiScale = Native.UiScale(_config);
        var art = Pxi(32);
        ArtButton.Width = art;
        ArtButton.Height = art;
        ArtButton.Margin = new Thickness(0, 0, Px(8), 0);
        ArtSlot.Width = art;
        ArtSlot.Height = art;
        CoverHost.Width = art;
        CoverHost.Height = art;
        ArtNote.FontSize = Px(14);
        Bar.Padding = new Thickness(Px(4), Px(2), Px(6), Px(2));
        Meta.MinHeight = Px(32);
        TitleClip.Height = Px(16);
        TitleText.FontSize = Px(12);
        ArtistClip.Height = Px(15);
        ArtistText.FontSize = Px(11);
        TimeText.FontSize = Px(10);
        TimeText.Margin = new Thickness(Px(8), 0, 0, 0);
        LyricViewport.Height = Px(32);
        Lyric1Text.Height = Px(16);
        Lyric2Text.Height = Px(16);
        Lyric3Text.Height = Px(16);
        Lyric1Text.FontSize = Px(12);
        Lyric2Text.FontSize = Px(11);
        Lyric3Text.FontSize = Px(11);
        LyricSweep.Width = Px(72);
        LyricSweep.Height = Px(32);
        Controls.Spacing = Px(2);
        Controls.Margin = new Thickness(Px(6), 0, 0, 0);
        PrevButton.Width = Pxi(22);
        PrevButton.Height = Pxi(22);
        ToggleButton.Width = Pxi(22);
        ToggleButton.Height = Pxi(22);
        NextButton.Width = Pxi(22);
        NextButton.Height = Pxi(22);
        PrevIcon.FontSize = Px(12);
        ToggleIcon.FontSize = Px(12);
        NextIcon.FontSize = Px(12);
        SeekHit.Height = Px(10);
        SeekTrack.Height = Px(3);
        _preview?.SetScale(_uiScale);
    }

    private void ApplyStatus(BandStatus? status)
    {
        _status = status;
        _statusAtMs = Environment.TickCount64;
        if (status is not null) _officialEnabled = status.OfficialEnabled;
        var idle = IsIdle(status);
        SetRootOpacity(idle ? 0.72 : 1);
        var copy = IdleCopy();
        var title = idle ? copy.title : (string.IsNullOrWhiteSpace(status?.Title) ? copy.title : status!.Title);
        var artist = idle ? copy.artist : (status?.Artist ?? "");
        var scroll = _config.ScrollingText;
        if (title != _lastTitle || artist != _lastArtist || _lastScroll != scroll)
        {
            _lastTitle = title;
            _lastArtist = artist;
            TitleText.Text = title;
            ArtistText.Text = artist;
            TitleText.DispatcherQueue.TryEnqueue(LayoutSongMarquees);
        }

        var lyric1 = LyricLine1();
        var lyric2 = LyricLine2();
        var trackKey = status?.TrackKey ?? "";
        if (lyric1 != _lastLyric1 || lyric2 != _lastLyric2)
        {
            var roll = _lastLyric1 != "\0"
                && trackKey == _lyricTrackKey
                && _status?.LyricsHas == true
                && !idle
                && lyric1 != _lastLyric1;
            SetLyrics(lyric1, lyric2, roll);
        }
        else if (_lastScroll != scroll)
        {
            ApplyLyricWidths();
        }
        _lyricTrackKey = trackKey;
        _lastScroll = scroll;

        var playing = !idle && status?.State == "playing";
        ToggleIcon.Glyph = playing ? "\uE769" : "\uE768";
        ToggleButton.SetValue(ToolTipService.ToolTipProperty, playing ? (IsChinese() ? "暂停" : "Pause") : (IsChinese() ? "播放" : "Play"));
        if (playing) _progressTimer.Start();
        else _progressTimer.Stop();
        LoadCover(status);
        ApplyProgress();
        ApplyPanes();
        ApplyVisibility();
    }

    private string LyricLine1()
    {
        if (IsIdle(_status)) return IsChinese() ? "未在播放" : "Not playing";
        if (_status?.LyricsInstrumental == true) return IsChinese() ? "纯音乐" : "Instrumental";
        if (_status?.LyricsHas == true && !string.IsNullOrWhiteSpace(_status.LyricsCurrent)) return _status.LyricsCurrent;
        if (_status?.LyricsHas == true) return IsChinese() ? "…" : "…";
        return IsChinese() ? "暂无歌词" : "No lyrics";
    }

    private string LyricLine2()
    {
        if (IsIdle(_status) || _status?.LyricsInstrumental == true) return _status?.Artist ?? "";
        if (_status?.LyricsHas == true)
        {
            if (!string.IsNullOrWhiteSpace(_status.LyricsNext)) return _status.LyricsNext;
            return _status.Artist ?? "";
        }
        return _status?.Title ?? "";
    }

    private bool ShowingLyrics() => _peeking ? !_lyricsMode : _lyricsMode;

    private void ApplyPanes()
    {
        var lyrics = ShowingLyrics();
        if (lyrics == _paneLyrics) return;
        _paneLyrics = lyrics;
        SongPane.Visibility = lyrics ? Visibility.Collapsed : Visibility.Visible;
        LyricsPane.Visibility = lyrics ? Visibility.Visible : Visibility.Collapsed;
        SongPane.IsHitTestVisible = !lyrics;
        LyricsPane.IsHitTestVisible = lyrics;
        if (lyrics) ApplyLyricWidths();
    }

    private void ApplyLyricColors(bool dark)
    {
        _lyricCurrentColor = dark ? Color.FromArgb(255, 245, 245, 245) : Color.FromArgb(255, 22, 22, 22);
        _lyricNextColor = dark ? Color.FromArgb(255, 168, 168, 168) : Color.FromArgb(255, 96, 96, 96);
        Lyric1Text.Foreground = new SolidColorBrush(_lyricCurrentColor);
        Lyric2Text.Foreground = new SolidColorBrush(_lyricNextColor);
        Lyric3Text.Foreground = new SolidColorBrush(_lyricNextColor);
    }

    private void LoadCover(BandStatus? status)
    {
        var idle = IsIdle(status);
        var url = !idle && !string.IsNullOrWhiteSpace(status?.CoverUrl) ? status!.CoverUrl : "";
        var key = status?.TrackKey ?? "";
        if (url == _artUrl && key == _artKey) return;
        if (url.Length == 0)
        {
            if (key.Length > 0 && key == _artKey && CoverBrush.ImageSource is not null) return;
            _artKey = key;
            _artUrl = "";
            CoverBrush.ImageSource = null;
            CoverHost.Visibility = Visibility.Collapsed;
            ArtNote.Visibility = Visibility.Visible;
            return;
        }
        if (!url.StartsWith("data:", StringComparison.OrdinalIgnoreCase)
            && !url.StartsWith("http://", StringComparison.OrdinalIgnoreCase)
            && !url.StartsWith("https://", StringComparison.OrdinalIgnoreCase)
            && !url.StartsWith("file:", StringComparison.OrdinalIgnoreCase))
        {
            if (key == _artKey && CoverBrush.ImageSource is not null) return;
            return;
        }
        _artKey = key;
        _artUrl = url;
        var epoch = ++_coverEpoch;
        _ = Task.Run(async () =>
        {
            InMemoryRandomAccessStream? ras = null;
            Uri? uri = null;
            try
            {
                if (url.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
                {
                    var comma = url.IndexOf(',');
                    if (comma < 0) return;
                    var raw = url[(comma + 1)..].Replace("\r", "").Replace("\n", "").Replace(" ", "");
                    var bytes = Convert.FromBase64String(raw);
                    ras = new InMemoryRandomAccessStream();
                    await ras.WriteAsync(bytes.AsBuffer());
                    ras.Seek(0);
                }
                else uri = new Uri(url, UriKind.Absolute);
            }
            catch { return; }
            DispatcherQueue.TryEnqueue(() =>
            {
                if (epoch != _coverEpoch)
                {
                    ras?.Dispose();
                    return;
                }
                try
                {
                    var image = new BitmapImage { DecodePixelWidth = 400 };
                    if (ras is not null) image.SetSource(ras);
                    else if (uri is not null) image.UriSource = uri;
                    else return;
                    CoverBrush.ImageSource = image;
                    CoverHost.Visibility = Visibility.Visible;
                    ArtNote.Visibility = Visibility.Collapsed;
                    _preview?.SetCover(image);
                }
                catch
                {
                    ras?.Dispose();
                    CoverBrush.ImageSource = null;
                    CoverHost.Visibility = Visibility.Collapsed;
                    ArtNote.Visibility = Visibility.Visible;
                }
            });
        });
    }

    private void ApplyProgress()
    {
        var dur = _status?.DurationSeconds ?? 0;
        var pos = DisplayedPosition();
        var ratio = dur > 0 ? Math.Min(1, pos / dur) : 0;
        if (Math.Abs(ratio - _lastRatio) >= 0.002)
        {
            _lastRatio = ratio;
            SeekScale.ScaleX = ratio;
        }
        string text;
        var hidden = !_config.ShowTime || IsIdle(_status) || dur <= 0;
        if (hidden) text = "";
        else text = $"{FormatTime(pos)} / {FormatTime(dur)}";
        if (text != _lastTime)
        {
            _lastTime = text;
            TimeText.Text = text;
            TimeText.Visibility = hidden ? Visibility.Collapsed : Visibility.Visible;
        }
    }

    private double DisplayedPosition()
    {
        if (_status is null) return 0;
        var basePos = _status.PositionSeconds;
        var dur = _status.DurationSeconds;
        if (_status.State != "playing" || dur <= 0) return Math.Min(dur <= 0 ? basePos : dur, basePos);
        var elapsed = (Environment.TickCount64 - _statusAtMs) / 1000.0;
        return Math.Min(dur, Math.Max(0, basePos + elapsed));
    }

    private void OnShellTick()
    {
        try
        {
            _shell = Native.QueryShell(_hwnd);
            if (_shell.LightTheme != _lastLight && string.Equals(_config.Theme, "auto", StringComparison.OrdinalIgnoreCase))
            {
                _lastLight = _shell.LightTheme;
                ApplyConfig(_config);
            }
            LayoutBar();
            ApplyVisibility();
        }
        catch (Exception ex)
        {
            Protocol.Log("WARN", ex.Message);
        }
    }

    private void LayoutBar()
    {
        if (_appWindow is null) return;
        Native.TryMove(_appWindow, Native.ComputeGeometry(_config, _shell));
        if (_wantVisible) Native.KeepOnTaskbar(_hwnd);
    }

    private void ApplyVisibility()
    {
        var reason = SystemHideReason();
        if (reason.Length > 0)
        {
            if (_hideArmed != reason)
            {
                _hideArmed = reason;
                _hideArmedAt = Environment.TickCount64;
            }
            if (!_systemHidden && Environment.TickCount64 - _hideArmedAt < 90)
            {
                StayOnTaskbar();
                return;
            }
            if (!_systemHidden)
            {
                _systemHidden = true;
                HidePreview();
                SetVisible(false, immediate: false);
            }
            return;
        }
        _hideArmed = "";
        _hideArmedAt = 0;
        if (_systemHidden)
        {
            _systemHidden = false;
            SetVisible(true);
            return;
        }
        ApplyIdleHide();
        StayOnTaskbar();
    }

    private void StayOnTaskbar()
    {
        if (!_wantVisible || _systemHidden) return;
        Native.KeepOnTaskbar(_hwnd);
        if (!Native.IsOnScreen(_hwnd)) Native.Reveal(_hwnd);
    }

    private string SystemHideReason()
    {
        if (Native.IsShowDesktop()) return "";
        if (_config.HideWhenFullscreen && _shell.ExclusiveFullscreen) return "fullscreen";
        if (_config.HideWhenPresentation && _shell.Presentation) return "presentation";
        return "";
    }

    private void ApplyIdleHide()
    {
        if (_systemHidden) return;
        if (!_config.AutoHideWhenStopped)
        {
            _stoppedSince = 0;
            SetVisible(true);
            return;
        }
        if (!IsIdle(_status) && !string.IsNullOrWhiteSpace(_status?.Title) && _status!.State is "playing" or "paused")
        {
            _stoppedSince = 0;
            SetVisible(true);
            return;
        }
        if (_stoppedSince == 0) _stoppedSince = Environment.TickCount64;
        if (Environment.TickCount64 - _stoppedSince >= 8000) SetVisible(false);
        else SetVisible(true);
    }

    private void SetVisible(bool show, bool immediate = false)
    {
        if (show)
        {
            _wantVisible = true;
            RestoreOpacity();
            LayoutBar();
            Native.KeepOnTaskbar(_hwnd);
            if (Native.IsOnScreen(_hwnd))
            {
                _weHid = false;
                return;
            }
            if (_weHid) Present();
            else Native.Reveal(_hwnd);
            return;
        }

        _wantVisible = false;
        if (!Native.IsOnScreen(_hwnd) && !_fadeBusy)
        {
            _weHid = true;
            return;
        }
        Dismiss(immediate);
    }

    private void RestoreOpacity()
    {
        try { _visBoard?.Stop(); } catch { }
        _fadeBusy = false;
        if (Root.Opacity < _idleOpacity - 0.01) Root.Opacity = _idleOpacity;
    }

    private void Present()
    {
        if (_appWindow is null) return;
        _weHid = false;
        LayoutBar();
        try { _appWindow.Show(false); } catch { }
        Native.KeepOnTaskbar(_hwnd);
        Native.Reveal(_hwnd);
        RestoreOpacity();
    }

    private void Dismiss(bool immediate)
    {
        _weHid = true;
        if (immediate)
        {
            try { _visBoard?.Stop(); } catch { }
            _fadeBusy = false;
            Root.Opacity = 0;
            try { _appWindow?.Hide(); } catch { }
            return;
        }
        FadeTo(0, 80, () =>
        {
            if (_wantVisible) return;
            try { _appWindow?.Hide(); } catch { }
        });
    }

    private void FadeTo(double target, int ms, Action? done)
    {
        try { _visBoard?.Stop(); } catch { }
        if (ms <= 0)
        {
            _fadeBusy = false;
            Root.Opacity = target;
            done?.Invoke();
            return;
        }
        _fadeBusy = true;
        var anim = new DoubleAnimation
        {
            To = target,
            Duration = new Duration(TimeSpan.FromMilliseconds(ms)),
            EnableDependentAnimation = false,
        };
        Storyboard.SetTarget(anim, Root);
        Storyboard.SetTargetProperty(anim, "Opacity");
        var board = new Storyboard();
        board.Children.Add(anim);
        board.Completed += (_, _) =>
        {
            _fadeBusy = false;
            Root.Opacity = target;
            done?.Invoke();
        };
        _visBoard = board;
        board.Begin();
    }

    private void SetRootOpacity(double value)
    {
        _idleOpacity = value;
        if (Math.Abs(value - _lastOpacity) < 0.01) return;
        _lastOpacity = value;
        if (_wantVisible && !_fadeBusy) Root.Opacity = value;
    }

    private void LayoutSongMarquees()
    {
        Clip(TitleClip);
        Clip(ArtistClip);
        _titleMarquee = BounceMarquee(TitleClip, TitleText, _config.ScrollingText, _titleMarquee);
        _artistMarquee = BounceMarquee(ArtistClip, ArtistText, _config.ScrollingText, _artistMarquee);
    }

    private void SetLyrics(string line1, string line2, bool animate)
    {
        if (_slidingLyrics)
        {
            _pendingLyric1 = line1;
            _pendingLyric2 = line2;
            return;
        }

        _lastLyric1 = line1;
        _lastLyric2 = line2;
        if (!animate || LyricSlide is null)
        {
            CommitLyrics(line1, line2);
            return;
        }

        if (Lyric2Text.Text != line1) Lyric2Text.Text = line1;
        Lyric3Text.Text = line2;
        _slidingLyrics = true;
        try { _lyricBoard?.Stop(); } catch { }
        Lyric2Text.RenderTransform = null;
        if (LyricSlide is not null) LyricSlide.Y = 0;
        var incoming = new SolidColorBrush(_lyricNextColor);
        Lyric2Text.Foreground = incoming;
        var duration = new Duration(TimeSpan.FromMilliseconds(220));
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };
        var fade = new ColorAnimation
        {
            From = _lyricNextColor,
            To = _lyricCurrentColor,
            Duration = duration,
            EnableDependentAnimation = true,
            EasingFunction = ease,
        };
        Storyboard.SetTarget(fade, incoming);
        Storyboard.SetTargetProperty(fade, "Color");
        var slide = new DoubleAnimation
        {
            From = 0,
            To = -Px(16),
            Duration = duration,
            EasingFunction = ease,
        };
        Storyboard.SetTarget(slide, LyricSlide);
        Storyboard.SetTargetProperty(slide, "Y");
        var board = new Storyboard();
        board.Children.Add(fade);
        board.Children.Add(slide);
        board.Completed += (_, _) =>
        {
            CommitLyrics(line1, line2);
            _slidingLyrics = false;
            _lyricBoard = null;
            if (_pendingLyric1 is { } next1)
            {
                var next2 = _pendingLyric2 ?? "";
                _pendingLyric1 = null;
                _pendingLyric2 = null;
                SetLyrics(next1, next2, animate: next1 != line1);
            }
        };
        _lyricBoard = board;
        try { board.Begin(); }
        catch
        {
            CommitLyrics(line1, line2);
            _slidingLyrics = false;
        }
    }

    private void CommitLyrics(string line1, string line2)
    {
        Lyric1Text.Text = line1;
        Lyric2Text.Text = line2;
        Lyric3Text.Text = "";
        Lyric1Text.Foreground = new SolidColorBrush(_lyricCurrentColor);
        Lyric2Text.Foreground = new SolidColorBrush(_lyricNextColor);
        Lyric3Text.Foreground = new SolidColorBrush(_lyricNextColor);
        if (LyricSlide is not null) LyricSlide.Y = 0;
        ApplyLyricWidths();
    }

    private void ApplyLyricWidths()
    {
        Clip(LyricViewport);
        var width = Math.Max(0, LyricViewport.ActualWidth);
        Lyric1Text.MaxWidth = width;
        Lyric2Text.MaxWidth = width;
        Lyric3Text.MaxWidth = width;
        Lyric1Text.RenderTransform = null;
        Lyric2Text.RenderTransform = null;
        Lyric3Text.RenderTransform = null;
    }

    private static Storyboard? BounceMarquee(FrameworkElement clip, TextBlock text, bool enabled, Storyboard? previous)
    {
        try { previous?.Stop(); } catch { }
        text.RenderTransform = null;
        text.Measure(new Size(double.PositiveInfinity, double.PositiveInfinity));
        var clipWidth = clip.ActualWidth;
        var overflow = enabled && text.DesiredSize.Width > clipWidth + 1 && clipWidth > 1 && text.Text.Length > 0;
        if (!overflow)
        {
            text.TextTrimming = TextTrimming.CharacterEllipsis;
            return null;
        }
        text.TextTrimming = TextTrimming.None;
        var transform = new TranslateTransform();
        text.RenderTransform = transform;
        var distance = text.DesiredSize.Width - clipWidth + 16;
        var travel = Math.Max(3.2, distance / 32.0);
        const double hold = 1.1;
        var frames = new DoubleAnimationUsingKeyFrames
        {
            RepeatBehavior = RepeatBehavior.Forever,
            EnableDependentAnimation = false,
        };
        frames.KeyFrames.Add(new DiscreteDoubleKeyFrame { Value = 0, KeyTime = KeyTime.FromTimeSpan(TimeSpan.Zero) });
        frames.KeyFrames.Add(new DiscreteDoubleKeyFrame { Value = 0, KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(hold)) });
        frames.KeyFrames.Add(new EasingDoubleKeyFrame
        {
            Value = -distance,
            KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(hold + travel)),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut },
        });
        frames.KeyFrames.Add(new DiscreteDoubleKeyFrame { Value = -distance, KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(hold + travel + hold)) });
        frames.KeyFrames.Add(new EasingDoubleKeyFrame
        {
            Value = 0,
            KeyTime = KeyTime.FromTimeSpan(TimeSpan.FromSeconds(hold + travel + hold + travel)),
            EasingFunction = new CubicEase { EasingMode = EasingMode.EaseInOut },
        });
        Storyboard.SetTarget(frames, transform);
        Storyboard.SetTargetProperty(frames, "X");
        var board = new Storyboard();
        board.Children.Add(frames);
        board.Begin();
        return board;
    }

    private void SwitchDisplay(bool peeking, bool sweep)
    {
        _peeking = peeking;
        ApplyPanes();
        if (sweep) PlaySweep();
    }

    private void PlaySweep()
    {
        try
        {
            var width = Math.Max(Px(72), Meta.ActualWidth);
            _sweepBoard.Stop();
            if (_sweepBoard.Children[0] is DoubleAnimation sweep)
            {
                sweep.From = -Px(80);
                sweep.To = width + Px(8);
            }
            LyricSweep.Opacity = 0.85;
            SweepX.X = -Px(80);
            _sweepBoard.Begin();
        }
        catch { }
    }

    private static void Clip(FrameworkElement box)
    {
        box.Clip = new RectangleGeometry { Rect = new Rect(0, 0, Math.Max(0, box.ActualWidth), Math.Max(0, box.ActualHeight)) };
    }

    private void ToggleLyricsMode()
    {
        _lyricsMode = !_lyricsMode;
        SwitchDisplay(false, sweep: true);
    }

    private void FocusEcho()
    {
        HidePreview();
        Native.FocusEcho();
        Protocol.Command("focusEcho");
    }

    private void OnArtPressed(object sender, PointerRoutedEventArgs e)
    {
        if (!e.GetCurrentPoint(ArtButton).Properties.IsLeftButtonPressed) return;
        e.Handled = true;
        FocusEcho();
    }

    private void OnMetaTapped(object sender, TappedRoutedEventArgs e) => ToggleLyricsMode();
    private void OnMetaDoubleTapped(object sender, DoubleTappedRoutedEventArgs e) => Protocol.Command("openLyrics");
    private void OnPrev(object sender, RoutedEventArgs e) => Protocol.Command("previous");
    private void OnNext(object sender, RoutedEventArgs e) => Protocol.Command("next");
    private void OnToggle(object sender, RoutedEventArgs e) => Protocol.Command("toggle");

    private void OnMetaRightTapped(object sender, RightTappedRoutedEventArgs e)
    {
        try
        {
            _menu.ShowAt(Meta, new FlyoutShowOptions
            {
                Position = e.GetPosition(Meta),
                ShowMode = FlyoutShowMode.Standard,
            });
        }
        catch { }
    }

    private void OnArtEntered(object sender, PointerRoutedEventArgs e)
    {
        if (!_config.HoverPreview || IsIdle(_status)) return;
        ShowPreview();
    }

    private void OnArtExited(object sender, PointerRoutedEventArgs e)
    {
        try { _previewTimer.Stop(); } catch { }
        HidePreview();
    }

    private void OnMetaEntered(object sender, PointerRoutedEventArgs e)
    {
        if (IsIdle(_status) || _peeking) return;
        SwitchDisplay(true, sweep: true);
    }

    private void OnMetaExited(object sender, PointerRoutedEventArgs e)
    {
        if (!_peeking) return;
        var pt = e.GetCurrentPoint(Meta).Position;
        if (pt.X >= 0 && pt.Y >= 0 && pt.X <= Meta.ActualWidth && pt.Y <= Meta.ActualHeight) return;
        SwitchDisplay(false, sweep: true);
    }

    private void ShowPreview()
    {
        if (!_config.HoverPreview || IsIdle(_status)) return;
        var title = string.IsNullOrWhiteSpace(_status?.Title) ? "ECHO" : _status!.Title;
        var artist = _status?.Artist ?? "";
        var album = _status?.Album ?? "";
        _preview ??= new PreviewWindow();
        _preview.SetScale(_uiScale);
        _preview.SetCover(CoverBrush.ImageSource);
        _preview.Show(Native.ComputeGeometry(_config, _shell), title, artist, album, ResolveDark());
    }

    private void HidePreview()
    {
        try { _previewTimer.Stop(); } catch { }
        _preview?.Hide();
    }

    private void OnSeek(object sender, PointerRoutedEventArgs e)
    {
        try
        {
            var pt = e.GetCurrentPoint(SeekHit).Position.X;
            var width = SeekHit.ActualWidth;
            if (width <= 0) return;
            var ratio = Math.Min(1, Math.Max(0, pt / width));
            Protocol.Send("command", new { action = "seekRatio", ratio });
        }
        catch { }
    }

    private void OnWheel(object sender, PointerRoutedEventArgs e)
    {
        try
        {
            var dur = _status?.DurationSeconds ?? 0;
            if (dur <= 0) return;
            var delta = e.GetCurrentPoint(Root).Properties.MouseWheelDelta;
            var pos = DisplayedPosition() + (delta > 0 ? 5 : -5);
            Protocol.Send("command", new { action = "seekRatio", ratio = Math.Min(1, Math.Max(0, pos / dur)) });
        }
        catch { }
    }

    private void OnRootPointer(object sender, PointerRoutedEventArgs e)
    {
        try
        {
            if (!e.GetCurrentPoint(Root).Properties.IsMiddleButtonPressed) return;
            if (e.OriginalSource is DependencyObject node)
            {
                if (FindParent<Button>(node) is not null) return;
            }
            Protocol.Command("next");
        }
        catch { }
    }

    private void CopyTrack()
    {
        try
        {
            var title = _status?.Title ?? "";
            var artist = _status?.Artist ?? "";
            var text = string.IsNullOrWhiteSpace(artist) ? title : $"{title} - {artist}";
            if (string.IsNullOrWhiteSpace(text)) return;
            var data = new DataPackage();
            data.SetText(text);
            Clipboard.SetContent(data);
        }
        catch { }
    }

    private static MenuFlyoutItem Item(string label, Action action)
    {
        var item = new MenuFlyoutItem { Text = label };
        item.Click += (_, _) => action();
        return item;
    }

    private static T? FindParent<T>(DependencyObject node) where T : DependencyObject
    {
        while (node is not null)
        {
            if (node is T match) return match;
            node = VisualTreeHelper.GetParent(node);
        }
        return null;
    }

    private bool ResolveDark()
    {
        if (string.Equals(_config.Theme, "light", StringComparison.OrdinalIgnoreCase)) return false;
        if (string.Equals(_config.Theme, "dark", StringComparison.OrdinalIgnoreCase)) return true;
        return !_shell.LightTheme;
    }

    private bool IsChinese()
    {
        if (string.Equals(_config.Locale, "zh-CN", StringComparison.OrdinalIgnoreCase)) return true;
        if (string.Equals(_config.Locale, "en-US", StringComparison.OrdinalIgnoreCase)) return false;
        try { return CultureInfo.CurrentUICulture.Name.StartsWith("zh", StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }

    private (string title, string artist) IdleCopy()
        => IsChinese() ? ("ECHO", "未在播放") : ("ECHO", "Not playing");

    private static bool IsIdle(BandStatus? payload)
    {
        if (payload is null) return true;
        if (payload.State == "idle") return true;
        if (string.IsNullOrWhiteSpace(payload.Title) && string.IsNullOrWhiteSpace(payload.Artist)) return true;
        return payload.State == "stopped" && string.IsNullOrWhiteSpace(payload.Title);
    }

    private static string FormatTime(double seconds)
    {
        var n = Math.Max(0, (int)Math.Floor(seconds));
        return $"{n / 60}:{n % 60:00}";
    }

    private static Brush Solid(bool dark, int opacityPct)
    {
        var a = (byte)Math.Min(255, Math.Max(0, (int)Math.Round(opacityPct / 100.0 * 255)));
        return new SolidColorBrush(dark ? Color.FromArgb(a, 16, 16, 16) : Color.FromArgb(a, 243, 243, 243));
    }

    private static bool TryParseColor(string hex, out Color color)
    {
        color = default;
        var t = (hex ?? "").Trim();
        if (t.StartsWith('#')) t = t[1..];
        try
        {
            if (t.Length == 3)
            {
                color = Color.FromArgb(255, Convert.ToByte(new string(t[0], 2), 16), Convert.ToByte(new string(t[1], 2), 16), Convert.ToByte(new string(t[2], 2), 16));
                return true;
            }
            if (t.Length == 6)
            {
                color = Color.FromArgb(255, Convert.ToByte(t[..2], 16), Convert.ToByte(t[2..4], 16), Convert.ToByte(t[4..6], 16));
                return true;
            }
            if (t.Length == 8)
            {
                color = Color.FromArgb(Convert.ToByte(t[..2], 16), Convert.ToByte(t[2..4], 16), Convert.ToByte(t[4..6], 16), Convert.ToByte(t[6..8], 16));
                return true;
            }
        }
        catch { }
        return false;
    }
}
