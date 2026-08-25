'use strict';

const { createHash, randomUUID } = require('node:crypto');
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  createReadStream,
} = require('node:fs');
const { stat } = require('node:fs/promises');
const { basename, dirname, extname, join, resolve, normalize } = require('node:path');
const { Readable } = require('node:stream');

const MOD_VERSION = '1.0.10';
const MV_MATCH_ALGORITHM_VERSION = 5;
const MV_AUTO_MATCH_THRESHOLD = 0.7;
const MV_AUTO_MATCH_MIN_MARGIN = 0.08;
const MV_AUTO_MATCH_HIGH_CONFIDENCE = 0.86;
const MV_OFFSET_MIN_MS = -600000;
const MV_OFFSET_MAX_MS = 600000;
const EPHEMERAL_TTL_MS = 15 * 60 * 1000;
const DEFAULT_EXPIRES_MS = 45 * 60 * 1000;
const BILI_PLAYURL_BAN_MS = 2 * 60 * 1000;
const BILI_WBI_KEY_CACHE_MS = 30 * 60 * 1000;
const BILI_WBI_KEY_FAIL_MS = 30 * 1000;
const BILI_METADATA_TIMEOUT_MS = 2500;
const DEFAULT_NETWORK_TIMEOUT_MS = 6500;
const STORE_DEBOUNCE_MS = 500;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BILI_ACCEPT_LANGUAGE = 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7';
const NETWORK_PROVIDERS = ['bilibili', 'youtube'];
const VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm', '.mkv', '.mov', '.avi']);
const BROWSER_VIDEO_EXTS = new Set(['.mp4', '.m4v', '.webm']);
const LOCAL_VIDEO_FOLDERS = ['MV', 'mv', 'video', 'videos'];
const LOCAL_MIN_SCORE = 0.2;
const STREAMING_TRACK_ID = /^streaming:([^:]+):(.+)$/;
const IN_APP_UNAVAILABLE = '此 MV 暂时无法在应用内播放，可外部打开。';

const BILI_MIXIN_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16,
  24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
];

const QUALITY_HEIGHT = { '720p': 720, '1080p': 1080, '1440p': 1440, '2160p': 2160, '4320p': 4320 };
const BILI_QUALITY_MAP = {
  16: { tier: '720p', label: '360p' },
  32: { tier: '720p', label: '480p' },
  64: { tier: '720p', label: '720p' },
  80: { tier: '1080p', label: '1080p' },
  112: { tier: '1080p', label: '1080p+' },
  116: { tier: '1080p', label: '1080p 60fps' },
  120: { tier: '2160p', label: '4K' },
  125: { tier: '2160p', label: 'HDR' },
  126: { tier: '2160p', label: 'Dolby Vision' },
  127: { tier: '4320p', label: '8K' },
};
const BILI_QUALITY_ORDER = [127, 126, 125, 120, 116, 112, 80, 64];
const BILI_QUALITY_HEIGHT = { 16: 360, 32: 480, 64: 720, 80: 1080, 112: 1080, 116: 1080, 120: 2160, 125: 2160, 126: 2160, 127: 4320 };
const BILI_DASH_FNVAL = '4048';

const DEFAULT_MV_SETTINGS = {
  enabled: true,
  autoSearch: true,
  autoPreload: true,
  autoApplyThreshold: 0.7,
  titleOnlySearch: false,
  preferHighestViewCount: true,
  immersiveBackground: true,
  immersiveBackgroundAutoScale: true,
  immersiveBackgroundScalePercent: 115,
  immersiveBackgroundOffsetXPercent: 50,
  immersiveBackgroundOffsetYPercent: 50,
  immersiveBackgroundBlurPx: 0,
  immersiveBackgroundBrightnessPercent: 100,
  immersiveBackgroundOverlayOpacityPercent: 0,
  lyricsReadabilityEnhanced: false,
  hideLyrics: false,
  restartAudioOnLoad: false,
  syncMode: 'balanced',
  replayAudioOnChange: true,
  enabledProviders: ['bilibili', 'youtube'],
  providerOrder: ['bilibili', 'youtube'],
  maxQuality: 'max',
  allow60fps: true,
};

const SOURCE_WORDS = [
  'official music video', 'official video', 'official mv', 'music video', 'official', 'video',
  '1080p', '720p', '4k', 'mv', 'pv', 'hd', 'hq', 'lyrics', 'lyric', 'audio', 'feat', 'ft', 'featuring',
];
const SOURCE_WORD_PATTERN = [...SOURCE_WORDS]
  .sort((a, b) => b.length - a.length)
  .map((word) => word.replace(/\s+/g, '\\s+'))
  .join('|');

const TS_PAIRS =
  '萬万與与醜丑專专业業叢丛東东絲丝丟丢兩两嚴严喪丧個个豐丰臨临為为麗丽舉举麼么義义烏乌樂乐喬乔習习鄉乡書书買买亂乱爭争於于虧亏雲云亙亘亞亚產产畝亩親亲億亿僅仅從从侖仑倉仓儀仪們们價价眾众優优會会傘伞偉伟傳传傷伤倫伦偽伪佇伫體体餘余俠侠侶侣偵侦側侧僑侨儂侬倆俩儉俭債债傾倾償偿儲储兒儿兌兑黨党蘭兰關关興兴養养內内岡冈冊册寫写軍军農农衝冲決决況况凍冻淨净淒凄涼凉減减湊凑幾几鳳凤憑凭凱凯擊击劃划劉刘則则剛刚創创刪删別别製制剎刹劑剂劍剑剝剥劇剧勸劝辦办務务動动勁劲勞劳勢势勻匀區区醫医華华協协單单賣卖盧卢衛卫卻却廳厅歷历厲厉壓压厭厌縣县雙双發发變变敘叙疊叠葉叶號号嘆叹後后嚇吓呂吕嗎吗噸吨聽听啟启吳吴嘔呕員员嗆呛嗚呜詠咏嚨咙嚀咛響响啞哑嘩哗喲哟喚唤嘖啧嗇啬嘯啸噴喷囑嘱團团園园圍围國国圖图圓圆聖圣場场壞坏塊块堅坚壇坛壩坝塢坞墳坟墜坠壟垄壘垒墾垦墊垫塹堑墮堕牆墙壯壮聲声殼壳壺壶處处備备複复夠够頭头誇夸夾夹奪夺奮奋獎奖奧奥妝妆婦妇媽妈婁娄嬌娇娛娱嬰婴嬋婵嬸婶孫孙學学寧宁寶宝實实寵宠審审憲宪宮宫寬宽賓宾對对尋寻導导壽寿將将爾尔塵尘尷尴屍尸盡尽層层嶼屿歲岁豈岂嶇岖崗岗島岛嶺岭嶽岳峽峡崢峥巒峦幣币帥帅師师帳帐簾帘幟帜帶带幀帧幫帮幹干並并廣广莊庄慶庆庫库應应廟庙龐庞廢废開开異异棄弃張张彌弥彎弯彈弹強强歸归當当錄录徹彻徑径徠徕禦御憶忆懷怀態态憐怜總总戀恋恆恒懇恳惡恶惱恼悅悦懸悬憫悯驚惊懼惧慘惨懲惩憊惫慚惭慣惯憤愤願愿懶懒戲戏戰战戶户撲扑執执擴扩掃扫揚扬擾扰撫抚拋抛搶抢護护報报擔担擬拟攏拢揀拣擁拥攔拦擰拧撥拨擇择掛挂摯挚撻挞挾挟撓挠擋挡掙挣擠挤揮挥撈捞損损撿捡換换搗捣擲掷攬揽擱搁摟搂攪搅攜携攝摄擺摆搖摇擯摈攤摊撐撑攆撵敵敌斂敛數数鬥斗斬斩斷断無无舊旧時时曠旷顯显晉晋曬晒曉晓暈晕暉晖暫暂術术機机殺杀雜杂權权桿杆條条來来楊杨傑杰極极構构樞枢棗枣槍枪楓枫櫃柜檸柠柵栅標标棧栈棟栋欄栏樹树棲栖樣样橋桥樺桦槳桨樁桩夢梦檢检樓楼橢椭歡欢歐欧殲歼殘残毆殴毀毁畢毕斃毙氣气匯汇漢汉汙污湯汤溝沟沒没瀝沥淪沦滄沧滬沪淚泪瀧泷瀘泸瀉泻潑泼澤泽涇泾潔洁灑洒淺浅漿浆澆浇濁浊測测濟济瀏浏渾浑滸浒濃浓塗涂湧涌濤涛澇涝漣涟渦涡渙涣滌涤潤润澗涧漲涨澀涩澱淀淵渊漬渍漸渐漁渔瀋沈滲渗溫温遊游灣湾濕湿潰溃濺溅滾滚滯滞滿满濾滤濫滥濱滨灘滩潛潜瀾澜瀕濒滅灭燈灯靈灵災灾燦灿爐炉點点煉炼熾炽爍烁爛烂燭烛煙烟煩烦燒烧燴烩燙烫燼烬熱热煥焕愛爱爺爷牽牵犧牺狀状猶犹狽狈獰狞獨独狹狭獅狮獄狱獵猎獻献環环現现琺珐瓏珑瑣琐瓊琼電电畫画暢畅療疗瘧疟瘡疮瘋疯痙痉癢痒癱瘫癮瘾癩癞鹽盐監监蓋盖盜盗盤盘著着睜睁矯矫礦矿碼码磚砖硯砚礪砺礫砾礎础碩硕確确礙碍鹼碱禮礼禱祷禍祸離离種种積积稱称穢秽稅税穩稳窮穷竊窃竅窍竄窜窩窝窺窥豎竖競竞筆笔箋笺籠笼築筑篩筛箏筝籌筹簽签簡简簫箫籃篮籬篱類类粵粤糞粪糧粮緊紧紅红紂纣纖纤約约級级紀纪緯纬純纯紗纱綱纲納纳縱纵綸纶紛纷紙纸紋纹紡纺紐纽線线練练組组紳绅細细織织終终絆绊紹绍繹绎經经絨绒結结繞绕繪绘給给絢绚絡络絕绝絞绞統统絹绢繡绣綏绥繼继績绩緒绪續续綺绮緋绯綽绰繩绳維维綿绵繃绷綢绸綜综綻绽綠绿綴缀緇缁緘缄緬缅纜缆緝缉緞缎緩缓締缔縷缕編编緣缘縉缙縛缚縫缝纏缠繽缤縮缩繳缴網网羅罗罰罚罷罢羨羡翹翘聳耸恥耻聶聂聾聋職职聯联聰聪肅肃腸肠膚肤腎肾腫肿脹胀脅胁膽胆膠胶脈脉臍脐腦脑膿脓腳脚脫脱臉脸臘腊騰腾輿舆艦舰艙舱艱艰豔艳藝艺節节蕪芜蘆芦葦苇蒼苍蘇苏蘋苹莖茎薦荐莢荚蕎荞薈荟薺荠蕩荡榮荣葷荤螢萤營营蕭萧薩萨蔥葱蔣蒋藍蓝薔蔷藹蔼蘊蕴蘚藓麥麦詞词輯辑頻频視视鏡镜裡里際际該该讓让進进還还題题頁页據据風风龍龙隻只';

const toSimplified = (() => {
  const map = new Map();
  for (let i = 0; i + 1 < TS_PAIRS.length; i += 2) map.set(TS_PAIRS[i], TS_PAIRS[i + 1]);
  return (text) => [...String(text ?? '')].map((ch) => map.get(ch) || ch).join('');
})();

const nowIso = () => new Date().toISOString();
const isObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);
const text = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};
const nullableNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const clampOffsetMs = (value) => Math.max(MV_OFFSET_MIN_MS, Math.min(MV_OFFSET_MAX_MS, Math.round(Number(value) || 0)));
const normalizePercent = (value, fallback, min, max) => {
  const percent = Number(value);
  return Number.isFinite(percent) ? Math.round(clamp(percent, min, max)) : fallback;
};
const normalizeAutoApplyThreshold = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, 0.3, 1) : MV_AUTO_MATCH_THRESHOLD;
const maxQualityHeight = (quality) => (quality === 'max' ? Number.POSITIVE_INFINITY : QUALITY_HEIGHT[quality] || 720);
const bilibiliQualityRank = (qn) => {
  const index = BILI_QUALITY_ORDER.indexOf(qn);
  return index >= 0 ? BILI_QUALITY_ORDER.length - index : 0;
};
const maxBilibiliQnForSettings = (settings) => {
  if (settings.maxQuality === 'max') return 127;
  if (settings.maxQuality === '2160p') return 120;
  if (settings.maxQuality === '1440p') return 112;
  if (settings.maxQuality === '1080p') return settings.allow60fps === false ? 112 : 116;
  return 64;
};

const safeExt = (filePath) => {
  const fileName = String(filePath || '').trim().split(/[\\/]/).pop() || '';
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot).toLocaleLowerCase();
};
const isSupportedVideoExtension = (filePath) => VIDEO_EXTS.has(safeExt(filePath));
const isBrowserPlayableVideo = (filePath) => BROWSER_VIDEO_EXTS.has(safeExt(filePath));
const mimeTypeForVideoPath = (filePath) => {
  switch (safeExt(filePath)) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.mov':
      return 'video/quicktime';
    case '.avi':
      return 'video/x-msvideo';
    default:
      return null;
  }
};

const fileHashId = (filePath) => `local:${createHash('sha1').update(resolve(filePath)).digest('hex')}`;
const candidateTitle = (filePath) => basename(filePath, extname(filePath));
const pathKey = (filePath) => (process.platform === 'win32' ? resolve(filePath).toLocaleLowerCase() : resolve(filePath));

const requireText = (value, name) => {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value.trim();
};
const optionalText = (value) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const requireOffset = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error('offsetMs must be a number');
  return parsed;
};
const payloadObj = (value) => (isObject(value) ? value : {});

const normalizeSnapshot = (value) => {
  if (!isObject(value)) throw new Error('MV snapshot search request must be an object');
  const durationSeconds = Number(value.durationSeconds);
  return {
    trackId: requireText(value.trackId, 'trackId'),
    title: requireText(value.title, 'title'),
    artist: optionalText(value.artist) ?? 'Unknown Artist',
    album: optionalText(value.album),
    albumArtist: optionalText(value.albumArtist),
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    coverThumb: optionalText(value.coverThumb),
    mediaType: value.mediaType === 'remote' || value.mediaType === 'streaming' || value.mediaType === 'local' ? value.mediaType : 'streaming',
    query: optionalText(value.query),
    autoSelect: value.autoSelect === true,
    path: optionalText(value.path),
  };
};

const snapshotToTrack = (snapshot) => ({
  id: snapshot.trackId,
  mediaType: snapshot.mediaType || 'streaming',
  path: snapshot.path || snapshot.trackId,
  title: snapshot.title,
  artist: snapshot.artist,
  album: snapshot.album || 'Unknown Album',
  albumArtist: snapshot.albumArtist || snapshot.artist,
  duration: snapshot.durationSeconds || 0,
  coverThumb: snapshot.coverThumb || null,
});

const providerName = (value) =>
  value === 'local' || value === 'bilibili' || value === 'youtube' || value === 'netease' || value === 'qqmusic' ? value : 'local';
const sourceTypeName = (value) =>
  value === 'sidecar' || value === 'manual' || value === 'search_candidate' || value === 'stream' ? value : 'sidecar';
const selectionOriginName = (value) => (value === 'auto' || value === 'manual' ? value : 'unknown');
const qualityTierName = (value) =>
  value === 'auto' || value === '720p' || value === '1080p' || value === '1440p' || value === '2160p' || value === '4320p' ? value : 'auto';
const sourceIdForCandidate = (candidate) =>
  candidate.id.startsWith(`${candidate.provider}:`) ? candidate.id.slice(candidate.provider.length + 1) : candidate.id;

const recordFromUnknown = (value) => (isObject(value) ? value : null);
const isBrowserPlayableBilibiliCodec = (codec) => {
  if (!codec) return true;
  const codecs = String(codec).toLowerCase().split(',').map((entry) => entry.trim()).filter(Boolean);
  return !codecs.some((entry) => entry.startsWith('hev1') || entry.startsWith('hvc1') || entry.startsWith('dvhe') || entry.startsWith('dvh1'));
};
// `provider` lives on the stream row, not inside rawProviderJson, so accept it
// from either place — otherwise trusted muted streams are misjudged as stale.
const isTrustedBilibiliMutedVideoOnly = (raw, rowProvider) =>
  Boolean(raw && (raw.provider === 'bilibili' || rowProvider === 'bilibili') && raw.source === 'dash-video' && raw.resolver === 'bilibili-dash-video-v4' && raw.mutedVideoOnly === true);

const decodeHtmlEntities = (value) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&#(\d+);/g, (_m, decimal) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');

const stripHtml = (value) => {
  const raw = text(value);
  if (!raw) return null;
  return decodeHtmlEntities(raw.replace(/<[^>]*>/g, '')).trim() || null;
};

const normalizeUrl = (value) => {
  const raw = text(value);
  if (!raw) return null;
  return raw.startsWith('//') ? `https:${raw}` : raw;
};

