using Microsoft.UI.Text;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Windows.UI;

namespace Echo.AudioBand;

internal sealed class PreviewWindow
{
    private const int CoverSize = 200;
    private const int Width = 220;
    private const int Radius = 12;

    private readonly Window _window;
    private readonly AppWindow? _app;
    private readonly nint _hwnd;
    private readonly Grid _fill;
    private readonly StackPanel _card;
    private readonly Border _art;
    private double _scale = 1;
    private readonly FontIcon _note = new() { Glyph = "\uE8D6", FontSize = 44, HorizontalAlignment = HorizontalAlignment.Center, VerticalAlignment = VerticalAlignment.Center };
    private readonly TextBlock _title;
    private readonly TextBlock _artist;
    private readonly TextBlock _album;
    private readonly FontIcon _artistIcon;
    private readonly FontIcon _albumIcon;
    private readonly Grid _albumRow;
    private bool _visible;
    private bool _shown;
    private bool _warming;
    private int _warmFrames;
    private RectI _dest;
    private EventHandler<object>? _warmTick;

    public PreviewWindow()
    {
        _title = Line(12, FontWeights.SemiBold, 1);
        _title.Margin = new Thickness(0, 4, 0, 0);
        _artist = Line(10, FontWeights.Normal, 0.78);
        _album = Line(10, FontWeights.Normal, 0.58);
        _artistIcon = Glyph("\uE77B");
        _albumIcon = Glyph("\uE93C");
        _art = new Border
        {
            Width = CoverSize,
            Height = CoverSize,
            HorizontalAlignment = HorizontalAlignment.Center,
            CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(Color.FromArgb(0x33, 0x80, 0x80, 0x80)),
            Child = _note,
        };
        var artistRow = MetaRow(_artistIcon, _artist);
        _albumRow = MetaRow(_albumIcon, _album);
        _card = new StackPanel
        {
            Spacing = 2,
            Children = { _art, _title, artistRow, _albumRow },
        };
        _fill = new Grid
        {
            Background = new SolidColorBrush(Color.FromArgb(255, 16, 16, 16)),
            Padding = new Thickness(10, 10, 10, 8),
            Children = { _card },
        };
        _window = new Window { Title = "ECHO AudioBand Cover" };
        try { _window.ExtendsContentIntoTitleBar = false; } catch { }
        try { _fill.RequestedTheme = ElementTheme.Dark; } catch { }
        _window.Content = _fill;
        _hwnd = Native.HwndOf(_window);
        _app = Native.AppWindowOf(_window);
        try
        {
            if (_app is not null)
            {
                _app.IsShownInSwitchers = false;
                try { _app.TitleBar.ExtendsContentIntoTitleBar = false; } catch { }
                try { _app.TitleBar.PreferredHeightOption = TitleBarHeightOption.Collapsed; } catch { }
                if (_app.Presenter is OverlappedPresenter presenter)
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
                Native.ApplyCorners(_hwnd, true);
                Native.Cloak(_hwnd, true);
                Park();
            }
        }
        catch { }
    }

    private int CoverPx => Math.Max(80, (int)Math.Round(CoverSize * _scale));
    private int WidthPx => Math.Max(120, (int)Math.Round(Width * _scale));
    private int RadiusPx => Math.Max(4, (int)Math.Round(Radius * _scale));
    private int CardHeight(bool album) => Math.Max(160, (int)Math.Round((album ? 272 : 256) * _scale));

    public void SetScale(double scale)
    {
        if (scale < 0.5 || scale > 2) scale = 1;
        if (Math.Abs(scale - _scale) < 0.001) return;
        _scale = scale;
        _art.Width = CoverPx;
        _art.Height = CoverPx;
        _art.CornerRadius = new CornerRadius(Math.Max(4, 8 * _scale));
        _note.FontSize = 44 * _scale;
        _title.FontSize = 12 * _scale;
        _title.Margin = new Thickness(0, 4 * _scale, 0, 0);
        _artist.FontSize = 10 * _scale;
        _album.FontSize = 10 * _scale;
        _artistIcon.FontSize = 10 * _scale;
        _artistIcon.Width = 12 * _scale;
        _artistIcon.Margin = new Thickness(0, 0, 4 * _scale, 0);
        _albumIcon.FontSize = 10 * _scale;
        _albumIcon.Width = 12 * _scale;
        _albumIcon.Margin = new Thickness(0, 0, 4 * _scale, 0);
        _card.Spacing = 2 * _scale;
        _fill.Padding = new Thickness(10 * _scale, 10 * _scale, 10 * _scale, 8 * _scale);
    }

