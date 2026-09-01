using System.IO.Pipes;
using System.Text;
using System.Text.Json;
using Microsoft.UI.Dispatching;

namespace Echo.AudioBand;

internal static class Protocol
{
    private static readonly object Gate = new();
    private static StreamWriter? _out;
    private static StreamReader? _in;
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    public static void BindStdio()
    {
        try
        {
            Console.InputEncoding = Encoding.UTF8;
            Console.OutputEncoding = Encoding.UTF8;
            _in = new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
            _out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)) { AutoFlush = true };
            Console.SetOut(_out);
        }
        catch { }
    }

    public static void BindPipe(string name)
    {
        var pipe = new NamedPipeClientStream(".", name, PipeDirection.InOut, PipeOptions.Asynchronous);
        pipe.Connect(4000);
        _in = new StreamReader(pipe, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, bufferSize: 4096, leaveOpen: true);
        _out = new StreamWriter(pipe, new UTF8Encoding(false), 4096, leaveOpen: true) { AutoFlush = true };
    }

    public static void Send(string op, object? payload = null)
    {
        try
        {
            var line = JsonSerializer.Serialize(new HostMessage { Version = 1, Op = op, Payload = payload }, JsonOptions);
            lock (Gate)
            {
                var writer = _out ?? Console.Out;
                writer.Write(line);
                writer.Write('\n');
                writer.Flush();
            }
        }
        catch { }
    }

    public static void Log(string level, string message) => Send("log", new { level, message });

    public static void Command(string action, object? extra = null)
    {
        if (extra is null)
        {
            Send("command", new { action });
            return;
        }
        Send("command", extra);
    }

    public static void StartReader(DispatcherQueue queue, Action<string, JsonElement> onMessage, Action onClosed)
    {
        _ = Task.Run(async () =>
        {
            try
            {
                var reader = _in ?? new StreamReader(Console.OpenStandardInput(), Encoding.UTF8);
                while (true)
                {
                    string? line;
                    try { line = await reader.ReadLineAsync().ConfigureAwait(false); }
                    catch { break; }
                    if (line is null)
                    {
                        queue.TryEnqueue(() => onClosed());
                        break;
                    }
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    string op;
                    JsonElement payload;
                    try
                    {
                        using var doc = JsonDocument.Parse(line);
                        var root = doc.RootElement;
                        op = root.TryGetProperty("op", out var opEl) ? opEl.GetString() ?? "" : "";
                        payload = root.TryGetProperty("payload", out var p) ? p.Clone() : default;
                    }
                    catch { continue; }
                    queue.TryEnqueue(() =>
                    {
                        try { onMessage(op, payload); }
                        catch (Exception ex) { Log("WARN", ex.Message); }
                    });
                }
            }
            catch (Exception ex)
            {
                queue.TryEnqueue(() =>
                {
                    Log("WARN", ex.Message);
                    onClosed();
                });
            }
        });
    }

    public static T? Read<T>(JsonElement payload) where T : class
    {
        try
        {
            if (payload.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null) return null;
            return JsonSerializer.Deserialize<T>(payload.GetRawText(), JsonOptions);
        }
        catch
        {
            return null;
        }
    }
}