const firstUrl = (...values) => {
  for (const value of values) {
    const direct = normalizeUrl(value);
    if (direct) return direct;
    const backup = asArray(value).map(normalizeUrl).find(Boolean);
    if (backup) return backup;
  }
  return null;
};

const metricNumber = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = text(value);
  if (!raw) return null;
  const normalized = raw.replace(/,/g, '').replace(/\s+/g, '');
  const match = normalized.match(/^([\d.]+)(万|億|亿|k|K|m|M)?$/);
  if (!match) {
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = match[2];
  const multiplier = unit === '万' ? 10_000 : unit === '亿' || unit === '億' ? 100_000_000 : unit === 'k' || unit === 'K' ? 1_000 : unit === 'm' || unit === 'M' ? 1_000_000 : 1;
  return Math.round(amount * multiplier);
};

const wbiKeyPart = (value) => {
  const raw = text(value);
  if (!raw) return null;
  return raw.split('/').pop()?.split('.')[0] ?? null;
};
const mixinWbiKey = (rawKey) => BILI_MIXIN_TABLE.map((index) => rawKey[index]).join('').slice(0, 32);
const sanitizeWbiValue = (value) => String(value).replace(/[!'()*]/g, '');
const appendWbiSignature = (url, mixinKey) => {
  url.searchParams.set('wts', String(Math.round(Date.now() / 1000)));
  const query = Array.from(url.searchParams.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(sanitizeWbiValue(value))}`)
    .join('&');
  url.searchParams.set('w_rid', createHash('md5').update(`${query}${mixinKey}`).digest('hex'));
};

const normalizeMvSemanticText = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(?:amp|quot|apos|lt|gt);/g, ' ')
    .replace(/[[\]【】「」『』〈〉《》〔〕〖〗()（）"'“”‘’]/g, ' ')
    .replace(/[&*+._\-–—~|/\\:：·・,，。!?！？]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const buildMvWritingSystemAliases = (value, normalizer = normalizeMvSemanticText) => {
  const source = String(value ?? '').normalize('NFKC');
  return [...new Set([source, toSimplified(source)].map((alias) => normalizer(alias)).filter(Boolean))];
};

const normalizeMvText = (value) =>
  normalizeMvSemanticText(String(value ?? '').replace(/\.[a-z0-9]+$/i, ''))
    .replace(new RegExp(`(?:^|\\s)(${SOURCE_WORD_PATTERN})(?=\\s|$)`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .trim();

const comparableTokens = (value) => normalizeMvText(value).match(/[\p{L}\p{N}]+/gu)?.filter((token) => token.length > 1) ?? [];
const phraseIncluded = (haystack, needle) => Boolean(haystack && needle && ` ${haystack} `.includes(` ${needle} `));
const tokenCoverage = (haystack, needle) => {
  const expected = comparableTokens(needle);
  if (expected.length === 0) return 0;
  const actual = new Set(comparableTokens(haystack));
  return expected.filter((token) => actual.has(token)).length / expected.length;
};
const stripSourceWords = (value) => {
  let result = ` ${value} `;
  for (const word of SOURCE_WORDS) result = result.replace(new RegExp(`\\s${word.replace(/\s+/g, '\\s+')}\\s`, 'gi'), ' ');
  return result.replace(/\s+/g, ' ').trim();
};
const containsAllWords = (haystack, needle) => {
  const words = needle.split(' ').filter((word) => word.length > 1);
  return words.length > 0 && words.every((word) => haystack.includes(word));
};
const compactArtistText = (value) => value.replace(/\s+/g, '');
const artistAliases = (track, includeWritingSystemAliases = true) => {
  const values = [track.artist, track.albumArtist].filter((value) => Boolean(value?.trim()));
  const aliases = values
    .flatMap((value) => [value, ...value.split(/[/&,，;；|]+|\b(?:feat(?:uring)?|ft)\.?\b/giu)])
    .flatMap((value) => (includeWritingSystemAliases ? buildMvWritingSystemAliases(value) : [normalizeMvSemanticText(value)]))
    .filter((value) => value.length > 1)
    .filter((value) => !/^(unknown artist|various artists?|未知歌手|\d{1,2}時)$/iu.test(value));
  return [...new Set(aliases)];
};
const compareWritingSystemAliases = (haystackValue, needleValue) => {
  const haystacks = buildMvWritingSystemAliases(haystackValue, normalizeMvText);
  const needles = buildMvWritingSystemAliases(needleValue, normalizeMvText);
  let best = { exact: false, phrase: false, coverage: 0, usedAlias: false };
  for (const haystack of haystacks) {
    for (const needle of needles) {
      const exact = Boolean(needle && haystack === needle);
      const phrase = !exact && phraseIncluded(haystack, needle);
      const coverage = tokenCoverage(haystack, needle);
      const stronger = exact || (!best.exact && phrase && !best.phrase) || (!best.exact && !best.phrase && coverage > best.coverage);
      if (stronger) {
        best = { exact, phrase, coverage, usedAlias: haystack !== haystacks[0] || needle !== needles[0] };
      }
      if (exact) return best;
    }
  }
  return best;
};
const findArtistEvidence = (track, candidateTitleText, uploader, includeWritingSystemAliases = true) => {
  const titles = includeWritingSystemAliases ? buildMvWritingSystemAliases(candidateTitleText) : [normalizeMvSemanticText(candidateTitleText)];
  const channels = includeWritingSystemAliases ? buildMvWritingSystemAliases(uploader) : [normalizeMvSemanticText(uploader)];
  const aliases = artistAliases(track, includeWritingSystemAliases);
  for (const alias of aliases) {
    const compactAlias = compactArtistText(alias);
    if (channels.some((channel) => phraseIncluded(channel, alias) || (compactAlias.length >= 4 && compactArtistText(channel).includes(compactAlias)))) {
      return 'uploader';
    }
  }
  for (const alias of aliases) {
    if (titles.some((titleText) => phraseIncluded(titleText, alias))) return 'title';
  }
  return null;
};

const parseIsoDuration = (value) => {
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/iu.exec(value.trim());
  if (!match) return null;
  const seconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};
const parseMvDurationSeconds = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const isoDuration = parseIsoDuration(trimmed);
  if (isoDuration !== null) return isoDuration;
  if (/^\d+(?:\.\d+)?$/u.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }
  const parts = trimmed.split(':').map((part) => Number(part));
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !Number.isFinite(part) || part < 0)) return null;
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return seconds > 0 ? seconds : null;
};

const officialVideoPattern = /\b(?:official\s+(?:music\s+)?video|official\s+mv|music\s+video|mv|pv|bga)\b|官方(?:音乐|音樂)?(?:视频|影片)|原创曲|原創曲|オリジナル(?:曲|ソング)/iu;
const nonMvContentPattern = /\b(?:vlog|reaction|tutorial|gameplay|walkthrough|guide|mmd|amv|mad|mashup|pjd|project\s*diva|mega39\s*s|megamix|project\s*sekai|pjsk|colorful\s*stage|lanota|arcaea|d4dj|bang\s*dream|bandori|cubase|fl\s*studio|ableton|roblox|vinyl|wallpaper|wota|sheet\s*music|drum\s*cover|piano\s*cover|instrument\s*cover|on\s*vocal|off\s*vocal|tab|2dmv)\b|教程|网课|網課|手元|譜面|谱面|简谱|簡譜|音游|音遊|音乐\s*id|音樂\s*id|プロセカ|プロジェクトセカイ|世界计划|世界計畫|多彩舞台|整活|模组|模組|解说|解說|挑战|挑戰|动态鼓谱|動態鼓譜|鼓谱|鼓譜|总谱|總譜|吉他谱|吉他譜|贝斯谱|貝斯譜|贝斯版|貝斯版|钢琴谱|鋼琴譜|琴谱|琴譜|特效谱|特效譜|自制谱|自製譜|自制\s*op|自製\s*op|混剪|混剪版|串烧|串燒|三厨狂喜|多厨狂喜|壁纸|壁紙|黑胶|黑膠|试听|試聽|大声听|大聲聽|翻调|翻調|演奏|弹奏|彈奏|口琴|钢琴编曲|鋼琴編曲|原创振付|原創振付|踊ってみた|编舞|編舞|舞台背景|自用背景|爬台|宅舞|动画纯享|動畫純享|ニコカラ|光遇|冰与火之舞|冰與火之舞|osu!?|maimai/iu;
const unofficialVisualPattern = /\b(?:fan[ -]?made|fanmade)\b|原创\s*(?:mv|pv)|原創\s*(?:mv|pv)|自制\s*(?:mv|pv)|自製\s*(?:mv|pv)|オリジナル\s*(?:mv|pv)/iu;
const aiVoiceReplacementPattern = /\b(?:ai\s*(?:cover|voice|singer)|feat(?:uring)?\.?\s*ai|rvc|so-vits)\b|【ai[^】]{0,24}】|ai切|ai翻唱|ai歌唱|ai歌聲|ai声线|ai聲線|音色克隆/iu;
const unrelatedGameEditPattern = /\b(?:genshin|honkai|phigros)\b|原神|崩坏|崩壞|舞萌|音击|音擊/iu;
const variantLabels = [
  { label: 'cover', pattern: /\bcovers?\b|\bcovered\s+by\b|翻唱|歌ってみた|カバー/iu },
  { label: 'live', pattern: /\blive\b|演唱会|演唱會|现场版|現場版|现场演唱|現場演唱|ライブ/iu },
  { label: 'remix', pattern: /\bremix\b|リミックス/iu },
  { label: 'karaoke', pattern: /\bkaraoke\b|卡拉ok|カラオケ/iu },
  { label: 'instrumental', pattern: /\binstrumental\b|伴奏/iu },
  { label: 'lyrics', pattern: /\blyrics?\b|歌词|歌詞/iu },
  { label: 'audio', pattern: /\b(?:official\s+)?audio\b|纯音乐|純音樂/iu },
  { label: 'speed edit', pattern: /\b(?:nightcore|sped\s+up|slowed(?:\s+down)?)\b/iu },
  { label: 're-recorded version', pattern: /\b(?:reformare|re-recorded|rerecorded|re-recording)\b|重录版|重錄版|重新录制|重新錄製/iu },
  { label: 'extended version', pattern: /\bextended(?:\s+(?:mix|version))?\b|加长(?:版)?|加長(?:版)?/iu },
  { label: 'alternate version', pattern: /\b(?:another\s+story|adam\s+by\s+eve|alternate\s+version|broadcast\s+version)\b|播出版|別\s*ver\.?/iu },
];

const scoreNetworkMvCandidate = (track, candidate) => {
  const trackTitle = normalizeMvText(track.title);
  const rawTrackTitle = normalizeMvSemanticText(track.title);
  const rawCandidateTitle = normalizeMvSemanticText(candidate.title);
  const reasons = [];
  let score = 0;
  const titleComparison = compareWritingSystemAliases(candidate.title, track.title);
  const { coverage, exact: titleExact, phrase: titlePhrase, usedAlias: writingSystemAlias } = titleComparison;
  if (titleExact) {
    score += 0.58;
    reasons.push('title exact');
  } else if (titlePhrase) {
    score += 0.5;
    reasons.push('title phrase');
  } else if (coverage >= 0.999) {
    score += 0.42;
    reasons.push('title tokens exact');
  } else if (coverage >= 0.75) {
    score += 0.32;
    reasons.push(`title tokens ${Math.round(coverage * 100)}%`);
  } else if (coverage >= 0.5) {
    score += 0.18;
    reasons.push(`title tokens ${Math.round(coverage * 100)}%`);
  } else {
    reasons.push('title mismatch');
  }
  const artistEvidence = findArtistEvidence(track, candidate.title, candidate.uploader);
  const artistWritingSystemAlias = Boolean(artistEvidence && !findArtistEvidence(track, candidate.title, candidate.uploader, false));
  if (artistEvidence) {
    score += artistEvidence === 'uploader' ? 0.3 : 0.26;
    reasons.push(artistEvidence === 'title' ? 'artist in title' : 'uploader matches artist');
  }
  if ((writingSystemAlias && (titleExact || titlePhrase || coverage >= 0.75)) || artistWritingSystemAlias) {
    reasons.push('writing-system alias');
  }
  const trackDuration = Number(track.duration);
  const candidateDuration = Number(candidate.durationSeconds);
  let durationCorroborated = false;
  let durationConflict = false;
  let durationEvidence = 'unknown';
  if (Number.isFinite(trackDuration) && trackDuration > 0 && Number.isFinite(candidateDuration) && candidateDuration > 0) {
    const relativeDifference = Math.abs(candidateDuration - trackDuration) / Math.max(trackDuration, 1);
    if (relativeDifference <= 0.05) {
      score += 0.18;
      durationCorroborated = true;
      durationEvidence = 'strong';
      reasons.push('duration within 5%');
    } else if (relativeDifference <= 0.12) {
      score += 0.13;
      durationCorroborated = true;
      durationEvidence = 'close';
      reasons.push('duration within 12%');
    } else if (relativeDifference <= 0.2) {
      durationEvidence = 'weak';
      score += 0.07;
      reasons.push('duration within 20%');
    } else if (relativeDifference > 0.35) {
      score -= 0.22;
      durationConflict = true;
      durationEvidence = 'conflict';
      reasons.push('duration conflict');
    }
  }
  const hasOfficialVideoSignal = officialVideoPattern.test(rawCandidateTitle);
  if (hasOfficialVideoSignal) {
    score += 0.05;
    reasons.push('MV signal');
  }
  let contentConflict = false;
  if (nonMvContentPattern.test(rawCandidateTitle) && !nonMvContentPattern.test(rawTrackTitle)) {
    score -= 0.3;
    contentConflict = true;
    reasons.push('non-MV content');
  }
  if (unofficialVisualPattern.test(rawCandidateTitle) && artistEvidence !== 'uploader') {
    score -= 0.24;
    contentConflict = true;
    reasons.push('unverified derivative video');
  }
  if (aiVoiceReplacementPattern.test(rawCandidateTitle) && !artistAliases(track).includes('ai')) {
    score -= 0.3;
    contentConflict = true;
    reasons.push('AI voice replacement');
  }
  if (unrelatedGameEditPattern.test(rawCandidateTitle) && artistEvidence !== 'uploader') {
    score -= 0.24;
    contentConflict = true;
    reasons.push('unrelated game edit');
  }
  for (const variant of variantLabels) {
    if (variant.pattern.test(rawCandidateTitle) && !variant.pattern.test(rawTrackTitle)) {
      score -= 0.18;
      contentConflict = true;
      reasons.push(`variant conflict: ${variant.label}`);
    }
  }
  const strongTitleMatch = titleExact || titlePhrase || coverage >= 0.999;
  const substantialTitleMatch = strongTitleMatch || coverage >= 0.75;
  const corroborated = Boolean(artistEvidence || durationCorroborated);
  const doublyCorroborated = Boolean(artistEvidence && durationCorroborated);
  const titleTokens = comparableTokens(trackTitle);
  const shortOrAmbiguousTitle = trackTitle.length <= 3 || titleTokens.length === 0 || (titleTokens.length === 1 && titleTokens[0].length <= 5);
  const shortTitleCorroborated = !shortOrAmbiguousTitle || Boolean(artistEvidence) || (durationCorroborated && hasOfficialVideoSignal);
  const titleEvidenceEligible = strongTitleMatch ? corroborated : substantialTitleMatch && doublyCorroborated;
  const autoEligible = titleEvidenceEligible && shortTitleCorroborated && !durationConflict && !contentConflict;
  if (!corroborated) {
    score = Math.min(score, 0.69);
    reasons.push('auto blocked: no artist or duration evidence');
  }
  if (!autoEligible && (durationConflict || contentConflict || !substantialTitleMatch || !shortTitleCorroborated)) {
    score = Math.min(score, 0.49);
  }
  const normalizedScore = Math.max(0, Math.min(1, Number(score.toFixed(4))));
  const conflicts = reasons.filter((reason) =>
    reason === 'duration conflict' ||
    reason === 'non-MV content' ||
    reason === 'unverified derivative video' ||
    reason === 'AI voice replacement' ||
    reason === 'unrelated game edit' ||
    reason.startsWith('variant conflict:'),
  );
  const evidence = {
    title: titleExact ? 'exact' : titlePhrase ? 'phrase' : coverage >= 0.5 ? 'tokens' : 'mismatch',
    titleCoverage: Number(coverage.toFixed(4)),
    artist: artistEvidence ?? 'none',
    duration: durationEvidence,
    writingSystemAlias: writingSystemAlias || artistWritingSystemAlias,
    officialVideoSignal: hasOfficialVideoSignal,
    conflicts,
  };
  const decision = {
    score: normalizedScore,
    autoAccept: autoEligible,
    candidateOnly: !autoEligible,
    risk: autoEligible ? 'low' : conflicts.length > 0 ? 'high' : 'medium',
    reasons,
    algorithmVersion: MV_MATCH_ALGORITHM_VERSION,
    evidence,
  };
  return { score: normalizedScore, reasons, autoEligible, matchVersion: MV_MATCH_ALGORITHM_VERSION, decision };
};

const scoreLocalMvCandidate = (track, filePath) => {
  const audioBase = normalizeMvText(basename(track.path, extname(track.path)));
  const videoBase = normalizeMvText(basename(filePath, extname(filePath)));
  const comparableVideoBase = stripSourceWords(videoBase);
  const titleText = normalizeMvText(track.title);
  const artist = normalizeMvText(track.artist || track.albumArtist);
  const artistTitle = normalizeMvText(`${track.artist || track.albumArtist} - ${track.title}`);
  const titleArtist = normalizeMvText(`${track.title} - ${track.artist || track.albumArtist}`);
  const reasons = [];
  let score = 0;
  if (videoBase === audioBase || comparableVideoBase === audioBase) {
    score += 0.55;
    reasons.push('same basename');
  } else if (comparableVideoBase === titleText || videoBase === titleText) {
    score += 0.35;
    reasons.push('title exact');
  } else if (comparableVideoBase === artistTitle || comparableVideoBase === titleArtist) {
    score += 0.5;
    reasons.push('artist/title exact');
  } else if (titleText && containsAllWords(comparableVideoBase, titleText)) {
    score += 0.24;
    reasons.push('title words');
  }
  if (artist && comparableVideoBase.includes(artist)) {
    score += 0.15;
    reasons.push('artist included');
  }
  const parentFolder = normalize(dirname(filePath)).split(/[\\/]/).pop()?.toLocaleLowerCase() ?? '';
  if (['mv', 'video', 'videos'].includes(parentFolder)) {
    score += 0.1;
    reasons.push('mv folder');
  }
  if (isBrowserPlayableVideo(filePath)) {
    score += 0.05;
    reasons.push('browser playable');
  }
  return { score: Math.min(1, Number(score.toFixed(4))), reasons };
};

const safeReadVideoFiles = (folderPath) => {
  if (!existsSync(folderPath)) return [];
  try {
    if (!statSync(folderPath).isDirectory()) return [];
    return readdirSync(folderPath)
      .map((entry) => join(folderPath, entry))
      .filter((entryPath) => {
        try {
          return statSync(entryPath).isFile() && isSupportedVideoExtension(entryPath);
        } catch {
          return false;
        }
      });
  } catch {
    return [];
  }
};

const candidateFolders = (audioPath) => {
  const songFolder = dirname(audioPath);
  const parentFolder = dirname(songFolder);
  return [...new Set([
    songFolder,
    ...LOCAL_VIDEO_FOLDERS.map((folder) => join(songFolder, folder)),
    join(parentFolder, 'MV'),
    join(parentFolder, 'video'),
  ])];
};

const searchLocalCandidates = (track) => {
  const seen = new Set();
  const candidates = [];
  for (const folder of candidateFolders(track.path)) {
    for (const filePath of safeReadVideoFiles(folder)) {
      const seenKey = pathKey(filePath);
      if (seen.has(seenKey)) continue;
      seen.add(seenKey);
      const scoring = scoreLocalMvCandidate(track, filePath);
      if (scoring.score < LOCAL_MIN_SCORE) continue;
      candidates.push({
        id: randomUUID(),
        provider: 'local',
        sourceType: 'sidecar',
        title: candidateTitle(filePath),
        artist: track.artist || track.albumArtist || null,
        filePath,
        url: null,
        providerUrl: null,
        thumbnailUrl: null,
        uploader: null,
        uploaderId: null,
        viewCount: null,
        availableQualities: [],
        durationSeconds: null,
        score: scoring.score,
        playableInApp: isBrowserPlayableVideo(filePath),
        reasons: scoring.reasons,
      });
    }
  }
  return candidates.sort((left, right) => right.score - left.score);
};

const normalizeProviderList = (value, fallback) => {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.filter((provider) => NETWORK_PROVIDERS.includes(provider)))];
};

const mergeSettings = (stored) => {
  const src = isObject(stored) ? stored : {};
  const enabledProviders = normalizeProviderList(src.enabledProviders, DEFAULT_MV_SETTINGS.enabledProviders);
  const providerOrder = [
    ...normalizeProviderList(src.providerOrder, DEFAULT_MV_SETTINGS.providerOrder),
    ...NETWORK_PROVIDERS.filter((provider) => !normalizeProviderList(src.providerOrder, DEFAULT_MV_SETTINGS.providerOrder).includes(provider)),
  ];
  const maxQuality = src.maxQuality === '720p' || src.maxQuality === '1080p' || src.maxQuality === '1440p' || src.maxQuality === '2160p' || src.maxQuality === 'max'
    ? src.maxQuality
    : DEFAULT_MV_SETTINGS.maxQuality;
  const syncMode = src.syncMode === 'stable' || src.syncMode === 'precise' || src.syncMode === 'balanced' ? src.syncMode : DEFAULT_MV_SETTINGS.syncMode;
  return {
    enabled: src.enabled !== false,
    autoSearch: src.autoSearch !== false,
    autoPreload: src.autoPreload !== false,
    autoApplyThreshold: normalizeAutoApplyThreshold(src.autoApplyThreshold),
    titleOnlySearch: src.titleOnlySearch === true,
    preferHighestViewCount: src.preferHighestViewCount !== false,
    immersiveBackground: src.immersiveBackground !== false,
    immersiveBackgroundAutoScale: src.immersiveBackgroundAutoScale !== false,
    immersiveBackgroundScalePercent: normalizePercent(src.immersiveBackgroundScalePercent, 115, 70, 220),
    immersiveBackgroundOffsetXPercent: normalizePercent(src.immersiveBackgroundOffsetXPercent, 50, 0, 100),
    immersiveBackgroundOffsetYPercent: normalizePercent(src.immersiveBackgroundOffsetYPercent, 50, 0, 100),
    immersiveBackgroundBlurPx: normalizePercent(src.immersiveBackgroundBlurPx, 0, 0, 32),
    immersiveBackgroundBrightnessPercent: normalizePercent(src.immersiveBackgroundBrightnessPercent, 100, 60, 140),
    immersiveBackgroundOverlayOpacityPercent: normalizePercent(src.immersiveBackgroundOverlayOpacityPercent, 0, 0, 100),
    lyricsReadabilityEnhanced: src.lyricsReadabilityEnhanced === true,
    hideLyrics: src.hideLyrics === true,
    restartAudioOnLoad: src.restartAudioOnLoad === true,
    syncMode,
    replayAudioOnChange: src.replayAudioOnChange !== false,
    enabledProviders,
    providerOrder,
    maxQuality,
    allow60fps: src.allow60fps !== false,
  };
};

const normalizeSettingsPatch = (patch) => {
  const src = isObject(patch) ? patch : {};
  const normalized = {};
  if (typeof src.enabled === 'boolean') normalized.enabled = src.enabled;
  if (Array.isArray(src.enabledProviders)) normalized.enabledProviders = normalizeProviderList(src.enabledProviders, []);
  if (Array.isArray(src.providerOrder)) normalized.providerOrder = normalizeProviderList(src.providerOrder, []);
  if (src.maxQuality === '720p' || src.maxQuality === '1080p' || src.maxQuality === '1440p' || src.maxQuality === '2160p' || src.maxQuality === 'max') {
    normalized.maxQuality = src.maxQuality;
  }
  if (typeof src.allow60fps === 'boolean') normalized.allow60fps = src.allow60fps;
  if (typeof src.autoSearch === 'boolean') normalized.autoSearch = src.autoSearch;
  if (typeof src.autoPreload === 'boolean') normalized.autoPreload = src.autoPreload;
  if (typeof src.autoApplyThreshold === 'number' && Number.isFinite(src.autoApplyThreshold)) {
    normalized.autoApplyThreshold = normalizeAutoApplyThreshold(src.autoApplyThreshold);
  }
  if (typeof src.titleOnlySearch === 'boolean') normalized.titleOnlySearch = src.titleOnlySearch;
  if (typeof src.preferHighestViewCount === 'boolean') normalized.preferHighestViewCount = src.preferHighestViewCount;
  if (typeof src.immersiveBackground === 'boolean') normalized.immersiveBackground = src.immersiveBackground;
  if (typeof src.immersiveBackgroundAutoScale === 'boolean') normalized.immersiveBackgroundAutoScale = src.immersiveBackgroundAutoScale;
  if (typeof src.immersiveBackgroundScalePercent === 'number' && Number.isFinite(src.immersiveBackgroundScalePercent)) {
    normalized.immersiveBackgroundScalePercent = normalizePercent(src.immersiveBackgroundScalePercent, 115, 70, 220);
  }
  if (typeof src.immersiveBackgroundOffsetXPercent === 'number' && Number.isFinite(src.immersiveBackgroundOffsetXPercent)) {
    normalized.immersiveBackgroundOffsetXPercent = normalizePercent(src.immersiveBackgroundOffsetXPercent, 50, 0, 100);
  }
  if (typeof src.immersiveBackgroundOffsetYPercent === 'number' && Number.isFinite(src.immersiveBackgroundOffsetYPercent)) {
    normalized.immersiveBackgroundOffsetYPercent = normalizePercent(src.immersiveBackgroundOffsetYPercent, 50, 0, 100);
  }
  if (typeof src.immersiveBackgroundBlurPx === 'number' && Number.isFinite(src.immersiveBackgroundBlurPx)) {
    normalized.immersiveBackgroundBlurPx = normalizePercent(src.immersiveBackgroundBlurPx, 0, 0, 32);
  }
  if (typeof src.immersiveBackgroundBrightnessPercent === 'number' && Number.isFinite(src.immersiveBackgroundBrightnessPercent)) {
    normalized.immersiveBackgroundBrightnessPercent = normalizePercent(src.immersiveBackgroundBrightnessPercent, 100, 60, 140);
  }
  if (typeof src.immersiveBackgroundOverlayOpacityPercent === 'number' && Number.isFinite(src.immersiveBackgroundOverlayOpacityPercent)) {
    normalized.immersiveBackgroundOverlayOpacityPercent = normalizePercent(src.immersiveBackgroundOverlayOpacityPercent, 0, 0, 100);
  }
  if (typeof src.lyricsReadabilityEnhanced === 'boolean') normalized.lyricsReadabilityEnhanced = src.lyricsReadabilityEnhanced;
  if (typeof src.hideLyrics === 'boolean') normalized.hideLyrics = src.hideLyrics;
  if (typeof src.restartAudioOnLoad === 'boolean') normalized.restartAudioOnLoad = src.restartAudioOnLoad;
  if (src.syncMode === 'stable' || src.syncMode === 'balanced' || src.syncMode === 'precise') normalized.syncMode = src.syncMode;
  if (typeof src.replayAudioOnChange === 'boolean') normalized.replayAudioOnChange = src.replayAudioOnChange;
  return normalized;
};

const customMvFromUrl = (value) => {
  const trimmed = value.trim();
  if (/^BV[0-9A-Za-z]+$/.test(trimmed)) {
    return { provider: 'bilibili', sourceId: trimmed, providerUrl: `https://www.bilibili.com/video/${trimmed}`, title: `Bilibili - ${trimmed}` };
  }
  let url;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error('Unsupported MV link. Paste a YouTube or Bilibili video URL.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  const path = url.pathname;
  if (hostname === 'youtu.be') {
    const videoId = path.split('/').filter(Boolean)[0];
    if (videoId) return { provider: 'youtube', sourceId: videoId, providerUrl: `https://www.youtube.com/watch?v=${videoId}`, title: `YouTube - ${videoId}` };
  }
  if (hostname.endsWith('youtube.com')) {
    const videoId = url.searchParams.get('v') ?? (path.startsWith('/shorts/') ? path.split('/').filter(Boolean)[1] : null);
    if (videoId) return { provider: 'youtube', sourceId: videoId, providerUrl: `https://www.youtube.com/watch?v=${videoId}`, title: `YouTube - ${videoId}` };
  }
  if (hostname.endsWith('bilibili.com')) {
    const bvid = path.split('/').map((part) => part.trim()).find((part) => /^BV[0-9A-Za-z]+$/.test(part));
    if (bvid) return { provider: 'bilibili', sourceId: bvid, providerUrl: `https://www.bilibili.com/video/${bvid}`, title: `Bilibili - ${bvid}` };
  }
  throw new Error('Unsupported MV link. Paste a YouTube or Bilibili video URL.');
};

const directTrackSearchQuery = (track) => {
  const query = [track.title, track.artist || track.albumArtist].map((value) => value?.trim()).filter(Boolean).join(' ');
  return query || undefined;
};
const titleOnlyTrackSearchQuery = (track) => track.title?.trim() || undefined;
const networkSearchPlan = (track, settings, query) => {
  const explicitQuery = query?.trim();
  if (explicitQuery) return { primaryQuery: explicitQuery, fallbackQuery: undefined };
  const baseQuery = settings.titleOnlySearch === true ? titleOnlyTrackSearchQuery(track) : directTrackSearchQuery(track);
  return { primaryQuery: baseQuery ? `${baseQuery} MV` : undefined, fallbackQuery: baseQuery };
};
const mergeSearchCandidates = (primary, fallback) => {
  const merged = new Map(primary.map((candidate) => [candidate.id, candidate]));
  for (const candidate of fallback) {
    if (!merged.has(candidate.id)) merged.set(candidate.id, candidate);
  }
  return [...merged.values()];
};
const hasCurrentAutoDecision = (candidate) => {
  if (candidate.autoEligible === false) return false;
  if (candidate.matchVersion !== undefined && candidate.matchVersion !== MV_MATCH_ALGORITHM_VERSION) return false;
  if (!candidate.decision) return true;
  return candidate.decision.algorithmVersion === MV_MATCH_ALGORITHM_VERSION && candidate.decision.autoAccept && candidate.decision.risk === 'low';
};

const makeQualityVariant = (id, label, qualityTier, overrides = {}) => ({
  id,
  label,
  qualityTier,
  width: overrides.width ?? null,
  height: overrides.height ?? (qualityTier !== 'auto' ? QUALITY_HEIGHT[qualityTier] : null),
  fps: overrides.fps ?? null,
  codec: overrides.codec ?? null,
  container: overrides.container ?? null,
  mimeType: overrides.mimeType ?? null,
  protocol: overrides.protocol ?? 'direct',
  playableInApp: overrides.playableInApp ?? false,
  requiresAccount: overrides.requiresAccount ?? false,
  expiresAt: overrides.expiresAt ?? null,
});

const externalVariant = (provider, providerUrl, label = 'External player', rawProviderJson = null) => ({
  ...makeQualityVariant(`${provider}:external`, label, 'auto', { protocol: 'external', playableInApp: false }),
  url: providerUrl,
  headers: {},
  rawProviderJson,
});

const fpsFromDashStream = (stream, label) => {
  const frameRate = text(stream.frameRate ?? stream.frame_rate);
  if (frameRate) {
    const normalizedRate = frameRate.replace(/fps$/i, '').trim();
    const ratioMatch = normalizedRate.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
    const numericRate = ratioMatch ? Number(ratioMatch[1]) / Number(ratioMatch[2]) : Number(normalizedRate);
    if (Number.isFinite(numericRate) && numericRate > 0) return Math.round(numericRate);
  }
  const labelFrameRate = label.match(/\b(\d{2,3})\s*fps\b/i);
  return labelFrameRate ? Number(labelFrameRate[1]) : null;
};
const labelWithFrameRate = (label, fps) => {
  if (!fps || fps < 55) return label;
  const suffix = `${Math.round(fps)}fps`;
  return new RegExp(`\\b${suffix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(label) ? label : `${label} ${suffix}`;
};
const bilibiliCodecVariantSuffix = (codec) => {
  const normalized = codec?.toLowerCase().trim() ?? '';
  if (!normalized) return '';
  if (normalized.startsWith('av01')) return '-av1';
  if (normalized.startsWith('avc1')) return '-avc';
  if (normalized.startsWith('hev1') || normalized.startsWith('hvc1')) return '-hevc';
  if (normalized.startsWith('dvhe') || normalized.startsWith('dvh1')) return '-dolby';
  return `-${normalized.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16)}`;
};
const bilibiliStreamVariantId = (streamQn, fps, source = 'dash-video', codec = null) => {
  const highFrameRate = fps && fps >= 100 ? `-${Math.round(fps)}fps` : '';
  const codecSuffix = source === 'dash-video' ? bilibiliCodecVariantSuffix(codec) : '';
  return `bilibili-${source === 'dash-video' ? 'dash-' : ''}qn-${streamQn}${highFrameRate}${codecSuffix}`;
};
const qualityFromHeight = (height, fallback) => {
  if (!height) return fallback;
  if (height >= 4320) return BILI_QUALITY_MAP[127];
  if (height >= 2160) return BILI_QUALITY_MAP[120];
  if (height >= 1440) return { tier: '1440p', label: '1440p' };
  if (height >= 1080) return BILI_QUALITY_MAP[80];
  return BILI_QUALITY_MAP[64];
};
const bilibiliQualitiesForSettings = (settings) =>
  BILI_QUALITY_ORDER.filter((qn) => {
    const quality = BILI_QUALITY_MAP[qn];
    if (!quality) return false;
    if (qn === 116 && settings.allow60fps === false) return false;
    if (settings.maxQuality === 'max') return true;
    if (settings.maxQuality === '2160p') return qn <= 120;
    if (settings.maxQuality === '1440p') return qn <= 112;
    if (settings.maxQuality === '1080p') return qn <= (settings.allow60fps === false ? 112 : 116);
    return qn <= 64 && QUALITY_HEIGHT[quality.tier] <= maxQualityHeight(settings.maxQuality);
  });
const bilibiliRequestedQualitiesForSettings = (settings) => {
  const qualities = bilibiliQualitiesForSettings(settings);
  const primary = qualities[0];
  if (!primary) return [];
  const fallback = qualities.find((qn) => qn < primary && qn <= 80) ?? qualities.find((qn) => qn < primary);
  return fallback ? [primary, fallback] : [primary];
};
const numericArray = (value) => asArray(value).map((entry) => number(entry)).filter((entry) => entry !== null);

const parseRange = (rangeHeader, size) => {
  if (!rangeHeader) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(String(rangeHeader).trim());
  if (!match) return null;
  const startText = match[1];
  const endText = match[2];
  if (!startText && !endText) return null;
  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isFinite(suffixLength) || suffixLength <= 0 || size <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(startText);
  const end = endText ? Number(endText) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
};

const headerGet = (headers, name) => {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key == null ? null : headers[key];
};

const isBilibiliPlayurlBlockedAttempt = (attempt) =>
  attempt.status === 412 ||
  attempt.code === -412 ||
  attempt.error === 'request_failed:412' ||
  attempt.message?.toLowerCase().includes('request was banned') === true;

const ECHO_SAFE_SECRET_PREFIX = 'safe:';
const ECHO_PLAIN_SECRET_PREFIX = 'plain:';
const ECHO_BILI_ACCOUNT_PARTITION = 'persist:echo-account-bilibili';
const ECHO_BILI_COOKIE_NAMES = new Set(['SESSDATA', 'DedeUserID', 'bili_jct', 'DedeUserID__ckMd5', 'sid', 'buvid3', 'bili_ticket']);

const resolveSafeStorage = (safeStorage) => {
  const passed = typeof safeStorage === 'function' ? safeStorage() : safeStorage;
  if (passed && typeof passed.decryptString === 'function') return passed;
  try {
    const electronSafeStorage = require('electron').safeStorage;
    return electronSafeStorage && typeof electronSafeStorage.decryptString === 'function' ? electronSafeStorage : null;
  } catch {
    return null;
  }
};

const decryptEchoAccountSecret = (value, safeStorage) => {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith(ECHO_SAFE_SECRET_PREFIX)) {
    try {
      return resolveSafeStorage(safeStorage)?.decryptString?.(Buffer.from(value.slice(ECHO_SAFE_SECRET_PREFIX.length), 'base64')) || null;
    } catch {
      return null;
    }
  }
  if (value.startsWith(ECHO_PLAIN_SECRET_PREFIX)) {
    try {
      return Buffer.from(value.slice(ECHO_PLAIN_SECRET_PREFIX.length), 'base64').toString('utf8') || null;
    } catch {
      return null;
    }
  }
  return value;
};

const cookieHeaderFromSessionCookies = (cookies) => {
  const picked = (Array.isArray(cookies) ? cookies : []).filter((cookie) => cookie?.name && ECHO_BILI_COOKIE_NAMES.has(cookie.name));
  if (!picked.some((cookie) => cookie.name === 'SESSDATA')) return '';
  return [...new Map(picked.map((cookie) => [cookie.name, `${cookie.name}=${cookie.value}`])).values()].join('; ');
};

const createEchoAccountCookieReader = ({ userData, safeStorage, log } = {}) => {
  const filePath = userData ? join(userData, 'accounts.json') : null;
  let cache = { mtimeMs: -1, cookie: '' };
  return () => {
    if (!filePath) return '';
    try {
      if (!existsSync(filePath)) {
        cache = { mtimeMs: -1, cookie: '' };
        return '';
      }
      const fileStat = statSync(filePath);
      if (fileStat.mtimeMs === cache.mtimeMs) return cache.cookie;
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      const record = isObject(parsed?.bilibili) ? parsed.bilibili : null;
      if (!record || record.authInvalid === true) {
        cache = { mtimeMs: fileStat.mtimeMs, cookie: '' };
        return '';
      }
      const encrypted = record.encryptedCookie ?? record.cookie;
      const cookie = text(decryptEchoAccountSecret(encrypted, safeStorage));
      if (!cookie && typeof encrypted === 'string' && encrypted.startsWith(ECHO_SAFE_SECRET_PREFIX)) return '';
      cache = { mtimeMs: fileStat.mtimeMs, cookie: cookie || '' };
      return cache.cookie;
    } catch (error) {
      try { log?.('WARN', `mv: echo account cookie read failed (${error instanceof Error ? error.message : String(error)})`); } catch {}
      return cache.cookie || '';
    }
  };
};

const createSessionBilibiliCookieReader = (electron) => {
  let cached = '';
  const refresh = async () => {
    const sessionApi = electron?.session;
    if (typeof sessionApi?.fromPartition !== 'function') return cached;
    try {
      const loginSession = sessionApi.fromPartition(ECHO_BILI_ACCOUNT_PARTITION);
      const batches = await Promise.all([
        loginSession.cookies.get({ domain: '.bilibili.com' }).catch(() => []),
        loginSession.cookies.get({ domain: 'bilibili.com' }).catch(() => []),
        loginSession.cookies.get({ domain: 'www.bilibili.com' }).catch(() => []),
      ]);
      cached = cookieHeaderFromSessionCookies(batches.flat()) || cached;
    } catch {}
    return cached;
  };
  return { get: () => cached, refresh };
};

const createJsonStore = (filePath, log) => {
  const data = { version: 1, settings: {}, tracks: {}, streams: {} };
  try {
    if (existsSync(filePath)) {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      if (isObject(parsed)) {
        data.settings = isObject(parsed.settings) ? parsed.settings : {};
        data.tracks = isObject(parsed.tracks) ? parsed.tracks : {};
        data.streams = isObject(parsed.streams) ? parsed.streams : {};
      }
    }
  } catch (error) {
    log('WARN', `mv: store load failed, starting empty (${error instanceof Error ? error.message : String(error)})`);
  }
  let timer = null;
  let dirty = false;
  const applyParsed = (parsed) => {
    if (!isObject(parsed)) return false;
    data.settings = isObject(parsed.settings) ? parsed.settings : {};
    data.tracks = isObject(parsed.tracks) ? parsed.tracks : {};
    data.streams = isObject(parsed.streams) ? parsed.streams : {};
    return true;
  };
  const flush = () => {
    dirty = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify({ version: 1, settings: data.settings, tracks: data.tracks, streams: data.streams }), 'utf8');
  };
  const save = () => {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (dirty) flush();
    }, STORE_DEBOUNCE_MS);
  };
  const reloadFromDisk = () => {
    if (dirty) return false;
    try {
      if (!existsSync(filePath)) return false;
      return applyParsed(JSON.parse(readFileSync(filePath, 'utf8')));
    } catch (error) {
      log('WARN', `mv: store reload failed (${error instanceof Error ? error.message : String(error)})`);
      return false;
    }
  };
  return { data, save, flush, reloadFromDisk, dispose: flush };
};

function createEngine(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const netFetch = options.netFetch || fetchImpl;
  const dataDir = options.dataDir || join(require('node:os').tmpdir(), 'echo-mv-mod');
  const dialog = options.dialog || null;
  const shell = options.shell || null;
  const configReader = typeof options.config === 'function' ? options.config : () => options.config || {};
  const log = (level, message) => {
    try {
      if (typeof options.log === 'function') options.log(level, message);
    } catch {}
  };
  const getModConfig = () => {
    const src = configReader() || {};
    return {
      youtubeApiKey: typeof src.youtubeApiKey === 'string' ? src.youtubeApiKey.trim() : '',
      bilibiliCookie: typeof src.bilibiliCookie === 'string' ? src.bilibiliCookie.trim() : '',
      debugLog: src.debugLog === true,
    };
  };
  const debug = (message) => {
    if (getModConfig().debugLog) log('INFO', `mv: ${message}`);
  };

  mkdirSync(dataDir, { recursive: true });
  const store = createJsonStore(join(dataDir, 'store.json'), log);
  const ephemeralStreams = new Map();
  const resolveStreamsInFlight = new Map();
  const lastResolveIssueByVideoId = new Map();
  const playurlBanUntilByBvid = new Map();
  let wbiKeyCache = null;
  let wbiKeyRequest = null;
  let protocolsRegistered = false;
  let lastNetworkStatus = null;
  let lastCookieSource = 'none';
  const readEchoBilibiliCookie = typeof options.readBilibiliCookie === 'function'
    ? options.readBilibiliCookie
    : createEchoAccountCookieReader({
      userData: options.echoUserData || null,
      safeStorage: options.safeStorage || null,
      log,
    });
  const sessionBilibiliCookie = options.sessionBilibiliCookie && typeof options.sessionBilibiliCookie.get === 'function'
    ? options.sessionBilibiliCookie
    : createSessionBilibiliCookieReader(options.electron || null);

  const getBilibiliCookie = () => {
    const configured = getModConfig().bilibiliCookie;
    if (configured) {
      lastCookieSource = 'config';
      return configured;
    }
    const echoCookie = text(readEchoBilibiliCookie());
    if (echoCookie) {
      lastCookieSource = 'echo-account';
      return echoCookie;
    }
    const sessionCookie = text(sessionBilibiliCookie.get());
    if (sessionCookie) {
      lastCookieSource = 'echo-session';
      return sessionCookie;
    }
    lastCookieSource = 'none';
    return '';
  };

  const cookieHeaders = () => {
    const cookie = getBilibiliCookie();
    return cookie ? { Cookie: cookie } : {};
  };

  const doFetch = async (url, init = {}) => {
    const impl = netFetch || fetchImpl;
    if (typeof impl !== 'function') throw new Error('fetch_unavailable');
    return impl(url, init);
  };

  const fetchJsonWithTimeout = async (url, headers, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await doFetch(url, {
        headers: {
          Accept: 'application/json,text/plain,*/*',
          'User-Agent': USER_AGENT,
          ...headers,
        },
        signal: controller.signal,
      });
      const body = await response.text();
      lastNetworkStatus = response.status;
      let payload = null;
      try {
        payload = JSON.parse(body.trim().replace(/^[^(]*\((.*)\);?$/s, '$1'));
      } catch {
        throw new Error(`request_failed:${response.status}`);
      }
      return { status: response.status, ok: response.ok, payload };
    } finally {
      clearTimeout(timer);
    }
  };

  const withTimeout = async (url, headers, timeoutMs = DEFAULT_NETWORK_TIMEOUT_MS) => {
    const response = await fetchJsonWithTimeout(url, headers, timeoutMs);
    if (!response.ok) throw new Error(`request_failed:${response.status}`);
    return response.payload;
  };

  const biliSearchHeaders = (query) => ({
    ...cookieHeaders(),
    Referer: `https://search.bilibili.com/video?keyword=${encodeURIComponent(query)}`,
    Origin: 'https://search.bilibili.com',
    'Accept-Language': BILI_ACCEPT_LANGUAGE,
  });
  const biliVideoHeaders = (bvid) => ({
    ...cookieHeaders(),
    Referer: `https://www.bilibili.com/video/${bvid}`,
    Origin: 'https://www.bilibili.com',
    'Accept-Language': BILI_ACCEPT_LANGUAGE,
  });

  const bilibiliWbiMixinKey = async (headers) => {
    if (wbiKeyCache && wbiKeyCache.expiresAt > Date.now()) return wbiKeyCache.value;
    if (!wbiKeyRequest) {
      wbiKeyRequest = (async () => {
        let value = null;
        try {
          const payload = await withTimeout('https://api.bilibili.com/x/web-interface/nav', headers, BILI_METADATA_TIMEOUT_MS);
          const data = isObject(payload) ? payload.data : null;
          const wbiImg = isObject(data) ? data.wbi_img : null;
          const imgKey = wbiKeyPart(isObject(wbiImg) ? wbiImg.img_url : null);
          const subKey = wbiKeyPart(isObject(wbiImg) ? wbiImg.sub_url : null);
          value = imgKey && subKey ? mixinWbiKey(`${imgKey}${subKey}`) : null;
        } catch (error) {
          debug(`wbi nav failed ${error instanceof Error ? error.message : String(error)}`);
          value = null;
        }
        wbiKeyCache = { value, expiresAt: Date.now() + (value ? BILI_WBI_KEY_CACHE_MS : BILI_WBI_KEY_FAIL_MS) };
        return value;
      })().finally(() => {
        wbiKeyRequest = null;
      });
    }
    return wbiKeyRequest;
  };

  const isPlayurlTemporarilyBlocked = (bvid) => {
    const blockedUntil = playurlBanUntilByBvid.get(bvid) ?? 0;
    if (blockedUntil <= Date.now()) {
      playurlBanUntilByBvid.delete(bvid);
      return false;
    }
    return true;
  };
  const rememberPlayurlBlocked = (bvid) => {
    playurlBanUntilByBvid.set(bvid, Date.now() + BILI_PLAYURL_BAN_MS);
  };

  const searchBilibiliAllVideos = async (query, headers) => {
    try {
      const url = new URL('https://api.bilibili.com/x/web-interface/search/all/v2');
      url.searchParams.set('keyword', query);
      url.searchParams.set('page', '1');
      const payload = await withTimeout(url.toString(), { ...headers, Referer: `https://search.bilibili.com/all?keyword=${encodeURIComponent(query)}` }, BILI_METADATA_TIMEOUT_MS);
      const data = isObject(payload) ? payload.data : null;
      const groups = isObject(data) ? asArray(data.result) : [];
      const videoGroup = groups.find((group) => isObject(group) && group.result_type === 'video');
      return isObject(videoGroup) ? asArray(videoGroup.data) : [];
    } catch (error) {
      debug(`bilibili all-search failed ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  };

  const searchBilibili = async (track, settings, queryOverride) => {
    const query = queryOverride?.trim() || [track.title, track.artist || track.albumArtist, 'MV'].filter(Boolean).join(' ');
    const headers = biliSearchHeaders(query);
    debug(`bilibili search ${query}`);
    try {
      const wbiMixinKey = await bilibiliWbiMixinKey(headers);
      const typeSearchUrl = new URL(
        wbiMixinKey ? 'https://api.bilibili.com/x/web-interface/wbi/search/type' : 'https://api.bilibili.com/x/web-interface/search/type',
      );
      typeSearchUrl.searchParams.set('search_type', 'video');
      typeSearchUrl.searchParams.set('keyword', query);
      typeSearchUrl.searchParams.set('page', '1');
      typeSearchUrl.searchParams.set('order', 'totalrank');
      typeSearchUrl.searchParams.set('page_size', '8');
      if (wbiMixinKey) appendWbiSignature(typeSearchUrl, wbiMixinKey);
      let typeResults = [];
      try {
        const typePayload = await withTimeout(typeSearchUrl.toString(), headers, BILI_METADATA_TIMEOUT_MS);
        const typeData = isObject(typePayload) ? typePayload.data : null;
        typeResults = isObject(typeData) ? asArray(typeData.result) : [];
      } catch (error) {
        debug(`bilibili type-search failed ${error instanceof Error ? error.message : String(error)}`);
        typeResults = [];
      }
      const results = typeResults.length > 0 ? typeResults : await searchBilibiliAllVideos(query, headers);
      return results
        .flatMap((item) => {
          if (!isObject(item)) return [];
          const bvid = text(item.bvid);
          const title = stripHtml(item.title);
          const viewCount = metricNumber(item.play);
          if (!bvid || !title) return [];
          const uploader = stripHtml(item.author) ?? null;
          const uploaderId = text(item.mid) ?? (number(item.mid) !== null ? String(number(item.mid)) : null);
          const durationSeconds = parseMvDurationSeconds(item.duration);
          const scoring = scoreNetworkMvCandidate(track, { title, uploader, durationSeconds });
          const providerUrl = `https://www.bilibili.com/video/${bvid}`;
          return [{
            id: `bilibili:${bvid}`,
            provider: 'bilibili',
            sourceType: 'search_candidate',
            title,
            artist: uploader,
            filePath: null,
            url: providerUrl,
            providerUrl,
            thumbnailUrl: normalizeUrl(item.pic),
            uploader,
            uploaderId,
            viewCount,
            availableQualities: [],
            durationSeconds,
            score: scoring.score,
            autoEligible: scoring.autoEligible,
            matchVersion: scoring.matchVersion,
            decision: scoring.decision,
            playableInApp: true,
            reasons: ['Bilibili search', ...scoring.reasons, viewCount !== null ? `播放 ${viewCount}` : '播放量未知'],
          }];
        })
        .sort((left, right) => {
          const scoreDelta = right.score - left.score;
          if (scoreDelta !== 0) return scoreDelta;
          return settings.preferHighestViewCount ? (right.viewCount ?? -1) - (left.viewCount ?? -1) : 0;
        })
        .slice(0, 8);
    } catch (error) {
      log('WARN', `mv: bilibili search failed ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  };

  const resolveBilibili = async (video, settings) => {
    const bvid = video.sourceId ?? (video.id.startsWith('bilibili:') ? video.id.slice('bilibili:'.length) : null);
    if (!bvid) return [externalVariant('bilibili', video.providerUrl ?? video.url, 'Bilibili')];
    if (isPlayurlTemporarilyBlocked(bvid)) {
      log('WARN', `mv: bilibili playurl backoff active for ${bvid}`);
      return [externalVariant('bilibili', video.providerUrl ?? video.url, 'Bilibili', {
        provider: 'bilibili',
        resolver: 'bilibili-playurl',
        unavailableReason: 'bilibili-playurl-blocked',
      })];
    }
    const headers = biliVideoHeaders(bvid);
    let viewPayload;
    try {
      viewPayload = await withTimeout(`https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`, headers);
    } catch (error) {
      log('WARN', `mv: bilibili view failed ${bvid} ${error instanceof Error ? error.message : String(error)}`);
      return [externalVariant('bilibili', video.providerUrl ?? video.url, 'Bilibili')];
    }
    const viewData = isObject(viewPayload) ? viewPayload.data : null;
    const cid = number(isObject(viewData) ? viewData.cid : null);
    if (!cid) {
      log('WARN', `mv: Bilibili MV view did not return a playable cid (${bvid})`);
      return [externalVariant('bilibili', video.providerUrl ?? video.url, 'Bilibili')];
    }
    const requestedQualities = bilibiliRequestedQualitiesForSettings(settings);
    const variants = [];
    const playAttempts = [];
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRES_MS).toISOString();
    const wbiMixinKey = await bilibiliWbiMixinKey(headers);
    const makePlayUrl = (qn, fnval, endpoint) => {
      const playUrl = new URL(endpoint === 'wbi-playurl' ? 'https://api.bilibili.com/x/player/wbi/playurl' : 'https://api.bilibili.com/x/player/playurl');
      playUrl.searchParams.set('bvid', bvid);
      playUrl.searchParams.set('cid', String(cid));
      playUrl.searchParams.set('qn', String(qn));
      playUrl.searchParams.set('fnval', fnval);
      playUrl.searchParams.set('fnver', '0');
      playUrl.searchParams.set('fourk', '1');
      if (endpoint === 'wbi-playurl' && wbiMixinKey) appendWbiSignature(playUrl, wbiMixinKey);
      return playUrl;
    };
    const playEndpoints = wbiMixinKey ? ['wbi-playurl', 'playurl'] : ['playurl'];
    let playurlBlocked = false;
    const fetchPlayData = async (qn, fnval) => {
      if (playurlBlocked) return null;
      for (const endpoint of playEndpoints) {
        try {
          const response = await fetchJsonWithTimeout(makePlayUrl(qn, fnval, endpoint).toString(), headers);
          const payload = response.payload;
          const code = nullableNumber(isObject(payload) ? payload.code : null);
          const message = text(isObject(payload) ? payload.message : null);
          const data = isObject(payload) ? payload.data : null;
          const dash = isObject(data) && isObject(data.dash) ? data.dash : null;
          const hasDashVideo = asArray(dash?.video).some(isObject);
          const hasDurl = isObject(data) && asArray(data.durl).some(isObject);
          const attempt = { endpoint, fnval, qn, status: response.status, code, message, quality: number(isObject(data) ? data.quality : null), hasDurl, hasDashVideo, error: response.ok ? null : `request_failed:${response.status}` };
          playAttempts.push(attempt);
          if (isBilibiliPlayurlBlockedAttempt(attempt)) {
            playurlBlocked = true;
            rememberPlayurlBlocked(bvid);
            return null;
          }
          if (!response.ok || !isObject(data)) continue;
          if (hasDashVideo || hasDurl) return { data, endpoint };
        } catch (error) {
          const attempt = { endpoint, fnval, qn, status: null, code: null, message: null, quality: null, hasDurl: false, hasDashVideo: false, error: error instanceof Error ? error.message : String(error) };
          playAttempts.push(attempt);
          if (isBilibiliPlayurlBlockedAttempt(attempt)) {
            playurlBlocked = true;
            rememberPlayurlBlocked(bvid);
            return null;
          }
        }
      }
      return null;
    };
    const pushStreamVariant = ({ actualQn, actualQuality, availableQn, endpoint, requestedQn, source, stream }) => {
      const streamHeight = nullableNumber(stream.height);
      const inferredQuality = qualityFromHeight(streamHeight, actualQuality);
      const streamQn = number(stream.id) ?? actualQn ?? (source === 'durl' && requestedQn > 120 ? 120 : requestedQn);
      const streamQuality = BILI_QUALITY_MAP[streamQn] ?? inferredQuality;
      const streamUrl = firstUrl(stream.baseUrl, stream.base_url, stream.url, stream.backupUrl, stream.backup_url);
      const variantFps = source === 'dash-video' ? fpsFromDashStream(stream, streamQuality.label) : streamQn === 116 ? 60 : null;
      const codec = text(stream.codecs);
      const streamId = bilibiliStreamVariantId(streamQn, variantFps, source, codec);
      if (!streamUrl || variants.some((variant) => variant.id === streamId || variant.url === streamUrl)) return;
      const variantHeight = streamHeight ?? BILI_QUALITY_HEIGHT[streamQn] ?? QUALITY_HEIGHT[streamQuality.tier];
      const streamWidth = nullableNumber(stream.width);
      if (variantFps && variantFps >= 55 && settings.allow60fps === false) return;
      const label = labelWithFrameRate(streamQuality.label, variantFps);
      const browserPlayable = isBrowserPlayableBilibiliCodec(codec);
      const mutedVideoOnly = source === 'dash-video' && browserPlayable;
      variants.push({
        ...makeQualityVariant(streamId, label, streamQuality.tier, {
          width: streamWidth,
          height: variantHeight,
          fps: variantFps,
          codec,
          container: 'mp4',
          mimeType: 'video/mp4',
          protocol: mutedVideoOnly || source === 'durl' ? 'direct' : 'dash',
          playableInApp: mutedVideoOnly || (source === 'durl' && browserPlayable),
          requiresAccount: streamQn >= 112 && !getBilibiliCookie(),
          expiresAt,
        }),
        url: streamUrl,
        headers: {
          ...cookieHeaders(),
          Referer: video.providerUrl ?? `https://www.bilibili.com/video/${bvid}`,
          'User-Agent': USER_AGENT,
        },
        rawProviderJson: {
          provider: 'bilibili',
          resolver: source === 'dash-video' ? 'bilibili-dash-video-v4' : 'bilibili-progressive-mp4-v1',
          source,
          endpoint,
          requestedQn,
          qn: streamQn,
          qualityRank: bilibiliQualityRank(streamQn),
          availableQn,
          qualityLimited: streamQn < requestedQn,
          mutedVideoOnly,
          cid,
        },
      });
    };
    const hasPlayableDirectVariant = () => variants.some((variant) => variant.protocol === 'direct' && variant.playableInApp && variant.url);
    for (const qn of requestedQualities) {
      const quality = BILI_QUALITY_MAP[qn];
      if (!quality) continue;
      if (QUALITY_HEIGHT[quality.tier] > maxQualityHeight(settings.maxQuality)) continue;
      try {
        const playResult = await fetchPlayData(qn, BILI_DASH_FNVAL);
        const playData = playResult?.data ?? null;
        const actualQn = number(isObject(playData) ? playData.quality : null);
        const actualQuality = actualQn ? BILI_QUALITY_MAP[actualQn] ?? quality : quality;
        const availableQn = isObject(playData) ? Array.from(new Set([...numericArray(playData.accept_quality), ...numericArray(playData.acceptQuality)])) : [];
        const dash = isObject(playData) && isObject(playData.dash) ? playData.dash : null;
        const dashStreams = asArray(dash?.video)
          .filter(isObject)
          .filter((stream) => {
            const streamHeight = nullableNumber(stream.height);
            return !streamHeight || streamHeight <= maxQualityHeight(settings.maxQuality);
          })
          .map((stream) => ({ stream, source: 'dash-video' }));
        const durl = asArray(isObject(playData) ? playData.durl : null).find(isObject);
        const streamCandidates = dashStreams.length > 0 ? dashStreams : durl ? [{ stream: durl, source: 'durl' }] : [];
        for (const { stream, source } of streamCandidates) {
          pushStreamVariant({ actualQn, actualQuality, availableQn, endpoint: playResult?.endpoint ?? 'playurl', requestedQn: qn, source, stream });
        }
      } catch {}
      if (playurlBlocked || hasPlayableDirectVariant()) break;
      try {
        const progressiveResult = await fetchPlayData(qn, '1');
        const progressiveData = progressiveResult?.data ?? null;
        const actualQn = number(isObject(progressiveData) ? progressiveData.quality : null);
        const actualQuality = actualQn ? BILI_QUALITY_MAP[actualQn] ?? quality : quality;
        const availableQn = isObject(progressiveData) ? Array.from(new Set([...numericArray(progressiveData.accept_quality), ...numericArray(progressiveData.acceptQuality)])) : [];
        const durlStreams = asArray(isObject(progressiveData) ? progressiveData.durl : null).filter(isObject);
        for (const stream of durlStreams) {
          pushStreamVariant({ actualQn, actualQuality, availableQn, endpoint: progressiveResult?.endpoint ?? 'playurl', requestedQn: qn, source: 'durl', stream });
        }
      } catch {}
      if (playurlBlocked || hasPlayableDirectVariant()) break;
    }
    const blockedAttempt = playAttempts.find(isBilibiliPlayurlBlockedAttempt) ?? null;
    const blockedRawProviderJson = blockedAttempt
      ? {
        provider: 'bilibili',
        resolver: 'bilibili-playurl',
        unavailableReason: 'bilibili-playurl-blocked',
        status: blockedAttempt.status,
        code: blockedAttempt.code,
        message: blockedAttempt.message,
        error: blockedAttempt.error,
        attemptedCount: playAttempts.length,
      }
      : null;
    if (!hasPlayableDirectVariant()) {
      log('WARN', `mv: Bilibili MV resolved without an in-app MP4 stream (${bvid} cid=${cid})`);
    }
    if (blockedRawProviderJson && !hasPlayableDirectVariant()) {
      return [...variants, externalVariant('bilibili', video.providerUrl ?? video.url, 'Bilibili', blockedRawProviderJson)];
    }
    return variants.length > 0 ? variants : [externalVariant('bilibili', video.providerUrl ?? video.url, 'Bilibili')];
  };

  const searchYouTube = async (track, _settings, queryOverride) => {
    const apiKey = getModConfig().youtubeApiKey;
    if (!apiKey) return [];
    try {
      const query = queryOverride?.trim() || [track.title, track.artist || track.albumArtist, 'MV'].filter(Boolean).join(' ');
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('type', 'video');
      url.searchParams.set('videoEmbeddable', 'true');
      url.searchParams.set('maxResults', '8');
      url.searchParams.set('order', 'relevance');
      url.searchParams.set('q', query);
      url.searchParams.set('key', apiKey);
      const payload = await withTimeout(url.toString(), {});
      const items = asArray(isObject(payload) ? payload.items : null);
      return items.slice(0, 8).flatMap((item) => {
        if (!isObject(item) || !isObject(item.id) || !isObject(item.snippet)) return [];
        const videoId = text(item.id.videoId);
        const title = text(item.snippet.title);
        if (!videoId || !title) return [];
        const thumbnails = isObject(item.snippet.thumbnails) ? item.snippet.thumbnails : {};
        const thumbnail = isObject(thumbnails.high) ? normalizeUrl(thumbnails.high.url) : null;
        const providerUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const uploader = text(item.snippet.channelTitle);
        const uploaderId = text(item.snippet.channelId);
        const scoring = scoreNetworkMvCandidate(track, { title, uploader, durationSeconds: null });
        return [{
          id: `youtube:${videoId}`,
          provider: 'youtube',
          sourceType: 'search_candidate',
          title,
          artist: uploader,
          filePath: null,
          url: providerUrl,
          providerUrl,
          thumbnailUrl: thumbnail,
          uploader,
          uploaderId,
          viewCount: null,
          availableQualities: [],
          durationSeconds: null,
          score: scoring.score,
          autoEligible: scoring.autoEligible,
          matchVersion: scoring.matchVersion,
          decision: scoring.decision,
          playableInApp: false,
          reasons: ['YouTube Data API', ...scoring.reasons],
        }];
      });
    } catch (error) {
      log('WARN', `mv: youtube search failed ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  };

  const resolveYouTube = async (video) => [externalVariant('youtube', video.providerUrl ?? video.url, 'YouTube')];

  const providerSearch = { bilibili: searchBilibili, youtube: searchYouTube };
  const providerResolve = { bilibili: resolveBilibili, youtube: resolveYouTube };

  const getSettings = () => mergeSettings(store.data.settings);
  const setSettingsFromPatch = (patch) => {
    store.data.settings = mergeSettings({ ...getSettings(), ...normalizeSettingsPatch(patch) });
    store.save();
    return getSettings();
  };

  const ensureTrack = (trackId) => {
    if (!isObject(store.data.tracks[trackId])) store.data.tracks[trackId] = { videos: [] };
    if (!Array.isArray(store.data.tracks[trackId].videos)) store.data.tracks[trackId].videos = [];
    return store.data.tracks[trackId];
  };
  const rememberSnapshot = (snapshot) => {
    const track = ensureTrack(snapshot.trackId);
    track.lastSnapshot = snapshot;
    store.save();
  };
  const getRow = (videoId) => {
    for (const track of Object.values(store.data.tracks)) {
      const row = (track.videos || []).find((video) => video.id === videoId);
      if (row) return row;
    }
    return null;
  };
  const requireRow = (videoId) => {
    const row = getRow(videoId);
    if (!row) throw new Error(`Unknown MV video ${videoId}`);
    return row;
  };
  const getStreamRows = (videoId) => (Array.isArray(store.data.streams[videoId]) ? store.data.streams[videoId] : []);
  const isExpired = (variant) => Boolean(variant.expiresAt && Date.parse(variant.expiresAt) <= Date.now());
  const isStaleBilibiliDashDirect = (variant) => {
    if (!variant || variant.protocol !== 'direct') return false;
    const raw = recordFromUnknown(variant.rawProviderJson);
    const provider = variant.provider || raw?.provider;
    if (provider !== 'bilibili') return false;
    return !isTrustedBilibiliMutedVideoOnly(raw, provider) && (raw?.source === 'dash-video' || raw?.resolver === 'bilibili-dash-video-v4');
  };
  const isPlayableStreamRow = (variant) => {
    if (!variant?.url || !variant.playableInApp || variant.protocol !== 'direct') return false;
    if (isStaleBilibiliDashDirect(variant)) return false;
    const provider = variant.provider || recordFromUnknown(variant.rawProviderJson)?.provider;
    return provider !== 'bilibili' || isBrowserPlayableBilibiliCodec(variant.codec);
  };
  const isPlayableResolvedVariant = (variant) =>
    Boolean(variant.url && variant.playableInApp && variant.protocol === 'direct' && !isStaleBilibiliDashDirect(variant));
  const getValidStreamRows = (videoId) => getStreamRows(videoId).filter((variant) => !isExpired(variant));
  const getPlaybackStreamRows = (videoId) => {
    const rows = getStreamRows(videoId);
    const validRows = rows.filter((variant) => !isExpired(variant));
    return validRows.some(isPlayableStreamRow) ? validRows : rows;
  };
  const getStreamRow = (videoId, variantId) => getStreamRows(videoId).find((variant) => variant.variantId === variantId) || null;

  const bilibiliQnFromRaw = (variant) => {
    const qn = Number(recordFromUnknown(variant.rawProviderJson)?.qn);
    return Number.isFinite(qn) && qn > 0 ? qn : null;
  };
  const bilibiliRankFromRaw = (variant) => {
    const explicitRank = Number(recordFromUnknown(variant.rawProviderJson)?.qualityRank);
    if (Number.isFinite(explicitRank) && explicitRank > 0) return explicitRank;
    const qn = bilibiliQnFromRaw(variant);
    return qn ? bilibiliQualityRank(qn) : 0;
  };
  const isBilibiliMutedVideoOnlyStream = (variant) => isTrustedBilibiliMutedVideoOnly(recordFromUnknown(variant.rawProviderJson), variant.provider);
  const isLegacyCodecCollapsedBilibiliDashVariant = (variant) => {
    if (variant.provider !== 'bilibili' || !/^bilibili-dash-qn-\d+(?:-\d+fps)?$/u.test(variant.variantId || '')) return false;
    const raw = recordFromUnknown(variant.rawProviderJson);
    return raw?.source === 'dash-video' && raw.resolver === 'bilibili-dash-video-v4';
  };

  const chooseStreamVariant = (row, variants) => {
    const selectedQualityId = row.selectedQualityId ?? 'auto';
    if (selectedQualityId !== 'auto') {
      const selected = variants.find((variant) => variant.variantId === selectedQualityId);
      if (isPlayableStreamRow(selected)) return selected;
    }
    const settings = getSettings();
    return [...variants]
      .filter(isPlayableStreamRow)
      .filter((variant) => {
        if (row.provider === 'bilibili') {
          const qn = bilibiliQnFromRaw(variant);
          return qn ? qn <= maxBilibiliQnForSettings(settings) : !variant.height || variant.height <= maxQualityHeight(settings.maxQuality);
        }
        return !variant.height || variant.height <= maxQualityHeight(settings.maxQuality);
      })
      .filter((variant) => {
        if (settings.allow60fps !== false) return true;
        const qn = row.provider === 'bilibili' ? bilibiliQnFromRaw(variant) : null;
        return qn !== 116 && (!variant.fps || variant.fps < 55);
      })
      .sort((left, right) => {
        if (row.provider === 'bilibili') {
          const rankDelta = bilibiliRankFromRaw(right) - bilibiliRankFromRaw(left);
          if (rankDelta !== 0) return rankDelta;
          const mutedDelta = Number(isBilibiliMutedVideoOnlyStream(left)) - Number(isBilibiliMutedVideoOnlyStream(right));
          if (mutedDelta !== 0) return mutedDelta;
        }
        const heightDelta = (right.height ?? 0) - (left.height ?? 0);
        if (heightDelta !== 0) return heightDelta;
        const fpsDelta = (right.fps ?? 0) - (left.fps ?? 0);
        if (fpsDelta !== 0) return fpsDelta;
        return String(right.codec ?? '').localeCompare(String(left.codec ?? ''));
      })[0] ?? null;
  };

  const chooseResolvedStreamVariant = (providerId, variants, settings) =>
    [...variants]
      .filter(isPlayableResolvedVariant)
      .filter((variant) => {
        if (providerId === 'bilibili') {
          const qn = Number(recordFromUnknown(variant.rawProviderJson)?.qn);
          return Number.isFinite(qn) && qn > 0 ? qn <= maxBilibiliQnForSettings(settings) : !variant.height || variant.height <= maxQualityHeight(settings.maxQuality);
        }
        return !variant.height || variant.height <= maxQualityHeight(settings.maxQuality);
      })
      .filter((variant) => {
        if (settings.allow60fps !== false) return true;
        const qn = providerId === 'bilibili' ? Number(recordFromUnknown(variant.rawProviderJson)?.qn) : null;
        return qn !== 116 && (!variant.fps || variant.fps < 55);
      })
      .sort((left, right) => {
        if (providerId === 'bilibili') {
          const rankDelta = (Number(recordFromUnknown(right.rawProviderJson)?.qualityRank) || 0) - (Number(recordFromUnknown(left.rawProviderJson)?.qualityRank) || 0);
          if (rankDelta !== 0) return rankDelta;
          const mutedDelta = Number(isTrustedBilibiliMutedVideoOnly(recordFromUnknown(left.rawProviderJson), left.provider)) - Number(isTrustedBilibiliMutedVideoOnly(recordFromUnknown(right.rawProviderJson), right.provider));
          if (mutedDelta !== 0) return mutedDelta;
        }
        const heightDelta = (right.height ?? 0) - (left.height ?? 0);
        if (heightDelta !== 0) return heightDelta;
        const fpsDelta = (right.fps ?? 0) - (left.fps ?? 0);
        if (fpsDelta !== 0) return fpsDelta;
        return String(right.codec ?? '').localeCompare(String(left.codec ?? ''));
      })[0] ?? null;

  const mediaUrlForLocal = (row) => {
    if (row.provider !== 'local' || !row.internalFilePath || !isBrowserPlayableVideo(row.internalFilePath) || !existsSync(row.internalFilePath)) return null;
    return `echo-video://mv/${encodeURIComponent(row.id)}`;
  };
  const mediaUrlForStream = (row, variant) => {
    if (!isPlayableStreamRow(variant)) return null;
    return `echo-mv://stream/${encodeURIComponent(row.id)}/${encodeURIComponent(variant.variantId)}`;
  };

  const unavailableRawFromRows = (variants) =>
    variants.map((variant) => recordFromUnknown(variant.rawProviderJson)).find((raw) => typeof raw?.unavailableReason === 'string') ?? null;
  const unavailableRawFromResolved = (variants) =>
    variants.map((variant) => recordFromUnknown(variant.rawProviderJson)).find((raw) => typeof raw?.unavailableReason === 'string') ?? null;
  const mergeRaw = (base, issue) => {
    if (!issue) return base ?? null;
    const baseRecord = recordFromUnknown(base);
    return baseRecord ? { ...baseRecord, ...issue } : issue;
  };

  const mapRow = (row) => {
    const fileExists = row.provider !== 'local' || !row.internalFilePath || existsSync(row.internalFilePath);
    const localPlayable = row.provider === 'local' && Boolean(row.internalFilePath) && fileExists && isBrowserPlayableVideo(row.internalFilePath);
    const streamRows = row.provider === 'local' ? [] : getPlaybackStreamRows(row.id);
    const selectedStream = row.provider === 'local' ? null : chooseStreamVariant(row, streamRows);
    const streamPlayable = isPlayableStreamRow(selectedStream);
    const provider = providerName(row.provider);
    const useRowSnapshot = provider === 'local';
    const resolveIssue = lastResolveIssueByVideoId.get(row.id) ?? unavailableRawFromRows(streamRows);
    return {
      id: row.id,
      trackId: row.trackId,
      provider,
      sourceType: sourceTypeName(row.sourceType),
      sourceId: row.sourceId ?? null,
      title: row.title ?? null,
      artist: row.artist ?? null,
      url: row.url ?? null,
      providerUrl: row.providerUrl ?? row.url ?? null,
      thumbnailUrl: row.thumbnailUrl ?? null,
      filePath: null,
      mediaUrl: localPlayable ? mediaUrlForLocal(row) : mediaUrlForStream(row, selectedStream),
      mimeType: selectedStream?.mimeType ?? (useRowSnapshot ? row.mimeType ?? null : null),
      durationSeconds: row.durationSeconds ?? null,
      width: selectedStream?.width ?? (useRowSnapshot ? row.width ?? null : null),
      height: selectedStream?.height ?? (useRowSnapshot ? row.height ?? null : null),
      selectedQualityId: provider === 'local' ? null : (row.selectedQualityId ?? 'auto'),
      qualityLabel: selectedStream?.label ?? (useRowSnapshot ? row.qualityLabel ?? null : null),
      fps: selectedStream?.fps ?? (useRowSnapshot ? row.fps ?? null : null),
      offsetMs: clampOffsetMs(row.offsetMs ?? 0),
      score: Number(row.score ?? 0),
      selected: row.selected === true,
      selectionOrigin: selectionOriginName(row.selectionOrigin),
      playableInApp: localPlayable || streamPlayable,
      temporary: false,
      rawProviderJson: mergeRaw(row.rawProviderJson ?? null, resolveIssue),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  };

  const applySelectedStreamSnapshot = (videoId) => {
    const row = requireRow(videoId);
    const variants = getPlaybackStreamRows(videoId);
    const selected = chooseStreamVariant(row, variants);
    const requestedQualityId = row.selectedQualityId ?? 'auto';
    const requestedVariant = requestedQualityId !== 'auto' ? variants.find((variant) => variant.variantId === requestedQualityId) : null;
    row.width = selected?.width ?? null;
    row.height = selected?.height ?? null;
    row.fps = selected?.fps ?? null;
    row.mimeType = selected?.mimeType ?? null;
    row.qualityLabel = selected?.label ?? null;
    row.selectedQualityId = requestedQualityId !== 'auto' && !isPlayableStreamRow(requestedVariant) ? 'auto' : requestedQualityId;
    row.updatedAt = nowIso();
    store.save();
  };

  const writeResolvedStreams = (row, variants) => {
    const timestamp = nowIso();
    store.data.streams[row.id] = variants.map((variant) => ({
      variantId: variant.id,
      provider: row.provider,
      label: variant.label,
      qualityTier: variant.qualityTier,
      width: variant.width,
      height: variant.height,
      fps: variant.fps,
      codec: variant.codec,
      container: variant.container,
      mimeType: variant.mimeType,
      protocol: variant.protocol,
      url: variant.url,
      headers: variant.headers || {},
      playableInApp: Boolean(variant.playableInApp),
      requiresAccount: Boolean(variant.requiresAccount),
      expiresAt: variant.expiresAt,
      rawProviderJson: variant.rawProviderJson ?? null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }));
    store.flush();
  };

  const cacheResolvedStreams = (row, variants) => {
    if (!variants.some(isPlayableResolvedVariant) && getStreamRows(row.id).some(isPlayableStreamRow)) return;
    writeResolvedStreams(row, variants);
  };

  const shouldRefreshResolvedStreams = (row, variants, settings) => {
    if (row.provider !== 'bilibili' || variants.length === 0 || maxQualityHeight(settings.maxQuality) <= 720) return false;
    if (variants.some(isLegacyCodecCollapsedBilibiliDashVariant)) return true;
    const hasCurrentResolver = variants.some((variant) => {
      const raw = recordFromUnknown(variant.rawProviderJson);
      return Boolean(raw && raw.resolver === 'bilibili-dash-video-v4' && Number.isFinite(Number(raw.qualityRank)));
    });
    if (!hasCurrentResolver) return true;
    const highestRequestedQn = variants.reduce((highest, variant) => {
      const requestedQn = Number(recordFromUnknown(variant.rawProviderJson)?.requestedQn);
      return Number.isFinite(requestedQn) ? Math.max(highest, requestedQn) : highest;
    }, 0);
    return highestRequestedQn < maxBilibiliQnForSettings(settings);
  };

  const sanitizeVariant = (variant) => ({
    id: variant.variantId,
    label: variant.label,
    qualityTier: qualityTierName(variant.qualityTier),
    width: variant.width ?? null,
    height: variant.height ?? null,
    fps: variant.fps ?? null,
    codec: variant.codec ?? null,
    container: variant.container ?? null,
    mimeType: variant.mimeType ?? null,
    protocol: variant.protocol === 'dash' || variant.protocol === 'hls' || variant.protocol === 'external' ? variant.protocol : 'direct',
    playableInApp: Boolean(variant.playableInApp),
    requiresAccount: Boolean(variant.requiresAccount),
    expiresAt: variant.expiresAt ?? null,
  });

  const getSelectedVideo = (trackId) => {
    const track = store.data.tracks[trackId];
    if (!track) return null;
    const selected = [...(track.videos || [])].filter((row) => row.selected).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    return selected ? mapRow(selected) : null;
  };

  const getVideoCandidates = (trackId) => {
    const track = store.data.tracks[trackId];
    if (!track) return [];
    return [...(track.videos || [])]
      .sort((left, right) => Number(right.selected) - Number(left.selected) || (right.score || 0) - (left.score || 0) || String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .map(mapRow);
  };

  const deselectTrack = (trackId) => {
    const track = ensureTrack(trackId);
    const timestamp = nowIso();
    for (const video of track.videos) {
      if (video.selected) {
        video.selected = false;
        video.updatedAt = timestamp;
      }
    }
  };

  const commitSelectedVideo = (trackId, videoId, origin) => {
    const row = requireRow(videoId);
    if (row.trackId !== trackId) throw new Error(`Unknown MV candidate ${videoId}`);
    deselectTrack(trackId);
    row.selected = true;
    row.selectionOrigin = origin;
    row.updatedAt = nowIso();
    store.save();
    return mapRow(row);
  };

  const findBySource = (trackId, provider, sourceId) =>
    (ensureTrack(trackId).videos || []).find((video) => video.provider === provider && video.sourceId === sourceId) || null;

  const upsertNetworkCandidate = (track, candidate) => {
    const sourceId = sourceIdForCandidate(candidate);
    const existing = findBySource(track.id, candidate.provider, sourceId);
    const timestamp = nowIso();
    const id = existing?.id ?? randomUUID();
    const providerUrl = candidate.providerUrl ?? candidate.url;
    const row = existing || {
      id,
      trackId: track.id,
      provider: candidate.provider,
      selected: false,
      createdAt: timestamp,
    };
    row.sourceType = 'search_candidate';
    row.sourceId = sourceId;
    row.title = candidate.title;
    row.artist = candidate.artist;
    row.url = providerUrl;
    row.providerUrl = providerUrl;
    row.thumbnailUrl = candidate.thumbnailUrl;
    row.internalFilePath = null;
    row.durationSeconds = candidate.durationSeconds;
    row.selectedQualityId = existing?.selectedQualityId ?? 'auto';
    row.rawProviderJson = {
      uploader: candidate.uploader,
      uploaderId: candidate.uploaderId ?? null,
      reasons: candidate.reasons,
      viewCount: candidate.viewCount ?? null,
      autoEligible: candidate.autoEligible ?? null,
      matchVersion: candidate.matchVersion ?? null,
      decision: candidate.decision ?? null,
    };
    row.score = candidate.score;
    row.updatedAt = timestamp;
    if (!existing) ensureTrack(track.id).videos.push(row);
    store.save();
    return { ...candidate, id, filePath: null, providerUrl, url: providerUrl };
  };

  const upsertLocalCandidate = (track, candidate) => {
    if (!candidate.filePath) return { ...candidate, filePath: null };
    const normalizedPath = resolve(candidate.filePath);
    const sourceId = fileHashId(normalizedPath);
    const existing = findBySource(track.id, 'local', sourceId);
    const timestamp = nowIso();
    const id = existing?.id ?? randomUUID();
    const row = existing || { id, trackId: track.id, provider: 'local', selected: false, createdAt: timestamp };
    row.sourceType = candidate.sourceType;
    row.sourceId = sourceId;
    row.title = candidate.title;
    row.artist = candidate.artist;
    row.url = null;
    row.providerUrl = null;
    row.thumbnailUrl = null;
    row.internalFilePath = normalizedPath;
    row.mimeType = mimeTypeForVideoPath(normalizedPath);
    row.durationSeconds = candidate.durationSeconds;
    row.score = candidate.score;
    row.updatedAt = timestamp;
    if (!existing) ensureTrack(track.id).videos.push(row);
    store.save();
    return { ...candidate, id, filePath: null, playableInApp: isBrowserPlayableVideo(normalizedPath) && existsSync(normalizedPath) };
  };

  const shouldAutoSelectNetworkCandidate = (trackId) => {
    const selected = getSelectedVideo(trackId);
    if (!selected) return true;
    return selected.sourceType === 'search_candidate' && (!selected.playableInApp || !selected.mediaUrl);
  };

  const rankAutoCandidates = (candidates, settings) => {
    const enabledProviders = new Set(settings.enabledProviders);
    const providerRank = (provider) => {
      if (provider === 'local') return -1;
      const index = settings.providerOrder.indexOf(provider);
      return index >= 0 ? index : Number.MAX_SAFE_INTEGER;
    };
    return [...candidates]
      .filter((candidate) => candidate.provider === 'local' || enabledProviders.has(candidate.provider))
      .filter((candidate) => candidate.playableInApp)
      .filter((candidate) => candidate.provider === 'local' || hasCurrentAutoDecision(candidate))
      .filter((candidate) => candidate.score >= normalizeAutoApplyThreshold(settings.autoApplyThreshold))
      .sort((left, right) => {
        const scoreDelta = right.score - left.score;
        if (scoreDelta !== 0) return scoreDelta;
        if (settings.preferHighestViewCount) {
          const viewDelta = (right.viewCount ?? -1) - (left.viewCount ?? -1);
          if (viewDelta !== 0) return viewDelta;
        }
        return providerRank(left.provider) - providerRank(right.provider);
      });
  };

  const sameUploaderAutoResolutionCandidates = (candidates) => {
    const first = candidates[0];
    if (!first) return [];
    if (!first.uploaderId) return [first];
    return candidates.filter((candidate) => candidate.id === first.id || (candidate.provider === first.provider && candidate.uploaderId === first.uploaderId));
  };
  const hasConfidentAutoMatchLead = (candidates) => {
    const first = candidates[0];
    if (!first) return false;
    const second = candidates[1];
    return !second || first.score >= MV_AUTO_MATCH_HIGH_CONFIDENCE || first.score - second.score >= MV_AUTO_MATCH_MIN_MARGIN;
  };

  const resolveStreamsUnsafe = async (videoId, optionsResolve = {}) => {
    const row = requireRow(videoId);
    if (row.provider === 'local') return { video: mapRow(row), variants: [] };
    const providerId = providerName(row.provider);
    if (providerId !== 'bilibili' && providerId !== 'youtube') return { video: mapRow(row), variants: [] };
    if (providerId === 'bilibili') {
      try { await sessionBilibiliCookie.refresh?.(); } catch {}
    }
    const settings = getSettings();
    let variants = getValidStreamRows(row.id);
    if (optionsResolve.forceRefresh || variants.length === 0 || !variants.some(isPlayableStreamRow) || shouldRefreshResolvedStreams(row, variants, settings)) {
      const resolve = providerResolve[providerId];
      if (!resolve) throw new Error(`MV provider ${providerId} is unavailable`);
      try {
        const resolvedVariants = await resolve(mapRow(row), settings);
        const resolveIssue = unavailableRawFromResolved(resolvedVariants);
        if (resolvedVariants.some(isPlayableResolvedVariant)) lastResolveIssueByVideoId.delete(row.id);
        else if (resolveIssue) lastResolveIssueByVideoId.set(row.id, resolveIssue);
        else lastResolveIssueByVideoId.delete(row.id);
        cacheResolvedStreams(row, resolvedVariants);
      } catch (error) {
        if (!getStreamRows(row.id).some(isPlayableStreamRow)) throw error;
        log('WARN', `mv: resolve refresh failed, keeping cache (${error instanceof Error ? error.message : String(error)})`);
      }
      variants = getValidStreamRows(row.id);
    }
    applySelectedStreamSnapshot(row.id);
    return { video: mapRow(requireRow(row.id)), variants: getStreamRows(row.id).map(sanitizeVariant) };
  };

  const resolveStreams = async (videoId) => {
    const inFlight = resolveStreamsInFlight.get(videoId);
    if (inFlight) return inFlight;
    const task = resolveStreamsUnsafe(videoId).finally(() => {
      if (resolveStreamsInFlight.get(videoId) === task) resolveStreamsInFlight.delete(videoId);
    });
    resolveStreamsInFlight.set(videoId, task);
    return task;
  };

  const resolvePlayableCandidateForSelection = async (videoId) => {
    const resolved = await resolveStreams(videoId);
    if (resolved.video.playableInApp && resolved.video.mediaUrl) return resolved;
    try {
      const refreshed = await resolveStreamsUnsafe(videoId, { forceRefresh: true });
      return refreshed.video.playableInApp && refreshed.video.mediaUrl ? refreshed : resolved;
    } catch {
      return resolved;
    }
  };

  const selectFirstResolvedAutoCandidate = async (trackId, candidates, settings) => {
    const threshold = normalizeAutoApplyThreshold(settings.autoApplyThreshold);
    const enabledProviders = new Set(settings.enabledProviders);
    const rankedCandidates = [...candidates]
      .filter((candidate) => candidate.provider === 'local' || enabledProviders.has(candidate.provider))
      .filter((candidate) => candidate.score >= threshold)
      .sort(compareNetworkCandidates(settings));
    if (!rankedCandidates.length) return null;
    for (const candidate of rankedCandidates) {
      try {
        const resolved = await resolvePlayableCandidateForSelection(candidate.id);
        if (resolved.video.playableInApp && resolved.video.mediaUrl) return commitSelectedVideo(trackId, candidate.id, 'auto');
      } catch {}
    }
    return null;
  };

  const searchProviderWithFallback = async (providerId, track, settings, plan) => {
    const search = providerSearch[providerId];
    if (!search) return [];
    const primary = await search(track, settings, plan.primaryQuery);
    const threshold = normalizeAutoApplyThreshold(settings.autoApplyThreshold);
    const hasSafePrimaryCandidate = primary.some((candidate) => candidate.playableInApp && hasCurrentAutoDecision(candidate) && candidate.score >= threshold);
    if (providerId !== 'bilibili' || !plan.fallbackQuery || hasSafePrimaryCandidate) return primary;
    const fallback = await search(track, settings, plan.fallbackQuery);
    return mergeSearchCandidates(primary, fallback);
  };

  const compareNetworkCandidates = (settings) => (left, right) => {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) return scoreDelta;
    if (settings.preferHighestViewCount) {
      const viewDelta = (right.viewCount ?? -1) - (left.viewCount ?? -1);
      if (viewDelta !== 0) return viewDelta;
    }
    return 0;
  };

  const searchNetworkForTrack = async (track, query, allowAutoSelect) => {
    const settings = getSettings();
    if (settings.enabled === false) return [];
    const searchPlan = networkSearchPlan(track, settings, query);
    const enabled = new Set(settings.enabledProviders);
    const orderedProviders = settings.providerOrder.filter((provider) => enabled.has(provider));
    const providerResults = await Promise.all(orderedProviders.map(async (providerId) => {
      try {
        return await searchProviderWithFallback(providerId, track, settings, searchPlan);
      } catch (error) {
        log('WARN', `mv: ${providerId} search failed ${error instanceof Error ? error.message : String(error)}`);
        return [];
      }
    }));
    const candidates = providerResults.flat().sort(compareNetworkCandidates(settings));
    const upserted = candidates.map((candidate) => upsertNetworkCandidate(track, candidate));
    if (allowAutoSelect && settings.autoSearch && shouldAutoSelectNetworkCandidate(track.id)) {
      await selectFirstResolvedAutoCandidate(track.id, upserted, settings);
    }
    return upserted;
  };

  const pruneExpiredEphemeralStreams = () => {
    const now = Date.now();
    for (const [token, entry] of ephemeralStreams) {
      if (entry.expiresAtMs <= now) ephemeralStreams.delete(token);
    }
  };
  const registerEphemeralStream = (variant) => {
    pruneExpiredEphemeralStreams();
    const token = randomUUID();
    const providerExpiry = variant.expiresAt ? Date.parse(variant.expiresAt) : Number.NaN;
    const defaultExpiry = Date.now() + EPHEMERAL_TTL_MS;
    const expiresAtMs = Number.isFinite(providerExpiry) && providerExpiry > Date.now() ? Math.min(providerExpiry, defaultExpiry) : defaultExpiry;
    ephemeralStreams.set(token, { token, url: variant.url, headers: variant.headers ?? {}, mimeType: variant.mimeType, expiresAtMs });
    return token;
  };

  const temporaryVideoFromCandidate = (track, candidate, variant, token) => {
    const timestamp = nowIso();
    const provider = providerName(candidate.provider);
    return {
      id: token ? `temporary:${token}` : `temporary:${provider}:${sourceIdForCandidate(candidate)}`,
      trackId: track.id,
      provider,
      sourceType: 'stream',
      sourceId: sourceIdForCandidate(candidate),
      title: candidate.title,
      artist: candidate.artist,
      url: candidate.providerUrl ?? candidate.url,
      providerUrl: candidate.providerUrl ?? candidate.url,
      thumbnailUrl: candidate.thumbnailUrl,
      filePath: null,
      mediaUrl: token ? `echo-mv://ephemeral/${encodeURIComponent(token)}` : null,
      mimeType: variant?.mimeType ?? null,
      durationSeconds: candidate.durationSeconds,
      width: variant?.width ?? null,
      height: variant?.height ?? null,
      selectedQualityId: null,
      qualityLabel: variant?.label ?? null,
      fps: variant?.fps ?? null,
      offsetMs: 0,
      score: Number(candidate.score ?? 0),
      selected: true,
      selectionOrigin: 'auto',
      playableInApp: Boolean(token && variant?.url && variant.playableInApp && variant.protocol !== 'external'),
      temporary: true,
      rawProviderJson: { temporary: true, sourceCandidateId: candidate.id, reasons: candidate.reasons, viewCount: candidate.viewCount ?? null },
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  };

  const bindLocalVideo = (trackId, filePath) => {
    const snapshot = store.data.tracks[trackId]?.lastSnapshot;
    const track = snapshot
      ? snapshotToTrack(snapshot)
      : { id: trackId, title: candidateTitle(filePath), artist: null, albumArtist: null, path: filePath, duration: 0 };
    const normalizedPath = resolve(filePath);
    if (!existsSync(normalizedPath)) throw new Error(`MV file does not exist: ${normalizedPath}`);
    if (!isSupportedVideoExtension(normalizedPath)) throw new Error(`Unsupported MV video type: ${normalizedPath}`);
    const timestamp = nowIso();
    const sourceId = fileHashId(normalizedPath);
    const existing = findBySource(trackId, 'local', sourceId);
    const id = existing?.id ?? randomUUID();
    const row = existing || { id, trackId, provider: 'local', createdAt: timestamp };
    row.sourceType = 'manual';
    row.sourceId = sourceId;
    row.title = candidateTitle(normalizedPath);
    row.artist = track.artist || track.albumArtist || null;
    row.url = null;
    row.providerUrl = null;
    row.thumbnailUrl = null;
    row.internalFilePath = normalizedPath;
    row.mimeType = mimeTypeForVideoPath(normalizedPath);
    row.score = 1;
    row.selectedQualityId = null;
    row.updatedAt = timestamp;
    if (!existing) ensureTrack(trackId).videos.push(row);
    deselectTrack(trackId);
    row.selected = true;
    row.selectionOrigin = 'manual';
    store.save();
    return mapRow(row);
  };

  const bindUrl = (trackId, url) => {
    const custom = customMvFromUrl(url);
    const snapshot = store.data.tracks[trackId]?.lastSnapshot;
    const artist = snapshot?.artist || snapshot?.albumArtist || null;
    const timestamp = nowIso();
    const existing = findBySource(trackId, custom.provider, custom.sourceId);
    const id = existing?.id ?? randomUUID();
    const row = existing || { id, trackId, provider: custom.provider, createdAt: existing?.createdAt ?? timestamp };
    row.sourceType = 'manual';
    row.sourceId = custom.sourceId;
    row.title = custom.title;
    row.artist = artist;
    row.url = custom.providerUrl;
    row.providerUrl = custom.providerUrl;
    row.internalFilePath = null;
    row.selectedQualityId = existing?.selectedQualityId ?? 'auto';
    row.rawProviderJson = { reasons: ['Custom MV link'] };
    row.score = 1;
    row.updatedAt = timestamp;
    if (!existing) ensureTrack(trackId).videos.push(row);
    deselectTrack(trackId);
    row.selected = true;
    row.selectionOrigin = 'manual';
    store.save();
    return mapRow(row);
  };

  const getVideoFileForProtocol = (videoId) => {
    const row = getRow(videoId);
    if (!row || row.provider !== 'local' || !row.internalFilePath || !existsSync(row.internalFilePath)) return null;
    return {
      id: row.id,
      provider: 'local',
      filePath: row.internalFilePath,
      url: null,
      mimeType: row.mimeType ?? mimeTypeForVideoPath(row.internalFilePath),
      playableInApp: isBrowserPlayableVideo(row.internalFilePath),
    };
  };

  const toProtocolVariant = (videoId, variant) => {
    if (!isPlayableStreamRow(variant)) return null;
    return { videoId, variantId: variant.variantId, url: variant.url, headers: variant.headers || {}, mimeType: variant.mimeType ?? null };
  };

  const playableProtocolVariant = (videoId, variantId) => {
    const variant = getStreamRow(videoId, variantId);
    return isPlayableStreamRow(variant) && !isExpired(variant) ? variant : null;
  };
  const fallbackProtocolVariant = (videoId) => {
    const row = getRow(videoId);
    if (!row || row.provider === 'local') return null;
    const selected = chooseStreamVariant(row, getPlaybackStreamRows(videoId));
    return isPlayableStreamRow(selected) && !isExpired(selected) ? selected : null;
  };

  const getStreamVariantForProtocol = async (videoId, variantId) => {
    let row = getRow(videoId);
    let variant = playableProtocolVariant(videoId, variantId);
    if (!row || !variant) {
      store.reloadFromDisk();
      row = getRow(videoId);
      variant = playableProtocolVariant(videoId, variantId);
    }
    if (!row || row.provider === 'local') return null;
    if (variant) return toProtocolVariant(videoId, variant);
    const cached = fallbackProtocolVariant(videoId);
    if (cached) return toProtocolVariant(videoId, cached);
    try {
      await resolveStreamsUnsafe(videoId, { forceRefresh: true });
    } catch {}
    variant = playableProtocolVariant(videoId, variantId) || fallbackProtocolVariant(videoId);
    return toProtocolVariant(videoId, variant);
  };

  const refreshStreamVariantForProtocol = async (videoId, variantId) => {
    const row = getRow(videoId);
    if (!row || row.provider === 'local') return null;
    try {
      await resolveStreamsUnsafe(videoId, { forceRefresh: true });
    } catch {
      return null;
    }
    const refreshedVariant = getStreamRow(videoId, variantId);
    const selectedVariant = isPlayableStreamRow(refreshedVariant)
      ? refreshedVariant
      : chooseStreamVariant(requireRow(videoId), getPlaybackStreamRows(videoId));
    return toProtocolVariant(videoId, selectedVariant);
  };

  const getTemporaryStreamVariantForProtocol = (token) => {
    pruneExpiredEphemeralStreams();
    const entry = ephemeralStreams.get(token);
    if (!entry || entry.expiresAtMs <= Date.now()) {
      if (entry) ephemeralStreams.delete(token);
      return null;
    }
    return { videoId: 'ephemeral', variantId: entry.token, url: entry.url, headers: entry.headers, mimeType: entry.mimeType };
  };

  const fetchUpstream = async (url, init = {}) => doFetch(url, init);

  const api = {
    getSettings: () => getSettings(),
    setSettings: (payload) => setSettingsFromPatch(payloadObj(payload).patch),
    getSelected: (payload) => getSelectedVideo(requireText(payloadObj(payload).trackId, 'trackId')),
    getCandidates: (payload) => getVideoCandidates(requireText(payloadObj(payload).trackId, 'trackId')),
    findLocalCandidates: (payload) => {
      const snapshot = normalizeSnapshot(payloadObj(payload).snapshot ?? payload);
      rememberSnapshot(snapshot);
      if (!snapshot.path) return [];
      if (snapshot.mediaType === 'remote') return [];
      const track = snapshotToTrack(snapshot);
      return searchLocalCandidates(track).map((candidate) => upsertLocalCandidate(track, candidate));
    },
    searchNetworkCandidates: async (payload) => {
      const body = payloadObj(payload);
      const snapshot = normalizeSnapshot(body.snapshot ?? body);
      rememberSnapshot(snapshot);
      const query = optionalText(body.query) ?? snapshot.query;
      return searchNetworkForTrack(snapshotToTrack(snapshot), query, body.autoSelect !== false);
    },
    searchNetworkCandidatesForSnapshot: async (payload) => {
      const snapshot = normalizeSnapshot(payloadObj(payload).snapshot ?? payload);
      rememberSnapshot(snapshot);
      return searchNetworkForTrack(snapshotToTrack(snapshot), snapshot.query, snapshot.autoSelect !== false);
    },
    getTemporaryPlayableForSnapshot: async (payload) => {
      const snapshot = normalizeSnapshot(payloadObj(payload).snapshot ?? payload);
      const settings = getSettings();
      if (settings.enabled === false || settings.autoSearch === false) return null;
      const track = snapshotToTrack(snapshot);
      const searchPlan = networkSearchPlan(track, settings, snapshot.query);
      const enabled = new Set(settings.enabledProviders);
      const orderedProviders = settings.providerOrder.filter((provider) => enabled.has(provider));
      const providerResults = await Promise.all(orderedProviders.map(async (providerId) => {
        try {
          return await searchProviderWithFallback(providerId, track, settings, searchPlan);
        } catch {
          return [];
        }
      }));
      const candidates = providerResults.flat().sort(compareNetworkCandidates(settings));
      const rankedCandidates = [...candidates]
        .filter((candidate) => candidate.score >= normalizeAutoApplyThreshold(settings.autoApplyThreshold))
        .sort(compareNetworkCandidates(settings));
      if (!rankedCandidates.length) return null;
      for (const candidate of rankedCandidates) {
        const providerId = providerName(candidate.provider);
        const resolve = providerResolve[providerId];
        if (!resolve) continue;
        try {
          const temporaryVideo = temporaryVideoFromCandidate(track, candidate, null, null);
          const variants = await resolve(temporaryVideo, settings);
          const selected = chooseResolvedStreamVariant(providerId, variants, settings);
          if (!selected?.url || selected.protocol === 'external' || !selected.playableInApp) continue;
          const token = registerEphemeralStream(selected);
          return temporaryVideoFromCandidate(track, candidate, selected, token);
        } catch {}
      }
      return null;
    },
    resolveStreams: async (payload) => resolveStreams(requireText(payloadObj(payload).videoId, 'videoId')),
    setQuality: async (payload) => {
      const body = payloadObj(payload);
      const videoId = requireText(body.videoId, 'videoId');
      const qualityId = requireText(body.qualityId, 'qualityId');
      const row = requireRow(videoId);
      if (row.provider === 'local') return mapRow(row);
      if (qualityId !== 'auto' && !qualityId.trim()) throw new Error('qualityId must be auto or a variant id');
      await resolveStreams(videoId);
      const variants = getValidStreamRows(videoId);
      if (qualityId !== 'auto' && !variants.some((variant) => variant.variantId === qualityId)) throw new Error(`Unknown MV quality ${qualityId}`);
      row.selectedQualityId = qualityId;
      row.updatedAt = nowIso();
      applySelectedStreamSnapshot(videoId);
      return mapRow(requireRow(videoId));
    },
    setOffset: (payload) => {
      const body = payloadObj(payload);
      const trackId = requireText(body.trackId, 'trackId');
      const offsetMs = clampOffsetMs(requireOffset(body.offsetMs));
      const selected = getSelectedVideo(trackId);
      if (!selected) return null;
      const row = requireRow(selected.id);
      row.offsetMs = offsetMs;
      row.updatedAt = nowIso();
      store.save();
      return getSelectedVideo(trackId);
    },
    chooseLocalVideo: async (payload) => {
      const trackId = requireText(payloadObj(payload).trackId, 'trackId');
      if (!dialog?.showOpenDialog) return null;
      const result = await dialog.showOpenDialog({
        title: 'Choose MV video',
        properties: ['openFile'],
        filters: [{ name: 'Video files', extensions: ['mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi'] }],
      });
      if (result.canceled || !result.filePaths?.[0]) return null;
      return bindLocalVideo(trackId, result.filePaths[0]);
    },
    bindLocalVideo: (payload) => {
      const body = payloadObj(payload);
      return bindLocalVideo(requireText(body.trackId, 'trackId'), requireText(body.filePath, 'filePath'));
    },
    bindUrl: (payload) => {
      const body = payloadObj(payload);
      return bindUrl(requireText(body.trackId, 'trackId'), requireText(body.url, 'url'));
    },
    selectVideo: async (payload) => {
      const body = payloadObj(payload);
      const trackId = requireText(body.trackId, 'trackId');
      const videoId = requireText(body.videoId, 'videoId');
      const row = getRow(videoId);
      if (!row || row.trackId !== trackId) throw new Error(`Unknown MV candidate ${videoId}`);
      const provider = providerName(row.provider);
      if (provider !== 'local' && row.sourceType === 'search_candidate') {
        const resolved = await resolvePlayableCandidateForSelection(videoId);
        if (!resolved.video.playableInApp || !resolved.video.mediaUrl) throw new Error(IN_APP_UNAVAILABLE);
      }
      return commitSelectedVideo(trackId, videoId, 'manual');
    },
    clearSelected: (payload) => {
      const trackId = requireText(payloadObj(payload).trackId, 'trackId');
      deselectTrack(trackId);
      store.save();
      return null;
    },
    openExternal: async (payload) => {
      const videoId = requireText(payloadObj(payload).videoId, 'videoId');
      const row = requireRow(videoId);
      if (!shell) throw new Error('MV video has no external target');
      if (row.provider === 'local' && row.internalFilePath) {
        const result = await shell.openPath(row.internalFilePath);
        if (result) throw new Error(result);
        return null;
      }
      const externalUrl = row.providerUrl ?? row.url;
      if (externalUrl) {
        await shell.openExternal(externalUrl);
        return null;
      }
      throw new Error('MV video has no external target');
    },
    status: () => ({
      ok: true,
      version: MOD_VERSION,
      protocolsRegistered,
      dataDir,
      lastNetworkStatus,
      bilibiliCookieSource: getBilibiliCookie() ? lastCookieSource : 'none',
    }),
    testWbi: async () => {
      const sampleKey = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ12';
      const synthetic = mixinWbiKey(sampleKey);
      const syntheticOk = synthetic.length === 32 && mixinWbiKey(sampleKey) === synthetic;
      let signed = null;
      let error = null;
      try {
        const mixinKey = await bilibiliWbiMixinKey({ Referer: 'https://www.bilibili.com/', 'Accept-Language': BILI_ACCEPT_LANGUAGE });
        if (!mixinKey) {
          error = 'nav_wbi_key_missing';
        } else {
          const url = new URL('https://api.bilibili.com/x/web-interface/wbi/search/type');
          url.searchParams.set('search_type', 'video');
          url.searchParams.set('keyword', 'test');
          appendWbiSignature(url, mixinKey);
          signed = { mixinKeyLength: mixinKey.length, w_rid: url.searchParams.get('w_rid'), wts: url.searchParams.get('wts') };
        }
      } catch (caught) {
        error = caught instanceof Error ? caught.message : String(caught);
      }
      const navOk = Boolean(signed && /^[a-f0-9]{32}$/i.test(signed.w_rid) && signed.mixinKeyLength === 32);
      return { ok: syntheticOk && navOk, syntheticOk, syntheticSample: synthetic, signed, error, lastNetworkStatus, tsPairsEven: TS_PAIRS.length % 2 === 0 };
    },
    getVideoFileForProtocol,
    getStreamVariantForProtocol,
    refreshStreamVariantForProtocol,
    getTemporaryStreamVariantForProtocol,
    fetchUpstream,
    setProtocolsRegistered: (value) => {
      protocolsRegistered = Boolean(value);
    },
    dispose: () => {
      ephemeralStreams.clear();
      resolveStreamsInFlight.clear();
      store.dispose();
    },
    flush: () => store.flush(),
    refreshBilibiliCookie: async () => {
      try { await sessionBilibiliCookie.refresh?.(); } catch {}
      return getBilibiliCookie() ? lastCookieSource : 'none';
    },
    dataDir,
    version: MOD_VERSION,
  };
  return api;
}

const streamBody = (filePath, range) => {
  const nodeStream = createReadStream(filePath, range ?? undefined);
  return typeof Readable.toWeb === 'function' ? Readable.toWeb(nodeStream) : nodeStream;
};

const passthroughHeaders = (response, fallbackMimeType) => {
  const headers = {
    'Cache-Control': 'no-store',
  };
  const upstreamContentType = headerGet(response.headers, 'content-type');
  const contentType = !upstreamContentType || String(upstreamContentType).toLowerCase().startsWith('application/octet-stream')
    ? fallbackMimeType ?? upstreamContentType
    : upstreamContentType;
  const contentLength = headerGet(response.headers, 'content-length');
  const contentRange = headerGet(response.headers, 'content-range');
  const acceptRanges = headerGet(response.headers, 'accept-ranges');
  if (contentType) headers['Content-Type'] = contentType;
  if (contentLength) headers['Content-Length'] = contentLength;
  if (contentRange) headers['Content-Range'] = contentRange;
  if (acceptRanges) headers['Accept-Ranges'] = acceptRanges;
  return headers;
};

const fetchUpstreamVariant = async (engine, variant, method, rangeHeader) => {
  const headers = { ...(variant.headers || {}) };
  if (rangeHeader) headers.Range = rangeHeader;
  let upstream;
  try {
    upstream = await engine.fetchUpstream(variant.url, {
      method: method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow',
    });
  } catch {
    return null;
  }
  if (upstream.status === 416) {
    return { status: 416, headers: passthroughHeaders(upstream, variant.mimeType), body: null };
  }
  if (!upstream.ok && upstream.status !== 206) return null;
  return {
    status: upstream.status,
    headers: passthroughHeaders(upstream, variant.mimeType),
    body: method === 'HEAD' ? null : upstream.body,
  };
};

const handleEchoVideo = async (engine, urlString, method, rangeHeader) => {
  try {
    const url = new URL(urlString);
    const videoId = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    if (url.hostname !== 'mv' || !videoId || videoId.includes('/') || videoId.includes('\\')) return { status: 404, headers: {}, body: null };
    const video = engine.getVideoFileForProtocol(videoId);
    if (!video?.filePath || !video.playableInApp) return { status: 404, headers: {}, body: null };
    const fileStat = await stat(video.filePath);
    if (!fileStat.isFile()) return { status: 404, headers: {}, body: null };
    const range = parseRange(rangeHeader, fileStat.size);
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type': video.mimeType ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    };
    if (rangeHeader && !range) {
      headers['Content-Length'] = '0';
      headers['Content-Range'] = `bytes */${fileStat.size}`;
      return { status: 416, headers, body: null };
    }
    if (range) {
      headers['Content-Length'] = String(range.end - range.start + 1);
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${fileStat.size}`;
      return { status: 206, headers, body: method === 'HEAD' ? null : streamBody(video.filePath, range) };
    }
    headers['Content-Length'] = String(fileStat.size);
    return { status: 200, headers, body: method === 'HEAD' ? null : streamBody(video.filePath, null) };
  } catch {
    return { status: 404, headers: {}, body: null };
  }
};

const handleEchoMv = async (engine, urlString, method, rangeHeader) => {
  try {
    const url = new URL(urlString);
    const [videoIdPart, variantIdPart, extraPart] = url.pathname.replace(/^\/+/, '').split('/');
    const videoId = decodeURIComponent(videoIdPart ?? '');
    const variantId = decodeURIComponent(variantIdPart ?? '');
    if (url.hostname === 'ephemeral') {
      const token = videoId;
      if (!token || variantIdPart || token.includes('/') || token.includes('\\')) return { status: 404, headers: {}, body: null };
      const variant = engine.getTemporaryStreamVariantForProtocol(token);
      if (!variant) return { status: 404, headers: {}, body: null };
      return (await fetchUpstreamVariant(engine, variant, method, rangeHeader)) ?? { status: 502, headers: { 'Cache-Control': 'no-store' }, body: null };
    }
    if (
      url.hostname !== 'stream' ||
      !videoId ||
      !variantId ||
      extraPart ||
      videoId.includes('/') ||
      videoId.includes('\\') ||
      variantId.includes('/') ||
      variantId.includes('\\')
    ) {
      if (typeof globalThis.__echoMvProtoLog === 'function') globalThis.__echoMvProtoLog(`echo-mv 404 bad-url host=${url.hostname} videoId=${videoId} variantId=${variantId} extra=${extraPart ?? ''}`);
      return { status: 404, headers: {}, body: null };
    }
    const variant = await engine.getStreamVariantForProtocol(videoId, variantId)
      ?? await engine.refreshStreamVariantForProtocol(videoId, variantId);
    if (!variant) {
      if (typeof globalThis.__echoMvProtoLog === 'function') {
        globalThis.__echoMvProtoLog(`echo-mv 404 no-variant videoId=${videoId} variantId=${variantId}`);
      }
      return { status: 404, headers: {}, body: null };
    }
    const response = await fetchUpstreamVariant(engine, variant, method, rangeHeader);
    if (response) return response;
    const refreshedVariant = await engine.refreshStreamVariantForProtocol(videoId, variantId);
    if (!refreshedVariant) return { status: 502, headers: { 'Cache-Control': 'no-store' }, body: null };
    return (await fetchUpstreamVariant(engine, refreshedVariant, method, rangeHeader)) ?? { status: 502, headers: { 'Cache-Control': 'no-store' }, body: null };
  } catch (error) {
    if (typeof globalThis.__echoMvProtoLog === 'function') globalThis.__echoMvProtoLog(`echo-mv 404 throw ${error instanceof Error ? error.message : String(error)}`);
    return { status: 404, headers: {}, body: null };
  }
};

const resultToResponse = (result) => new Response(result.body ?? null, { status: result.status, headers: result.headers });

const registerProtocolScheme = (protocolApi, scheme, handler) => {
  const already = typeof protocolApi.isProtocolHandled === 'function' ? protocolApi.isProtocolHandled(scheme) : false;
  if (already) {
    try {
      if (typeof protocolApi.unhandle === 'function') protocolApi.unhandle(scheme);
    } catch {}
  }
  if (typeof protocolApi.handle === 'function') {
    protocolApi.handle(scheme, async (request) => {
      const result = await handler(request.url, request.method, headerGet(request.headers, 'range'));
      return resultToResponse(result);
    });
    return () => {
      try { protocolApi.unhandle(scheme); } catch {}
    };
  }
  if (typeof protocolApi.registerStreamProtocol === 'function') {
    protocolApi.registerStreamProtocol(scheme, (request, callback) => {
      Promise.resolve(handler(request.url, request.method, headerGet(request.headers, 'range')))
        .then((result) => {
          callback({
            statusCode: result.status,
            headers: result.headers,
            data: result.body || '',
          });
        })
        .catch(() => callback({ statusCode: 404, data: '' }));
    });
    return () => {
      try { protocolApi.unregisterProtocol(scheme); } catch {}
    };
  }
  throw new Error('protocol_api_unavailable');
};

const collectProtocolApis = (host) => {
  const electron = host.electron || {};
  const apis = new Set();
  const add = (protocolApi) => {
    if (protocolApi && (typeof protocolApi.handle === 'function' || typeof protocolApi.registerStreamProtocol === 'function')) {
      apis.add(protocolApi);
    }
  };
  add(host.session?.defaultSession?.protocol);
  add(host.session?.protocol);
  add(electron.session?.defaultSession?.protocol);
  add(electron.protocol);
  try {
    for (const window of electron.BrowserWindow?.getAllWindows?.() || []) {
      add(window.webContents?.session?.protocol);
    }
  } catch {}
  return [...apis];
};

const registerProtocols = async (engine, host) => {
  const app = host.app;
  if (app && typeof app.whenReady === 'function' && !app.isReady()) await app.whenReady();
  const protocolApis = collectProtocolApis(host);
  if (!protocolApis.length) {
    host.log('WARN', 'mv: protocol API unavailable, streaming handlers not registered');
    engine.setProtocolsRegistered(false);
    return () => {};
  }
  const unbind = [];
  try {
    for (const protocolApi of protocolApis) {
      unbind.push(registerProtocolScheme(protocolApi, 'echo-video', (url, method, range) => handleEchoVideo(engine, url, method, range)));
      unbind.push(registerProtocolScheme(protocolApi, 'echo-mv', (url, method, range) => handleEchoMv(engine, url, method, range)));
    }
    engine.setProtocolsRegistered(true);
    host.log('INFO', `mv: echo-video and echo-mv protocol handlers registered sessions=${protocolApis.length}`);
  } catch (error) {
    engine.setProtocolsRegistered(false);
    host.log('ERROR', `mv: protocol register failed ${error instanceof Error ? error.message : String(error)}`);
  }
  return () => {
    while (unbind.length) {
      try { unbind.pop()(); } catch {}
    }
    engine.setProtocolsRegistered(false);
  };
};

const RPC_METHODS = {
  'mv.getSettings': 'getSettings',
  'mv.setSettings': 'setSettings',
  'mv.getSelected': 'getSelected',
  'mv.getCandidates': 'getCandidates',
  'mv.findLocalCandidates': 'findLocalCandidates',
  'mv.searchNetworkCandidates': 'searchNetworkCandidates',
  'mv.searchNetworkCandidatesForSnapshot': 'searchNetworkCandidatesForSnapshot',
  'mv.getTemporaryPlayableForSnapshot': 'getTemporaryPlayableForSnapshot',
  'mv.resolveStreams': 'resolveStreams',
  'mv.setQuality': 'setQuality',
  'mv.setOffset': 'setOffset',
  'mv.chooseLocalVideo': 'chooseLocalVideo',
  'mv.bindLocalVideo': 'bindLocalVideo',
  'mv.bindUrl': 'bindUrl',
  'mv.selectVideo': 'selectVideo',
  'mv.clearSelected': 'clearSelected',
  'mv.openExternal': 'openExternal',
  'mv.status': 'status',
};

const SHARED_ENGINE_KEY = '__echoMvSharedEngine';

async function activate(host) {
  const app = host.app;
  const userData = (() => {
    try {
      return app?.getPath?.('userData');
    } catch {
      return null;
    }
  })();
  const dataDir = join(userData || require('node:os').homedir(), 'echo-mv-mod');
  let engine = globalThis[SHARED_ENGINE_KEY];
  if (!engine || engine.dataDir !== dataDir || engine.version !== MOD_VERSION) {
    try { engine?.dispose?.(); } catch {}
    engine = createEngine({
      fetchImpl: globalThis.fetch,
      // Prefer Node's fetch (undici): it hits Bilibili directly and is not
      // affected by the app session's cookies / risk-control, which makes
      // electron net.fetch return empty search results in practice.
      netFetch: typeof globalThis.fetch === 'function'
        ? globalThis.fetch
        : (host.electron?.net?.fetch ? host.electron.net.fetch.bind(host.electron.net) : undefined),
      dataDir,
      echoUserData: userData,
      electron: host.electron || null,
      safeStorage: () => host.electron?.safeStorage || null,
      dialog: host.electron?.dialog || null,
      shell: host.electron?.shell || null,
      config: () => host.config || {},
      log: (level, message) => {
        try { host.log(level, message); } catch {}
      },
    });
    globalThis[SHARED_ENGINE_KEY] = engine;
  }
  globalThis.__echoMvProtoLog = (message) => {
    try { host.log('INFO', `mv-proto: ${message}`); } catch {}
  };
  const unhandleProtocols = await registerProtocols(engine, host);
  const unbind = [];
  for (const [method, name] of Object.entries(RPC_METHODS)) {
    unbind.push(host.handle(method, async (payload) => engine[name](payload)));
  }
  const cookieSource = await engine.refreshBilibiliCookie();
  host.log('INFO', `mv: backend ${MOD_VERSION} ready dataDir=${dataDir} biliCookie=${cookieSource}`);
  return () => {
    for (const disposeHandler of unbind) {
      try { disposeHandler(); } catch {}
    }
    try { unhandleProtocols(); } catch {}
    try { engine.flush(); } catch {}
    try { delete globalThis.__echoMvProtoLog; } catch {}
  };
}

module.exports = { activate, createEngine };
module.exports.activate = activate;
module.exports.createEngine = createEngine;
