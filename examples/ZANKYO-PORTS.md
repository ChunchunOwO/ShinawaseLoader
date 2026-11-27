# Streaming, MV and Lyrics Match on Zankyo

The three active `.echomod` packages retain their Electron `entry` and declare a
separate `zankyo.entry`. The external entry runs in ShinawaseLoader over the
launch-owned encrypted native session. Existing `gpui.entry` declarations are
separate Workshop packages; they are not used to execute these external ports.
A matching ECHO GPUI build with `providers.register/poll/reply` is required.

Open the fixed Shinawase sidebar drawer and select **流媒体**, **MV**, or
**歌词匹配** after enabling the corresponding package. Startup still displays
the Zankyo experimental notice. No startup card or embedded browser is used.

## Streaming 1.7.7

- Search tracks, albums, artists and playlists; paginate results; browse
  account playlists, liked music and daily recommendations where provided.
- Play a track or the current page, append to the native queue, or play next.
  Queue entries persist provider IDs. URLs are resolved at playback time.
- Select audio quality. NetEase accepts QR or SMS login and personal cookies;
  the other services accept their existing cookie/token credentials.
- NetEase, QQ Music, Bilibili, SoundCloud, YouTube and Qobuz retain their
  upstream provider behavior. SoundCloud/YouTube require a separately available
  `yt-dlp` and the user's selected login source.
- Spotify and TIDAL provide catalog browsing. Upstream Spotify playback depends
  on the Web Playback SDK; TIDAL explicitly exposes catalog-only support.
  Native playback is unavailable through those upstream interfaces.
- Exact source lyrics are registered when the provider implements them.
  Trial-only NetEase responses are rejected before legacy mapping.

Credentials belong to this Mod's local Loader settings, separate from the
Electron account store. Password controls never display saved credentials.
An expired access token must be replaced; the external token form does not
perform Spotify/TIDAL OAuth refresh.

## MV 1.0.26

The external entry reuses `main.cjs`, including local-file matching, Bilibili
search/scoring, quality negotiation, remembered selections, manual video links,
offsets and audio-start detection. Candidate selection and the native managed
MV session share the same engine. Select **启用此 MV 来源** or open the native
MV panel from the Mod page.

Local video and network video pass through a package-owned tokenized loopback
relay with range support. Playback/rendering stays in the existing native MV
host. YouTube search requires the existing API-key configuration; the upstream
engine provides external playback for YouTube video. Use **外部打开** for those
results. The Mod does not invent a new YouTube video resolver.

## Lyrics Match Whitebox 1.3.4

The native page provides multi-source lookup, source filters, full lyric,
translation and romanization previews, apply, remembered choices, offset,
clear-override and instrumental controls. It retains the Electron title
normalizer, including optional Traditional Chinese conversion, kana folding,
noise removal and version-tag retention.

Providers are AMLL TTML, NetEase, QQ Music and LRCLIB. Enable the Whitebox source
with **启用白盒自动匹配**; it participates in the normal native lyrics matching
path. Remembered choices are bounded to 128 track identities and contain
provider IDs rather than lyric documents. Writes include the captured track
instance, so an old candidate cannot be applied to a newly playing track.
Streaming tracks require a lyrics-capable source, which Streaming supplies.

## Source and rebuild

Platform providers are built from the owner's original ECHO checkout at
`48f57affcf7b265aeecf918cc006a51949171096` (the parent of the service-removal
commit). Source availability and explicit workspace-owner porting permission
are recorded in generated headers. The original source-available license and
third-party notices travel with each generated bundle.

```powershell
node scripts/build-zankyo-backends.mjs "<ECHO_SOURCE>"
node --test tests/zankyo-examples.test.mjs
node scripts/pack-echomod.mjs examples/ECHO-Streaming/echomod examples/packages/ECHO-Streaming.echomod --zip
node scripts/pack-echomod.mjs examples/ECHO-MV/echomod examples/packages/ECHO-MV.echomod --zip
node scripts/pack-echomod.mjs examples/ECHO-LyricsMatchWhitebox/echomod examples/packages/ECHO-LyricsMatchWhitebox.echomod --zip
```

The builder reads the fixed Git source, uses that checkout's installed
`esbuild`, bundles the original provider code, and replaces Electron/account/
network boundaries with Loader-side adapters. The native host contains no
service names, credentials, search endpoints or platform parsing.

Offline tests execute the actual external modules and shared Loader lifecycle.
They validate callback routing, stable queue submissions, range relays,
candidate application and cleanup. They do not prove account entitlement,
external service availability, native audio/video decode, or visual parity.
