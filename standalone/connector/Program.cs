using System.Collections.Concurrent;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.Server.Kestrel.Core;

static class Program
{
    const int Port = 47831;
#if NEXO_PRODUCTION
    const string AppOrigin = "https://nexo-inventario.loby207.workers.dev";
    const string WindowTitle = "Conector Nexo";
#else
    const string AppOrigin = "https://nexo-inventario-validacion.loby207.workers.dev";
    const string WindowTitle = "Conector Nexo · Validación";
#endif
    static readonly ConcurrentDictionary<string, Relay> Sessions = new();
    const string Version = "2.0.0";
    static string ReaderOrigin(string origin) => origin switch {"https://nexo-inventario.loby207.workers.dev" => "https://nexo-escaner.loby207.workers.dev", "https://nexo-inventario-validacion.loby207.workers.dev" => "https://nexo-escaner-validacion.loby207.workers.dev", _ => origin};
    static readonly HashSet<string> Origins = ["https://nexo-escaner.loby207.workers.dev", "https://nexo-escaner-validacion.loby207.workers.dev","https://nexo-inventario.loby207.workers.dev", "https://nexo-inventario-validacion.loby207.workers.dev"];
    static string Token() => Convert.ToBase64String(RandomNumberGenerator.GetBytes(32)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    static bool Private(IPAddress? ip) { if (ip is null) return false; if (ip.IsIPv4MappedToIPv6) ip = ip.MapToIPv4(); if (IPAddress.IsLoopback(ip)) return true; var b = ip.GetAddressBytes(); return b.Length == 4 && (b[0] == 10 || b[0] == 172 && b[1] >= 16 && b[1] <= 31 || b[0] == 192 && b[1] == 168); }
    static bool Local(HttpContext c) => IPAddress.IsLoopback(c.Connection.RemoteIpAddress ?? IPAddress.None);
    static bool Equal(string a, string b) => a.Length == b.Length && CryptographicOperations.FixedTimeEquals(System.Text.Encoding.UTF8.GetBytes(a), System.Text.Encoding.UTF8.GetBytes(b));
    static object Addresses() => NetworkInterface.GetAllNetworkInterfaces().Where(n => n.OperationalStatus == OperationalStatus.Up && n.NetworkInterfaceType != NetworkInterfaceType.Loopback).SelectMany(n => n.GetIPProperties().UnicastAddresses).Select(a => a.Address).Where(a => a.AddressFamily == AddressFamily.InterNetwork && Private(a) && !IPAddress.IsLoopback(a)).Select(a => $"http://{a}:{Port}").Distinct().ToArray();

    [STAThread]
    static void Main(string[] args)
    {
        var headless = args.Contains("--headless");
        if (args.Contains("--dev")) { Origins.Add("http://127.0.0.1:5191"); Origins.Add("http://127.0.0.1:5190"); }
        var builder = WebApplication.CreateSlimBuilder(args);
        builder.Logging.ClearProviders(); // Never log URLs, capabilities, packets or request bodies.
        builder.WebHost.ConfigureKestrel(k => { k.Listen(IPAddress.Any, headless && args.Contains("--dev") && int.TryParse(Environment.GetEnvironmentVariable("NEXO_CONNECTOR_TEST_PORT"),out var testPort) ? testPort : Port, o => o.Protocols = HttpProtocols.Http1); k.Limits.MaxRequestBodySize = 32768; k.Limits.MaxConcurrentConnections = 32; k.Limits.RequestHeadersTimeout = TimeSpan.FromSeconds(5); });
        var app = builder.Build();
        app.Use(async (c, next) => {
            var origin = c.Request.Headers.Origin.ToString();
            if (!Private(c.Connection.RemoteIpAddress) || !Origins.Contains(origin)) { c.Response.StatusCode = 403; return; }
            c.Response.Headers["Access-Control-Allow-Origin"] = origin;
            c.Response.Headers["Vary"] = "Origin";
            c.Response.Headers["Cache-Control"] = "no-store";
            c.Response.Headers["X-Content-Type-Options"] = "nosniff";
            if (c.Request.Method == "OPTIONS") { c.Response.Headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"; c.Response.Headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"; c.Response.StatusCode = 204; return; }
            try { await next(c); } catch (JsonException) { c.Response.StatusCode = 400; } catch (Microsoft.AspNetCore.Http.BadHttpRequestException) { c.Response.StatusCode = 413; }
        });
        app.MapGet("/v1/health", (HttpContext c) => Local(c) ? Results.Json(new { v = 1, protocol = 2, version = Version, name = "Conector Nexo", site = AppOrigin, endpoints = Addresses() }) : Results.StatusCode(403));
        app.MapPost("/v1/sessions", (HttpContext c) => {
            if (!Local(c) || c.Request.Headers.Origin.ToString().Contains("nexo-escaner")) return Results.StatusCode(403);
            foreach (var old in Sessions.Where(s => s.Value.Expired)) Sessions.TryRemove(old.Key, out _);
            if (Sessions.Count >= 4) return Results.StatusCode(429);
            var id = Guid.NewGuid().ToString(); var s = new Relay(origin: c.Request.Headers.Origin.ToString()); Sessions[id] = s;
            return Results.Json(new { v = 1, session = id, hostToken = s.HostToken, joinToken = s.JoinToken, expiresAt = s.JoinUntil.ToUnixTimeMilliseconds(), endpoints = Addresses() });
        });
        app.MapPost("/v1/sessions/{id}/claim", (HttpContext c, string id) => {
            if (!Sessions.TryGetValue(id, out var s) || s.Expired || (ReaderOrigin(s.Origin) != c.Request.Headers.Origin.ToString() && s.Origin != c.Request.Headers.Origin.ToString())) return Results.StatusCode(410);
            lock (s) {
                if (s.PhoneToken != null || DateTimeOffset.UtcNow > s.JoinUntil || !Equal(c.Request.Headers.Authorization.ToString(), "Bearer " + s.JoinToken)) return Results.StatusCode(403);
                s.PhoneOrigin = c.Request.Headers.Origin.ToString(); s.PhoneToken = Token(); return Results.Json(new { token = s.PhoneToken });
            }
        });
        app.MapMethods("/v1/sessions/{id}/{side}", ["GET", "POST", "DELETE"], async (HttpContext c, string id, string side) => {
            if (!Sessions.TryGetValue(id, out var s) || s.Expired) return Results.StatusCode(410);
            var host = side == "host";
            if ((host ? s.Origin : s.PhoneOrigin) != c.Request.Headers.Origin.ToString()) return Results.StatusCode(403);
            if ((!host && side != "phone") || host && !Local(c)) return Results.StatusCode(403);
            var cap = host ? s.HostToken : s.PhoneToken;
            if (cap == null || !Equal(c.Request.Headers.Authorization.ToString(), "Bearer " + cap)) return Results.StatusCode(403);
            if (c.Request.Method == "DELETE") { if (!host) return Results.StatusCode(403); Sessions.TryRemove(id, out _); return Results.Ok(); }
            var incoming = host ? s.ToHost : s.ToPhone;
            if (c.Request.Method == "GET") {
                long.TryParse(c.Request.Query["after"], out var after);
                lock (s) { s.LastSeen = DateTimeOffset.UtcNow; incoming.RemoveAll(p=>p.Sequence<=after); return Results.Json(new { packets = incoming.Take(32).Select(p => new { sequence = p.Sequence, packet = p.Packet }).ToArray() }); }
            }
            if (!c.Request.HasJsonContentType()) return Results.StatusCode(415);
            var value = await JsonDocument.ParseAsync(c.Request.Body, new JsonDocumentOptions { MaxDepth = 4 }, c.RequestAborted);
            var p = value.RootElement;
            if (p.ValueKind != JsonValueKind.Object || !p.TryGetProperty("v", out var v) || v.GetInt32() != 1 || !p.TryGetProperty("iv", out var iv) || iv.ValueKind != JsonValueKind.String || iv.GetString()!.Length > 30 || !p.TryGetProperty("data", out var data) || data.ValueKind != JsonValueKind.String || data.GetString()!.Length > 24000) return Results.BadRequest();
            lock (s) {
                var queue = host ? s.ToPhone : s.ToHost;
                // Strictly bounded memory; acknowledged cursors release packets. No disk state.
                if (queue.Count >= 256) return Results.StatusCode(429);
                var now = DateTimeOffset.UtcNow; if (now - s.Window > TimeSpan.FromSeconds(1)) { s.Window = now; s.Sent = 0; } if (++s.Sent > 40) return Results.StatusCode(429);
                s.LastSeen = now; queue.Add(new(++s.Sequence, p.Clone())); return Results.Ok();
            }
        });
        // Poll cursors are used as delivery receipts; scan ACKs remain end-to-end encrypted.
        using var cleanup = new System.Threading.Timer(_ => { foreach (var s in Sessions.Where(s => s.Value.Expired)) Sessions.TryRemove(s.Key, out var ignored); }, null, 60000, 60000);
        var server = app.StartAsync();
        try { server.GetAwaiter().GetResult(); }
        catch { if (!headless) MessageBox.Show("No se pudo abrir el puerto 47831. Comprueba si Conector Nexo ya está abierto.", "Conector Nexo"); return; }
        if (headless) app.WaitForShutdownAsync().GetAwaiter().GetResult();
        else {
            System.Windows.Forms.Application.EnableVisualStyles();
            var form = new Form { Text = WindowTitle+" · "+Version, Width = 460, Height = 390, StartPosition = FormStartPosition.CenterScreen, FormBorderStyle = FormBorderStyle.FixedDialog, MaximizeBox = false };
            var label = new Label { Left = 24, Top = 24, Width = 390, Height = 230, Text = "Conector 2.0.0 listo\n"+AppOrigin+"\n\nPuedes minimizar esta ventana. En Nexo pulsa «Conectar celular» y comprueba el conector. Elige venta o compra desde el lector del celular.\n\nConecta ambos equipos al mismo Wi-Fi o hotspot. Si Windows lo solicita, permite acceso solo en redes privadas." };
            var open = new Button { Text = "Abrir Nexo", Left = 24, Top = 280, Width = 180, Height = 38 };
            open.Click += (_, _) => System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(AppOrigin) { UseShellExecute = true });
            form.Controls.Add(label); form.Controls.Add(open); System.Windows.Forms.Application.Run(form);
        }
        app.StopAsync().GetAwaiter().GetResult();
    }
    sealed record Queued(long Sequence, JsonElement Packet);
    sealed class Relay(string origin) {
        public string Origin = origin, HostToken = Token(), JoinToken = Token(); public string? PhoneToken, PhoneOrigin;
        public DateTimeOffset JoinUntil = DateTimeOffset.UtcNow.AddMinutes(3), LastSeen = DateTimeOffset.UtcNow, Window = DateTimeOffset.UtcNow, Created = DateTimeOffset.UtcNow;
        public int Sent; public long Sequence; public List<Queued> ToHost = [], ToPhone = [];
        public bool Expired => DateTimeOffset.UtcNow - LastSeen > TimeSpan.FromMinutes(5) || DateTimeOffset.UtcNow - Created > TimeSpan.FromHours(8);
    }
}
