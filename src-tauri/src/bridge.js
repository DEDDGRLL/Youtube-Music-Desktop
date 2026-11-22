// Injected into the hidden music.youtube.com window.
// Exposes window.__ytm (controls) and streams player state to the app every 250 ms.
(() => {
  if (window.__ytm || location.hostname !== 'music.youtube.com') return;

  // YouTube Music registers a "Leave site?" prompt while a song plays. In this app that prompt
  // is just noise, so swallow it before the page's own handlers can see it.
  window.addEventListener('beforeunload', (e) => e.stopImmediatePropagation(), true);
  try {
    Object.defineProperty(window, 'onbeforeunload', { get: () => null, set: () => {}, configurable: true });
  } catch (_) {}
  const nativeAdd = window.addEventListener.bind(window);
  window.addEventListener = (type, ...rest) => (type === 'beforeunload' ? undefined : nativeAdd(type, ...rest));

  const mp = () => document.getElementById('movie_player');
  const click = (sel) => document.querySelector(sel)?.click();

  // YouTube Music resets the volume to its own slider value whenever a new song loads,
  // so remember what the app asked for and re-apply it.
  let wantVolume = null;
  try {
    const saved = localStorage.getItem('__ytm_vol');
    if (saved !== null) wantVolume = Number(saved);
  } catch (_) {}
  const applyVolume = () => {
    if (wantVolume === null) return;
    const slider = document.querySelector('#volume-slider');
    if (slider && Math.round(Number(slider.value)) !== wantVolume) slider.value = wantVolume;
    const p = mp();
    if (p && typeof p.getVolume === 'function' && Math.round(p.getVolume()) !== wantVolume) p.setVolume(wantVolume);
  };

  // Shuffle and repeat reset whenever a song is loaded by address, so remember the user's choice
  // and re-apply it once the player is ready. `actual` is what the page is currently set to.
  const MODES = ['NONE', 'ALL', 'ONE'];
  const stored = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch (_) { return d; } };
  const keep = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };
  const wantPref = {
    shuffle: stored('__ytm_shuffle', '0') === '1',
    repeat: MODES.includes(stored('__ytm_repeat', 'NONE')) ? stored('__ytm_repeat', 'NONE') : 'NONE',
  };
  const actual = { shuffle: false, repeat: 'NONE' };
  let repeatRead = false;
  let readySince = 0;
  let lastPrefClick = 0;
  const barBtn = (name) => document.querySelector('.' + name + '.ytmusic-player-bar') || document.querySelector('ytmusic-player-bar .' + name);
  const repeatFromPage = () => {
    const bar = document.querySelector('ytmusic-player-bar');
    const v = String(bar?.getAttribute('repeat-mode_') ?? bar?.repeatMode_ ?? '').toUpperCase();
    // Check "none" first: the word NONE contains the letters ONE.
    return v.includes('NONE') || v.includes('OFF') ? 'NONE' : v.includes('ONE') ? 'ONE' : v.includes('ALL') ? 'ALL' : null;
  };
  const syncPrefs = () => {
    const p = mp();
    const hasVideo = !!(p && typeof p.getVideoData === 'function' && p.getVideoData().video_id);
    const shuffleBtn = barBtn('shuffle');
    const repeatBtn = barBtn('repeat');
    if (!hasVideo || !shuffleBtn || !repeatBtn) { readySince = 0; return; }
    if (!readySince) { readySince = Date.now(); return; }
    if (Date.now() - readySince < 1500) return; // let the player finish setting itself up
    if (!repeatRead) { const r = repeatFromPage(); if (r) actual.repeat = r; repeatRead = true; }
    if (Date.now() - lastPrefClick < 500) return; // one click at a time
    if (actual.shuffle !== wantPref.shuffle) {
      shuffleBtn.click(); actual.shuffle = wantPref.shuffle; lastPrefClick = Date.now();
    } else if (actual.repeat !== wantPref.repeat) {
      repeatBtn.click(); actual.repeat = MODES[(MODES.indexOf(actual.repeat) + 1) % 3]; lastPrefClick = Date.now();
    }
  };

  // --- what the user wants (playing or paused), ads, and recovering when playback stalls ---
  let wantPlaying = stored('__ytm_playing', '0') === '1';
  const intent = (on) => { wantPlaying = on; keep('__ytm_playing', on ? '1' : '0'); };
  const adShowing = () => {
    const p = mp();
    return !!p && (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting'));
  };
  const diag = { adSeen: 0, recoveries: 0, lastLoad: null, invokeOk: 0, invokeFail: 0, lastError: '' };
  let adWasShowing = false;
  let adEndedAt = 0;
  let stallSince = 0;
  let lastKick = 0;
  let kicks = 0;
  let lastReload = 0;
  let lastGood = null;

  // After an ad (or any stall) the player can be left paused although the user never paused it.
  // Nudge it to play again, and as a last resort reload the current song.
  const watchPlayback = () => {
    const p = mp();
    if (!p || typeof p.getPlayerState !== 'function') return;
    if (adShowing()) {
      if (!adWasShowing) diag.adSeen++;
      adWasShowing = true;
      stallSince = 0;
      return;
    }
    if (adWasShowing) { adWasShowing = false; adEndedAt = Date.now(); kicks = 0; }
    const state = p.getPlayerState(); // 1 playing, 2 paused, 3 buffering, 0 ended, 5 cued, -1 unstarted
    const hasVideo = !!(p.getVideoData && p.getVideoData().video_id);
    if (!wantPlaying || !hasVideo || state === 1 || state === 3 || state === 0) { stallSince = 0; if (state === 1) kicks = 0; return; }
    const now = Date.now();
    if (!stallSince) { stallSince = now; return; }
    const stalledFor = now - stallSince;
    const afterAd = now - adEndedAt < 60000;
    if (stalledFor > (afterAd ? 1500 : 4000) && now - lastKick > 2500) {
      lastKick = now; kicks++; diag.recoveries++;
      p.playVideo();
    }
    if (kicks >= 4 && stalledFor > 12000 && now - lastReload > 300000) {
      lastReload = now;
      location.reload();
    }
  };

  // --- switching songs without reloading the page ---
  // YouTube Music's own queue can start any song in it. Used only when the song is in the list that is
  // already playing; anything else (or any failure) falls back to loading the song's address.
  const strikes = () => Number(stored('__ytm_queue_strikes', '0')) || 0;
  const queueItems = () => [...document.querySelectorAll('ytmusic-player-queue-item')];
  const itemVideoId = (el) => {
    const d = el.data || (el.__data && (el.__data.data || el.__data));
    const direct = d && (d.videoId || (d.playNavigationEndpoint && d.playNavigationEndpoint.watchEndpoint && d.playNavigationEndpoint.watchEndpoint.videoId));
    if (direct) return direct;
    const btn = el.querySelector('ytmusic-play-button-renderer');
    const fromBtn = btn && btn.data && btn.data.playNavigationEndpoint && btn.data.playNavigationEndpoint.watchEndpoint && btn.data.playNavigationEndpoint.watchEndpoint.videoId;
    if (fromBtn) return fromBtn;
    const a = el.querySelector('a[href*="watch?v="]');
    if (a) { try { return new URL(a.href, location.href).searchParams.get('v'); } catch (_) {} }
    return null;
  };
  const playQueueItem = (el) => {
    const r = el.querySelector('ytmusic-play-button-renderer');
    const target = (r && (r.querySelector('#play-button') || r.querySelector('tp-yt-paper-icon-button'))) || r || el;
    target.click();
  };
  const watchUrl = (videoId, listId) =>
    'https://music.youtube.com/watch?v=' + encodeURIComponent(videoId) + (listId ? '&list=' + encodeURIComponent(listId) : '');
  let loadToken = 0;

  window.__ytm = {
    toggle() {
      const p = mp();
      if (!p) return;
      if (p.getPlayerState() === 1) { intent(false); p.pauseVideo(); } else { intent(true); p.playVideo(); }
    },
    play() { intent(true); mp()?.playVideo(); },
    pause() { intent(false); mp()?.pauseVideo(); },
    next() { intent(true); click('.next-button.ytmusic-player-bar'); },
    prev() { intent(true); click('.previous-button.ytmusic-player-bar'); },
    seek(s) { mp()?.seekTo(s, true); },
    volume(v) {
      wantVolume = Math.max(0, Math.min(100, Math.round(v)));
      try { localStorage.setItem('__ytm_vol', String(wantVolume)); } catch (_) {}
      applyVolume();
    },
    volumeBy(delta) {
      const now = wantVolume ?? Math.round(mp()?.getVolume?.() ?? 100);
      window.__ytm.volume(now + delta);
    },
    // These only record the choice; syncPrefs() clicks the page's buttons when the player is ready.
    shuffle() { wantPref.shuffle = !wantPref.shuffle; keep('__ytm_shuffle', wantPref.shuffle ? '1' : '0'); },
    repeat() { wantPref.repeat = MODES[(MODES.indexOf(wantPref.repeat) + 1) % 3]; keep('__ytm_repeat', wantPref.repeat); },
    load(videoId, playlistId) {
      const token = ++loadToken;
      intent(true);
      const p = mp();
      // Same song again: just restart it.
      if (p?.getVideoData?.().video_id === videoId) {
        p.seekTo(0, true); p.playVideo();
        diag.lastLoad = { method: 'restart', ok: true };
        return;
      }
      const reload = (why) => { diag.lastLoad = { method: 'reload', why }; location.href = watchUrl(videoId, playlistId); };

      const currentList = new URLSearchParams(location.search).get('list') || '';
      const sameList = (playlistId || '') === currentList;
      if (!sameList) return reload('different-list');
      if (strikes() >= 2) return reload('queue-switch-disabled');
      const item = queueItems().find((el) => itemVideoId(el) === videoId);
      if (!item) return reload('not-in-queue');

      const started = Date.now();
      playQueueItem(item);
      const check = () => {
        if (token !== loadToken) return; // a newer request replaced this one
        if (mp()?.getVideoData?.().video_id === videoId) {
          diag.lastLoad = { method: 'queue', ms: Date.now() - started, ok: true };
          keep('__ytm_queue_strikes', '0');
          return;
        }
        if (Date.now() - started > 2500) {
          keep('__ytm_queue_strikes', String(strikes() + 1)); // stop trying after two failures
          return reload('queue-click-had-no-effect');
        }
        setTimeout(check, 150);
      };
      setTimeout(check, 150);
    },
  };

  const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? '';

  const snapshot = () => {
    const p = mp();
    if (!p || typeof p.getVideoData !== 'function') return null;
    // While an ad plays, keep reporting the song that was playing (so lyrics, Discord etc. don't flip to the ad).
    if (adShowing() && lastGood) return { ...lastGood, ad: true, playing: true };
    const data = p.getVideoData() || {};
    const byline = txt('ytmusic-player-bar .byline');
    // Artist and album names in the player bar are links; read their ids from the hrefs.
    const links = [...document.querySelectorAll('ytmusic-player-bar .byline a')].map((a) => {
      let path = '';
      try { path = new URL(a.getAttribute('href'), location.href).pathname; } catch (_) {}
      return { name: a.textContent.trim(), path };
    });
    const artists = links.filter((l) => l.path.startsWith('/channel/')).map((l) => ({ name: l.name, id: l.path.slice(9) }));
    const album = links.find((l) => l.path.startsWith('/browse/'));
    const state = {
      videoId: data.video_id || '',
      title: txt('ytmusic-player-bar .title') || data.title || '',
      artist: artists.map((a) => a.name).join(', ') || byline.split(' • ')[0] || data.author || '',
      artists,
      albumId: album ? album.path.slice(8) : '',
      albumName: album ? album.name : '',
      thumb: document.querySelector('ytmusic-player-bar img')?.src || '',
      playing: p.getPlayerState() === 1,
      position: p.getCurrentTime() || 0,
      duration: p.getDuration() || 0,
      volume: p.getVolume(),
      shuffle: wantPref.shuffle,
      repeat: wantPref.repeat,
      listId: new URLSearchParams(location.search).get('list') || '',
      ad: false,
    };
    lastGood = state;
    return state;
  };

  // A snapshot of what this page can and can't see, for the app's Diagnostics panel.
  const diagnostics = () => {
    const p = mp();
    const bar = document.querySelector('ytmusic-player-bar');
    return {
      url: location.pathname + location.search,
      player: !!p,
      playerApi: !!(p && typeof p.getVideoData === 'function'),
      playerBar: !!bar,
      video: !!document.querySelector('video'),
      shuffleButton: !!barBtn('shuffle'),
      repeatButton: !!barBtn('repeat'),
      likeButton: !!document.querySelector('ytmusic-like-button-renderer'),
      volumeSlider: !!document.querySelector('#volume-slider'),
      queueItems: queueItems().length,
      repeatRead: repeatFromPage(),
      repeatAttribute: bar ? String(bar.getAttribute('repeat-mode_')) : null,
      playerState: p && p.getPlayerState ? p.getPlayerState() : null,
      wantPlaying,
      ad: adShowing(),
      adsSeen: diag.adSeen,
      recoveries: diag.recoveries,
      lastLoad: diag.lastLoad,
      queueStrikes: strikes(),
      visibility: document.visibilityState,
      mediaSession: !!navigator.mediaSession,
      bridgeOk: diag.invokeOk,
      bridgeFailed: diag.invokeFail,
      bridgeLastError: diag.lastError,
    };
  };

  // React immediately when the page resets the volume (new song, new video element) instead of waiting for the next tick.
  let hooked = null;
  const hookVideo = () => {
    const v = document.querySelector('video');
    if (v && v !== hooked) {
      hooked = v;
      ['volumechange', 'loadstart', 'playing'].forEach((e) => v.addEventListener(e, applyVolume));
    }
  };

  let ticks = 0;
  setInterval(() => {
    hookVideo();
    applyVolume();
    syncPrefs();
    watchPlayback();
    const state = snapshot();
    if (state && window.__TAURI_INTERNALS__) {
      if (++ticks % 8 === 0) state.diag = diagnostics(); // every ~2 s is plenty
      window.__TAURI_INTERNALS__.invoke('player_state', { state })
        .then(() => { diag.invokeOk++; })
        .catch((e) => { diag.invokeFail++; diag.lastError = String((e && e.message) || e).slice(0, 200); window.__ytmErr = e; console.warn('[ytm bridge]', e); });
    }
  }, 250);
})();
