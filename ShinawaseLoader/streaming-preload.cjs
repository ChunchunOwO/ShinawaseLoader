'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const channels = {
  StreamingSearch: 'streaming:search',
  StreamingGetTrack: 'streaming:getTrack',
  StreamingGetTrackSourceInfo: 'streaming:getTrackSourceInfo',
  StreamingGetAlbum: 'streaming:getAlbum',
  StreamingGetArtist: 'streaming:getArtist',
  StreamingResolvePlayback: 'streaming:resolvePlayback',
  StreamingAnalyzeBpm: 'streaming:analyzeBpm',
  StreamingGetLyrics: 'streaming:getLyrics',
  StreamingGetMv: 'streaming:getMv',
  StreamingGetProviders: 'streaming:getProviders',
  StreamingListAccountPlaylists: 'streaming:listAccountPlaylists',
  StreamingImportPlaylistFromUrl: 'streaming:importPlaylistFromUrl',
  StreamingImportFavoritesFromUrl: 'streaming:importFavoritesFromUrl',
  StreamingExportFavorites: 'streaming:exportFavorites',
  StreamingSyncLikedSongs: 'streaming:syncLikedSongs',
  StreamingSetTrackLiked: 'streaming:setTrackLiked',
  StreamingGetFavorites: 'streaming:getFavorites',
  StreamingSetFavorite: 'streaming:setFavorite',
  StreamingRenameFavoriteCollection: 'streaming:renameFavoriteCollection',
  StreamingSyncFavoriteCollection: 'streaming:syncFavoriteCollection',
  StreamingDeleteFavoriteCollection: 'streaming:deleteFavoriteCollection',
  StreamingRefreshNeteaseDailyRecommend: 'streaming:refreshNeteaseDailyRecommend',
  AccountGetStatuses: 'account:get-statuses',
  AccountGetStatus: 'account:get-status',
  AccountSaveCookie: 'account:save-cookie',
  AccountStartLogin: 'account:start-login',
  AccountStartNeteaseQrLogin: 'account:start-netease-qr-login',
  AccountPollNeteaseQrLogin: 'account:poll-netease-qr-login',
  AccountClear: 'account:clear',
  AccountCheck: 'account:check',
  AccountCheckAll: 'account:check-all',
  AccountSetBrowser: 'account:set-browser',
  AccountSetYouTubeBrowser: 'account:set-youtube-browser',
  AccountStatusesChanged: 'account:statuses-changed',
  DownloadsGetJobs: 'downloads:get-jobs',
  DownloadsCreateUrlJob: 'downloads:create-url-job',
  DownloadsCancelJob: 'downloads:cancel-job',
  DownloadsClearJobs: 'downloads:clear-jobs',
  DownloadsClearCompleted: 'downloads:clear-completed',
  DownloadsGetSettings: 'downloads:get-settings',
  DownloadsSetSettings: 'downloads:set-settings',
  DownloadsChooseOutputDirectory: 'downloads:choose-output-directory',
  DownloadsSearch: 'downloads:search',
  DownloadsGetOsuAccountProfile: 'downloads:get-osu-account-profile',
  DownloadsGetOsuAccountCollection: 'downloads:get-osu-account-collection',
  DownloadsCheckTools: 'downloads:check-tools',
  DownloadsJobsUpdated: 'downloads:jobs-updated',
  QobuzAuthLogin: 'qobuz:auth:login',
  QobuzAuthLogout: 'qobuz:auth:logout',
  QobuzAuthGetStatus: 'qobuz:auth:get-status',
  QobuzAuthStatusChanged: 'qobuz:auth:status-changed',
};

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
const listen = (channel, handler) => {
  const listener = (_event, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.off(channel, listener);
};

const api = {
  streaming: {
    search: (request) => invoke(channels.StreamingSearch, request),
    getTrack: (request) => invoke(channels.StreamingGetTrack, request),
    getTrackSourceInfo: (request) => invoke(channels.StreamingGetTrackSourceInfo, request),
    getAlbum: (request) => invoke(channels.StreamingGetAlbum, request),
    getArtist: (request) => invoke(channels.StreamingGetArtist, request),
    resolvePlayback: (request) => invoke(channels.StreamingResolvePlayback, request),
    analyzeBpm: (request) => invoke(channels.StreamingAnalyzeBpm, request),
    getLyrics: (request) => invoke(channels.StreamingGetLyrics, request),
    getMv: (request) => invoke(channels.StreamingGetMv, request),
    getProviders: () => invoke(channels.StreamingGetProviders),
    listAccountPlaylists: (provider) => invoke(channels.StreamingListAccountPlaylists, provider),
    importPlaylistFromUrl: (url) => invoke(channels.StreamingImportPlaylistFromUrl, url),
    importFavoritesFromUrl: (url) => invoke(channels.StreamingImportFavoritesFromUrl, url),
    exportFavorites: () => invoke(channels.StreamingExportFavorites),
    syncLikedSongs: (provider) => invoke(channels.StreamingSyncLikedSongs, provider),
    setTrackLiked: (request) => invoke(channels.StreamingSetTrackLiked, request),
    getFavorites: () => invoke(channels.StreamingGetFavorites),
    setFavorite: (request) => invoke(channels.StreamingSetFavorite, request),
    renameFavoriteCollection: (request) => invoke(channels.StreamingRenameFavoriteCollection, request),
    syncFavoriteCollection: (request) => invoke(channels.StreamingSyncFavoriteCollection, request),
    deleteFavoriteCollection: (request) => invoke(channels.StreamingDeleteFavoriteCollection, request),
    refreshNeteaseDailyRecommend: () => invoke(channels.StreamingRefreshNeteaseDailyRecommend),
  },
  accounts: {
    getStatuses: () => invoke(channels.AccountGetStatuses),
    getStatus: (provider) => invoke(channels.AccountGetStatus, provider),
    saveCookie: (provider, cookie) => invoke(channels.AccountSaveCookie, provider, cookie),
    startLogin: (provider) => invoke(channels.AccountStartLogin, provider),
    startNeteaseQrLogin: () => invoke(channels.AccountStartNeteaseQrLogin),
    pollNeteaseQrLogin: (key) => invoke(channels.AccountPollNeteaseQrLogin, key),
    clear: (provider) => invoke(channels.AccountClear, provider),
    check: (provider) => invoke(channels.AccountCheck, provider),
    checkAll: () => invoke(channels.AccountCheckAll),
    setBrowser: (provider, browser) => invoke(channels.AccountSetBrowser, provider, browser),
    setYouTubeBrowser: (browser) => invoke(channels.AccountSetYouTubeBrowser, browser),
    onStatusesChanged: (handler) => listen(channels.AccountStatusesChanged, (statuses) => handler(Array.isArray(statuses) ? statuses : [])),
  },
  downloads: {
    getJobs: () => invoke(channels.DownloadsGetJobs),
    createUrlJob: (url, options) => invoke(channels.DownloadsCreateUrlJob, url, options),
    cancelJob: (jobId) => invoke(channels.DownloadsCancelJob, jobId),
    clearJobs: (provider) => invoke(channels.DownloadsClearJobs, provider),
    clearCompleted: (provider) => invoke(channels.DownloadsClearCompleted, provider),
    getSettings: () => invoke(channels.DownloadsGetSettings),
    setSettings: (patch) => invoke(channels.DownloadsSetSettings, patch),
    chooseOutputDirectory: (target) => invoke(channels.DownloadsChooseOutputDirectory, target),
    search: (request) => invoke(channels.DownloadsSearch, request),
    getOsuAccountProfile: () => invoke(channels.DownloadsGetOsuAccountProfile),
    getOsuAccountCollection: (request) => invoke(channels.DownloadsGetOsuAccountCollection, request),
    checkTools: () => invoke(channels.DownloadsCheckTools),
    onJobsUpdated: (handler) => listen(channels.DownloadsJobsUpdated, (jobs) => handler(Array.isArray(jobs) ? jobs : [])),
  },
  qobuz: {
    login: (credentials) => invoke(channels.QobuzAuthLogin, credentials),
    logout: () => invoke(channels.QobuzAuthLogout),
    getStatus: () => invoke(channels.QobuzAuthGetStatus),
    onStatusChanged: (handler) => listen(channels.QobuzAuthStatusChanged, handler),
  },
};

try {
  contextBridge.exposeInMainWorld('__echoShinawaseStreaming', api);
} catch {
  globalThis.__echoShinawaseStreaming = api;
}