    public void SetCover(ImageSource? source)
    {
        if (source is null) return;
        if (_art.Background is ImageBrush brush)
        {
            brush.ImageSource = source;
        }
        else
        {
            _art.Background = new ImageBrush { ImageSource = source, Stretch = Stretch.UniformToFill };
        }
        _art.Child = null;
    }

    public void Show(RectI band, string title, string artist, string album, bool dark)
    {
        var hasAlbum = !string.IsNullOrWhiteSpace(album);
        _title.Text = string.IsNullOrWhiteSpace(title) ? "ECHO" : title;
        _artist.Text = string.IsNullOrWhiteSpace(artist) ? " " : artist;
        _album.Text = hasAlbum ? album : "";
        _albumRow.Visibility = hasAlbum ? Visibility.Visible : Visibility.Collapsed;
        var card = Color.FromArgb(255, 16, 16, 16);
        var fg = dark ? Color.FromArgb(255, 245, 245, 245) : Color.FromArgb(255, 236, 236, 236);
        var muted = Color.FromArgb(200, 220, 220, 220);
        _fill.Background = new SolidColorBrush(card);
        _title.Foreground = new SolidColorBrush(fg);
        var dim = new SolidColorBrush(muted);
        _artist.Foreground = dim;
        _album.Foreground = dim;
        _artistIcon.Foreground = dim;
        _albumIcon.Foreground = dim;
        var height = CardHeight(hasAlbum);
        var x = band.X;
        var y = band.Y - height - 8;
        if (y < 0) y = band.Y + band.H + 8;
        _dest = new RectI(x, y, WidthPx, height);
        _visible = true;
        if (_app is null) return;
        Native.SetDarkClassBrush(_hwnd);
        Native.ApplyPopupChrome(_hwnd, extendFrame: false, glassCaption: false);
        Native.ApplyCaptionColor(_hwnd, true);
        if (!_shown)
        {
            Native.Cloak(_hwnd, true);
            Native.TryMove(_app, new RectI(-32000, -32000, WidthPx, height), keepOnTaskbar: false);
            try { _app.Show(false); } catch { }
            _shown = true;
            ArmWarm();
            return;
        }
        if (_warming) return;
        PlaceOnScreen();
    }

    public void Hide()
    {
        if (!_visible) return;
        _visible = false;
        Native.Cloak(_hwnd, true);
        Park();
    }

    private void ArmWarm()
    {
        if (_warming) return;
        _warming = true;
        _warmFrames = 0;
        _warmTick = OnWarm;
        CompositionTarget.Rendering += _warmTick;
    }

    private void OnWarm(object? sender, object e)
    {
        _warmFrames++;
        if (_warmFrames < 2) return;
        if (_warmTick is not null) CompositionTarget.Rendering -= _warmTick;
        _warmTick = null;
        _warming = false;
        if (_visible) PlaceOnScreen();
    }

    private void PlaceOnScreen()
    {
        if (_app is null || !_visible) return;
        Native.TryMove(_app, _dest, keepOnTaskbar: false);
        Native.ApplyCorners(_hwnd, true);
        Native.ApplyRoundRegion(_hwnd, RadiusPx);
        Native.RaiseTopmost(_hwnd);
        Native.Cloak(_hwnd, false);
    }

    private void Park()
    {
        if (_app is not null)
        {
            try { Native.TryMove(_app, new RectI(-32000, -32000, WidthPx, CardHeight(false)), keepOnTaskbar: false); } catch { }
        }
    }

    private static Grid MetaRow(FontIcon icon, TextBlock text)
    {
        icon.Margin = new Thickness(0, 0, 4, 0);
        var row = new Grid();
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        Grid.SetColumn(text, 1);
        row.Children.Add(icon);
        row.Children.Add(text);
        return row;
    }

    private static FontIcon Glyph(string glyph)
        => new()
        {
            Glyph = glyph,
            FontSize = 10,
            Width = 12,
            VerticalAlignment = VerticalAlignment.Center,
        };

    private static TextBlock Line(double size, Windows.UI.Text.FontWeight weight, double opacity)
        => new()
        {
            FontSize = size,
            FontWeight = weight,
            Opacity = opacity,
            TextTrimming = TextTrimming.CharacterEllipsis,
            TextWrapping = TextWrapping.NoWrap,
        };
}
