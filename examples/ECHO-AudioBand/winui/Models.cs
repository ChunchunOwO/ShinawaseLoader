using System.Text.Json.Serialization;

namespace Echo.AudioBand;

internal sealed class BandConfig
{
    public string Locale { get; set; } = "auto";
    public int WidgetWidth { get; set; } = 360;
    public int UiScale { get; set; } = 100;
    public string Alignment { get; set; } = "right";
    public int OffsetX { get; set; } = 12;
    public int OffsetY { get; set; } = 0;
    public string Monitor { get; set; } = "primary";
    public int CustomHeight { get; set; } = 48;
    public bool ShowAlbumArt { get; set; } = true;
    public bool ShowControls { get; set; } = true;
    public bool ShowProgress { get; set; } = true;
    public bool ShowTime { get; set; } = false;
    public string Theme { get; set; } = "auto";
    public string AccentColor { get; set; } = "#4da3ff";
    public int BackgroundOpacity { get; set; } = 88;
    public bool ScrollingText { get; set; } = true;
    public bool AutoHideWhenStopped { get; set; }
    public int PollIntervalMs { get; set; } = 1000;
    public bool AutoAvoidTray { get; set; } = true;
    public bool SeamlessMode { get; set; }
    public bool HoverPreview { get; set; } = true;
    public string Backdrop { get; set; } = "mica";
    public bool HideWhenFullscreen { get; set; } = true;
    public bool HideWhenPresentation { get; set; } = true;
}

internal sealed class BandStatus
{
    public string State { get; set; } = "idle";
    public bool Playing { get; set; }
    public string Title { get; set; } = "";
    public string Artist { get; set; } = "";
    public string Album { get; set; } = "";
    public string CoverUrl { get; set; } = "";
    public double PositionSeconds { get; set; }
    public double DurationSeconds { get; set; }
    public string TrackKey { get; set; } = "";
    public bool OfficialEnabled { get; set; } = true;
    public string LyricsCurrent { get; set; } = "";
    public string LyricsNext { get; set; } = "";
    public bool LyricsHas { get; set; }
    public bool LyricsInstrumental { get; set; }
}

internal sealed class HostMessage
{
    [JsonPropertyName("v")]
    public int Version { get; set; }

    [JsonPropertyName("op")]
    public string? Op { get; set; }

    [JsonPropertyName("payload")]
    public object? Payload { get; set; }
}

internal readonly record struct RectI(int X, int Y, int W, int H)
{
    public int Right => X + W;
    public int Bottom => Y + H;
    public bool Ok => W >= 0 && H >= 0;
}

internal readonly record struct ShellSnap(
    RectI? Tray,
    RectI? Notify,
    RectI? Apps,
    string TaskbarAlign,
    bool LightTheme,
    bool D3dFullscreen,
    bool Presentation,
    bool ExclusiveFullscreen);
