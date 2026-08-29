using Microsoft.UI.Xaml;

namespace Echo.AudioBand;

public partial class App : Application
{
    private MainWindow? _window;

    public App()
    {
        InitializeComponent();
        BindHost();
        UnhandledException += (_, e) =>
        {
            Protocol.Log("ERROR", e.Message);
            e.Handled = true;
        };
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        _window = new MainWindow();
    }

    private static void BindHost()
    {
        try
        {
            var args = Environment.GetCommandLineArgs();
            for (var i = 0; i < args.Length - 1; i++)
            {
                if (!string.Equals(args[i], "--pipe", StringComparison.OrdinalIgnoreCase)) continue;
                Protocol.BindPipe(args[i + 1] ?? "");
                Protocol.Send("hello", new { pid = Environment.ProcessId });
                return;
            }
            Protocol.BindStdio();
        }
        catch
        {
        }
    }
}
