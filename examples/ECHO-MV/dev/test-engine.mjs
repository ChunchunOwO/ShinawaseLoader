import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const { createEngine } = require('../echomod/main.cjs');

const snapshot = {
  trackId: 'test:yoasobi-idol',
  title: 'アイドル',
  artist: 'YOASOBI',
  album: 'アイドル',
  durationSeconds: 213,
  mediaType: 'streaming',
  autoSelect: false,
};

const summarizeCandidate = (candidate) => ({
  id: candidate?.id ?? null,
  provider: candidate?.provider ?? null,
  title: candidate?.title ?? null,
  uploader: candidate?.uploader ?? null,
  score: candidate?.score ?? null,
  autoEligible: candidate?.autoEligible ?? null,
  durationSeconds: candidate?.durationSeconds ?? null,
  playableInApp: candidate?.playableInApp ?? null,
  reasons: candidate?.reasons ?? [],
  decision: candidate?.decision
    ? {
      score: candidate.decision.score,
      autoAccept: candidate.decision.autoAccept,
      risk: candidate.decision.risk,
      algorithmVersion: candidate.decision.algorithmVersion,
    }
    : null,
});

const summarizeVariant = (variant) => ({
  id: variant?.id ?? null,
  label: variant?.label ?? null,
  protocol: variant?.protocol ?? null,
  playableInApp: variant?.playableInApp ?? null,
  qualityTier: variant?.qualityTier ?? null,
  height: variant?.height ?? null,
  fps: variant?.fps ?? null,
  codec: variant?.codec ?? null,
  requiresAccount: variant?.requiresAccount ?? null,
  expiresAt: variant?.expiresAt ?? null,
});

const main = async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'echo-mv-engine-'));
  const logs = [];
  const engine = createEngine({
    fetchImpl: globalThis.fetch.bind(globalThis),
    dataDir,
    config: { youtubeApiKey: '', bilibiliCookie: '', debugLog: true },
    log: (level, message) => {
      logs.push({ level, message });
      console.log(`[${level}] ${message}`);
    },
  });

  const report = {
    ok: false,
    dataDir,
    wbi: null,
    searchQuery: 'YOASOBI アイドル',
    candidates: [],
    resolve: null,
    blocked: false,
    notes: [],
  };

  try {
    report.wbi = await engine.testWbi();
    console.log('[wbi]', JSON.stringify({
      ok: report.wbi.ok,
      syntheticOk: report.wbi.syntheticOk,
      mixinKeyLength: report.wbi.signed?.mixinKeyLength ?? null,
      w_rid: report.wbi.signed?.w_rid ?? null,
      error: report.wbi.error ?? null,
      tsPairsEven: report.wbi.tsPairsEven,
    }));
    if (!report.wbi.syntheticOk) {
      report.notes.push('WBI mixin table self-check failed');
    }

    const candidates = await engine.searchNetworkCandidates({
      snapshot,
      query: 'YOASOBI アイドル',
    });
    report.candidates = candidates.slice(0, 3).map(summarizeCandidate);
    console.log(`[search] count=${candidates.length}`);
    for (const [index, candidate] of report.candidates.entries()) {
      console.log(`[candidate ${index + 1}] score=${candidate.score} auto=${candidate.autoEligible} title=${candidate.title} uploader=${candidate.uploader}`);
    }

    if (candidates.length === 0) {
      report.blocked = logs.some((entry) => /412|banned|wbi/i.test(entry.message)) || report.wbi?.lastNetworkStatus === 412;
      report.notes.push(report.blocked ? 'Bilibili search returned no candidates (likely 412/WBI/nav failure)' : 'Bilibili search returned no candidates');
    } else {
      const first = candidates[0];
      const resolved = await engine.resolveStreams({ videoId: first.id });
      const variants = resolved.variants || [];
      const video = resolved.video;
      const blocked = Boolean(video?.rawProviderJson?.unavailableReason === 'bilibili-playurl-blocked') ||
        variants.some((variant) => variant.rawProviderJson?.unavailableReason === 'bilibili-playurl-blocked');
      const hasDirect = variants.some((variant) => variant.protocol === 'direct' && variant.playableInApp);
      report.blocked = blocked;
      report.resolve = {
        videoId: video?.id ?? null,
        provider: video?.provider ?? null,
        playableInApp: video?.playableInApp ?? null,
        mediaUrl: video?.mediaUrl ?? null,
        qualityLabel: video?.qualityLabel ?? null,
        unavailableReason: video?.rawProviderJson?.unavailableReason ?? null,
        variantCount: variants.length,
        variants: variants.map(summarizeVariant),
        hasDirect,
      };
      console.log(`[resolve] variants=${variants.length} hasDirect=${hasDirect} playable=${video?.playableInApp} reason=${report.resolve.unavailableReason || 'none'}`);
      for (const [index, variant] of report.resolve.variants.slice(0, 6).entries()) {
        console.log(`[variant ${index + 1}] ${variant.id} ${variant.protocol} ${variant.label} playable=${variant.playableInApp} h=${variant.height}`);
      }
      if (!hasDirect && blocked) report.notes.push('Bilibili playurl blocked (412); external-only variants returned');
      else if (!hasDirect) report.notes.push('Resolve produced no in-app direct variant');
    }

    const wbiOk = report.wbi?.syntheticOk === true;
    const searchOk = report.candidates.length > 0;
    const resolveOk = Boolean(report.resolve?.hasDirect) || report.blocked;
    report.ok = wbiOk && ((searchOk && resolveOk) || report.blocked);
  } catch (error) {
    report.ok = false;
    report.notes.push(error instanceof Error ? error.stack || error.message : String(error));
    console.error('[error]', error instanceof Error ? error.message : String(error));
  } finally {
    try { engine.dispose(); } catch {}
    const reportPath = join(dataDir, 'report.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(`[report] ${reportPath}`);
  }

  if (!report.ok) process.exitCode = 1;
};

main();
