import { configure, requests } from './boundary';
import { NeteaseStreamingProvider, setNeteaseApiForTests } from 'echo-source:src/main/streaming/providers/NeteaseStreamingProvider.ts';
import { QQMusicStreamingProvider } from 'echo-source:src/main/streaming/providers/QQMusicStreamingProvider.ts';
import { BilibiliStreamingProvider } from 'echo-source:src/main/streaming/providers/BilibiliStreamingProvider.ts';
import { SoundCloudStreamingProvider } from 'echo-source:src/main/streaming/providers/SoundCloudStreamingProvider.ts';
import { YouTubeStreamingProvider } from 'echo-source:src/main/streaming/providers/YouTubeStreamingProvider.ts';
import { SpotifyStreamingProvider } from 'echo-source:src/main/streaming/providers/SpotifyStreamingProvider.ts';
import { TidalStreamingProvider } from 'echo-source:src/main/streaming/providers/TidalStreamingProvider.ts';
import { QobuzStreamingProvider } from 'echo-source:src/main/streaming/providers/QobuzStreamingProvider.ts';
export function create(read: () => Record<string, any>, ncm: any) {
  configure(read);
  setNeteaseApiForTests(ncm);
  const providers = new Map([
    ['netease', new NeteaseStreamingProvider()], ['qqmusic', new QQMusicStreamingProvider()],
    ['bilibili', new BilibiliStreamingProvider()], ['soundcloud', new SoundCloudStreamingProvider()],
    ['youtube', new YouTubeStreamingProvider()], ['spotify', new SpotifyStreamingProvider()],
    ['tidal', new TidalStreamingProvider()], ['qobuz', new QobuzStreamingProvider()],
  ]);
  return {
    providers,
    async invoke(provider: string, method: string, input: any, signal: AbortSignal) {
      signal.throwIfAborted();
      const instance: any = providers.get(provider);
      if (typeof instance?.[method] !== 'function') throw new Error(`${provider}: ${method} unavailable`);
      const result = await requests.run({ signal }, () => instance[method](input));
      signal.throwIfAborted();
      return result;
    },
  };
}
