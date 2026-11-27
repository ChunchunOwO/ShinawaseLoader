import { configure, requests } from './boundary';
import { NeteaseLyricsProvider } from 'echo-source:src/main/lyrics/NeteaseLyricsProvider.ts';
import { QQMusicLyricsProvider } from 'echo-source:src/main/lyrics/QQMusicLyricsProvider.ts';
import { LrclibProvider } from 'echo-source:src/main/lyrics/LrclibProvider.ts';
import { AmllTtmlLyricsProvider } from 'echo-source:src/main/lyrics/AmllTtmlLyricsProvider.ts';
import { buildNormalizedLyricsQuery } from 'echo-source:src/main/lyrics/lyricsQueryBuilder.ts';
export function create(read: () => Record<string, any>) {
  configure(read);
  const providers = new Map([['netease', new NeteaseLyricsProvider()], ['qqmusic', new QQMusicLyricsProvider()],
    ['lrclib', new LrclibProvider()], ['amll-ttml', new AmllTtmlLyricsProvider()]]);
  return {
    providers,
    async search(id: string, track: any, signal: AbortSignal) {
      signal.throwIfAborted();
      const instance = providers.get(id);
      if (!instance) throw new Error('Unknown lyrics source');
      const query = { ...track, durationSeconds: track.durationSeconds || null };
      const results = await requests.run({ signal }, () => instance.search({
        query, normalized: buildNormalizedLyricsQuery(query), signal, timeoutMs: 8000, collectAllCandidates: true,
      }));
      signal.throwIfAborted();
      return results.slice(0, 24).map(({ raw, ...result }) => ({ ...result, album: result.album || '' }));
    },
    async byId(id: string, lyricsId: string, track: any, signal: AbortSignal) {
      const instance: any = providers.get(id);
      if (!instance?.getById) return null;
      return requests.run({ signal }, () => instance.getById(lyricsId, { query: track,
        normalized: buildNormalizedLyricsQuery(track), signal, timeoutMs: 8000, collectAllCandidates: false }));
    },
  };
}
