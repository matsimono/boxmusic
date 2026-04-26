/* ══════════════════════════════
   app.js — Browser puro, sin Electron
   ══════════════════════════════ */

import * as Spotify from './spotify.js';

const state = {
  connected:   false,
  nowPlaying:  null,
  deviceId:    null,
  panelOpen:   true,
  panelWidth:  260,
  currentView: 'inicio',
  library:     { filter: 'todo', items: [], loading: false },
};

// ── DOM refs ──
const profileBtn           = document.getElementById('profileBtn');
const accountDropdown      = document.getElementById('accountDropdown');
const settingsBtn          = document.getElementById('settingsBtn');
const settingsOverlay      = document.getElementById('settingsOverlay');
const spotifyConnectBtn    = document.getElementById('spotifyConnectBtn');
const spotifyDisconnectBtn = document.getElementById('spotifyDisconnectBtn');
const spotifyStatus        = document.getElementById('spotifyStatus');
const nowplayingSection    = document.getElementById('nowplayingSection');
const closePanelBtn        = document.getElementById('closePanelBtn');
const reopenPanelBtn       = document.getElementById('reopenPanelBtn');
const resizeHandle         = document.getElementById('resizeHandle');
const searchInput          = document.getElementById('searchInput');
const progressFill         = document.getElementById('progressFill');
const progressCurrent      = document.getElementById('progressCurrent');
const progressTotal        = document.getElementById('progressTotal');
const playerTitle          = document.getElementById('playerTitle');
const playerArtist         = document.getElementById('playerArtist');
const playerThumb          = document.getElementById('playerThumb');
const btnPlayPause         = document.getElementById('btnPlayPause');
const btnNext              = document.getElementById('btnNext');
const btnPrev              = document.getElementById('btnPrev');
const btnShuffle           = document.getElementById('btnShuffle');
const btnRepeat            = document.getElementById('btnRepeat');
const btnMute              = document.getElementById('btnMute');
const playerTrack          = document.getElementById('playerTrack');
const volumeTrack          = document.getElementById('volumeTrack');
const volumeFill           = document.getElementById('volumeFill');


// ══ NAVEGACIÓN ═══════════════════════════════════════════════

function navigate(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.sidebar-btn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  state.currentView = viewId;
  if (viewId === 'busqueda') searchInput.focus();
  if (viewId === 'biblioteca') loadLibrary();
}

document.querySelectorAll('.sidebar-btn[data-view]').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.view));
});


// ══ TOPBAR ═══════════════════════════════════════════════════

profileBtn.addEventListener('click', e => {
  e.stopPropagation();
  accountDropdown.classList.toggle('hidden');
});
document.addEventListener('click', () => accountDropdown.classList.add('hidden'));
accountDropdown.addEventListener('click', e => e.stopPropagation());

settingsBtn.addEventListener('click', toggleSettings);
function toggleSettings() { settingsOverlay.classList.toggle('hidden'); }
settingsOverlay.addEventListener('click', e => { if (e.target === settingsOverlay) toggleSettings(); });


// ══ PANEL DERECHO ════════════════════════════════════════════

closePanelBtn.addEventListener('click', closePanel);
reopenPanelBtn.addEventListener('click', openPanel);

function closePanel() {
  state.panelOpen = false;
  nowplayingSection.classList.add('closed');
  resizeHandle.style.display = 'none';
  reopenPanelBtn.classList.remove('hidden');
}
function openPanel() {
  state.panelOpen = true;
  nowplayingSection.classList.remove('closed');
  nowplayingSection.style.width = state.panelWidth + 'px';
  resizeHandle.style.display = '';
  reopenPanelBtn.classList.add('hidden');
}

let isResizing = false, startX = 0, startWidth = 0;
resizeHandle.addEventListener('mousedown', e => {
  isResizing = true; startX = e.clientX; startWidth = nowplayingSection.offsetWidth;
  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});
document.addEventListener('mousemove', e => {
  if (!isResizing) return;
  const newWidth = Math.min(420, Math.max(180, startWidth + (startX - e.clientX)));
  nowplayingSection.style.width = newWidth + 'px';
  state.panelWidth = newWidth;
});
document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});


// ══ SPOTIFY AUTH ══════════════════════════════════════════════

window.spotifyLogin  = () => Spotify.login();
window.spotifyLogout = () => {
  Spotify.logout();
  state.connected = false;
  stopPolling();
  updateSpotifyUI();
  updateNowPlaying(null);
  updateProgress(null);
};

function updateSpotifyUI() {
  spotifyStatus.textContent = state.connected ? 'Conectado' : 'No conectado';
  spotifyConnectBtn.classList.toggle('hidden', state.connected);
  spotifyDisconnectBtn.classList.toggle('hidden', !state.connected);
}


// ══ NOW PLAYING ═══════════════════════════════════════════════

function updateNowPlaying(track) {
  state.nowPlaying = track;

  document.getElementById('npTitle').textContent  = track?.title  || '—';
  document.getElementById('npArtist').textContent = track?.artist || '—';
  document.getElementById('npAlbum').textContent  = track?.album  || '—';

  const cover = document.getElementById('npCover');
  const ph    = document.getElementById('npCoverPlaceholder');
  if (track?.cover) {
    cover.src = track.cover; cover.style.display = 'block'; ph.style.display = 'none';
  } else {
    cover.style.display = 'none'; ph.style.display = 'flex';
  }

  playerTitle.textContent  = track?.title  || '—';
  playerArtist.textContent = track?.artist || '—';
  playerThumb.innerHTML = track?.cover
    ? `<img src="${track.cover}" alt="cover">`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="1.5" width="20" height="20"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;

  updatePlayPauseBtn(track?.playing);
}


// ══ PROGRESO ══════════════════════════════════════════════════

function formatTime(ms) {
  if (!ms) return '0:00';
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

// ── updateProgress mantiene compatibilidad con código existente ──
function updateProgress(data) {
  if (!data?.durationMs) {
    progressFill.style.width = '0%';
    progressCurrent.textContent = '0:00';
    progressTotal.textContent   = '0:00';
    return;
  }
  if (state.nowPlaying) {
    state.nowPlaying.durationMs = data.durationMs;
    state.nowPlaying.progressMs = data.progressMs;
  }
  progressFill.style.width    = `${(data.progressMs / data.durationMs) * 100}%`;
  progressCurrent.textContent = formatTime(data.progressMs);
  progressTotal.textContent   = formatTime(data.durationMs);
}


// ══ SEEK — sin retraso visual ════════════════════════════════

let isSeeking = false;

function getSeekMs(e) {
  const bar = playerTrack.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
  return Math.floor(pct * (state.nowPlaying?.durationMs || 0));
}

// Actualiza la barra visualmente mientras arrastras
function applySeekVisual(ms) {
  if (!state.nowPlaying?.durationMs) return;
  const pct = ms / state.nowPlaying.durationMs;
  progressFill.style.transition = 'none';
  progressFill.style.width = `${pct * 100}%`;
  progressCurrent.textContent = formatTime(ms);
}

playerTrack?.addEventListener('mousedown', (e) => {
  if (!state.nowPlaying?.durationMs) return;
  isSeeking = true;
  progressFill.style.transition = 'none';
  applySeekVisual(getSeekMs(e));
});

document.addEventListener('mousemove', (e) => {
  if (!isSeeking) return;
  applySeekVisual(getSeekMs(e));
});

document.addEventListener('mouseup', async (e) => {
  if (!isSeeking) return;
  isSeeking = false;
  const ms = getSeekMs(e);
  setAnchor(ms);
  progressFill.style.transition = '';
  await Spotify.seek(ms);
});

// Touch support (móvil)
playerTrack?.addEventListener('touchstart', (e) => {
  if (!state.nowPlaying?.durationMs) return;
  isSeeking = true;
  applySeekVisual(getSeekMsTouch(e));
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!isSeeking) return;
  applySeekVisual(getSeekMsTouch(e));
}, { passive: true });

document.addEventListener('touchend', async (e) => {
  if (!isSeeking) return;
  isSeeking = false;
  const ms = getSeekMsTouch(e);
  setAnchor(ms);
  progressFill.style.transition = '';
  await Spotify.seek(ms);
});

function getSeekMsTouch(e) {
  const touch = e.touches[0] || e.changedTouches[0];
  const bar   = playerTrack.getBoundingClientRect();
  const pct   = Math.max(0, Math.min(1, (touch.clientX - bar.left) / bar.width));
  return Math.floor(pct * (state.nowPlaying?.durationMs || 0));
}


// ══ PLAYER CONTROLS ══════════════════════════════════════════

// shuffle / repeat state
let shuffleOn = false, repeatMode = 0; // 0=off 1=all 2=one
let volumeLevel = 0.8, muted = false;

function updatePlayPauseBtn(playing) {
  if (!btnPlayPause) return;
  btnPlayPause.innerHTML = playing
    ? `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
}

btnPlayPause?.addEventListener('click', async () => {
  if (state.nowPlaying?.playing) {
    await Spotify.pause();
    state.nowPlaying.playing = false;
    isPlaying = false;
    setAnchor(getCurrentMs()); // congela la posición actual
  } else {
    await Spotify.play(state.deviceId);
    state.nowPlaying.playing = true;
    isPlaying = true;
    setAnchor(getCurrentMs()); // reanuda desde aquí
  }
  updatePlayPauseBtn(state.nowPlaying?.playing);
});

btnNext?.addEventListener('click', () => Spotify.next());
btnPrev?.addEventListener('click', () => Spotify.previous());

// ── SHUFFLE ──
btnShuffle?.addEventListener('click', async () => {
  shuffleOn = !shuffleOn;
  btnShuffle.classList.toggle('active', shuffleOn);
  await Spotify.setShuffle(shuffleOn);
});

// ── REPEAT ──
btnRepeat?.addEventListener('click', async () => {
  repeatMode = (repeatMode + 1) % 3;
  const modes = ['off', 'context', 'track'];
  const icons = [
    // off
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    // all
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`,
    // one — añade "1"
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/><text x="10" y="14" font-size="7" fill="currentColor" stroke="none">1</text></svg>`,
  ];
  btnRepeat.classList.toggle('active', repeatMode > 0);
  btnRepeat.innerHTML = icons[repeatMode];
  await Spotify.setRepeat(modes[repeatMode]);
});

// ── VOLUMEN ──
function setVolume(v) {
  volumeLevel = Math.max(0, Math.min(1, v));
  volumeFill.style.width = `${volumeLevel * 100}%`;
  Spotify.setVolume(Math.round(volumeLevel * 100));
  updateVolumeIcon();
}

function updateVolumeIcon() {
  const v = muted ? 0 : volumeLevel;
  let icon;
  if (v === 0)      icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>`;
  else if (v < 0.5) icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>`;
  else              icon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;
  btnMute.innerHTML = icon;
}

btnMute?.addEventListener('click', () => {
  muted = !muted;
  Spotify.setVolume(muted ? 0 : Math.round(volumeLevel * 100));
  volumeFill.style.width = muted ? '0%' : `${volumeLevel * 100}%`;
  updateVolumeIcon();
});

// Drag volumen
let isDraggingVol = false;
volumeTrack?.addEventListener('mousedown', (e) => {
  isDraggingVol = true;
  applyVolumeDrag(e);
});
document.addEventListener('mousemove', (e) => { if (isDraggingVol) applyVolumeDrag(e); });
document.addEventListener('mouseup',   ()  => { isDraggingVol = false; });

function applyVolumeDrag(e) {
  const bar = volumeTrack.getBoundingClientRect();
  const v   = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
  muted = false;
  setVolume(v);
}

// Scroll en volumen
volumeTrack?.addEventListener('wheel', (e) => {
  e.preventDefault();
  setVolume(volumeLevel + (e.deltaY < 0 ? 0.05 : -0.05));
}, { passive: false });


// ══ POLLING ══════════════════════════════════════════════════

// ══ PROGRESO RAF ═════════════════════════════════════════════
// Una sola fuente de verdad: progressAnchorTime + progressAnchorMs
// El RAF nunca para — solo dibuja cuando isPlaying y no isSeeking

let pollInterval = null;
let localDuration = 0, isPlaying = false, lastId = null;
let progressAnchorMs   = 0;   // posición en ms en el momento del anchor
let progressAnchorTime = 0;   // performance.now() en el momento del anchor
let rafId = null;

function setAnchor(posMs) {
  progressAnchorMs   = posMs;
  progressAnchorTime = performance.now();
}

function getCurrentMs() {
  if (!isPlaying) return progressAnchorMs;
  return Math.min(progressAnchorMs + (performance.now() - progressAnchorTime), localDuration);
}

function startRAF() {
  if (rafId) return;
  let lastPct = -1, lastSec = -1;
  function tick() {
    rafId = requestAnimationFrame(tick);
    if (isSeeking) return;
    const ms  = getCurrentMs();
    const pct = localDuration > 0 ? (ms / localDuration) * 100 : 0;
    // Solo actualiza DOM si cambió algo — evita repaints innecesarios
    if (Math.abs(pct - lastPct) > 0.01) {
      progressFill.style.transition = 'none';
      progressFill.style.width = pct + '%';
      lastPct = pct;
    }
    const sec = Math.floor(ms / 1000);
    if (sec !== lastSec) {
      progressCurrent.textContent = formatTime(ms);
      lastSec = sec;
    }
  }
  rafId = requestAnimationFrame(tick);
}

function stopRAF() {
  cancelAnimationFrame(rafId);
  rafId = null;
}

function startPolling() {
  if (pollInterval) return;
  startRAF(); // RAF corre siempre, isPlaying controla si avanza

  async function poll() {
    if (isSeeking) return;
    const track = await Spotify.fetchNowPlaying();
    if (track) {
      const trackChanged = track.id !== lastId;
      if (trackChanged) { lastId = track.id; updateNowPlaying(track); }

      localDuration = track.durationMs;
      progressTotal.textContent = formatTime(localDuration);

      const wasPlaying = isPlaying;
      isPlaying = track.playing;

      // Solo actualiza el anchor si la posición real difiere >2s de la estimada
      const estimated = getCurrentMs();
      const drift = Math.abs(estimated - track.progressMs);
      if (trackChanged || drift > 2000 || (!wasPlaying && isPlaying)) {
        setAnchor(track.progressMs);
      }

      if (track.deviceId) state.deviceId = track.deviceId;
    } else if (lastId !== null) {
      lastId = null;
      isPlaying = false;
      updateNowPlaying(null);
    }
  }

  poll();
  pollInterval = setInterval(poll, 3000);
}

function stopPolling() {
  clearInterval(pollInterval); pollInterval = null;
  stopRAF();
}


// ══ SDK ═══════════════════════════════════════════════════════

let spotifyPlayer = null;

function initSDK() {
  const token = Spotify.getToken();
  if (!token) return;

  if (typeof window.Spotify === 'undefined') {
    window.onSpotifyWebPlaybackSDKReady = () => createPlayer(token);
  } else {
    createPlayer(token);
  }
}

function createPlayer(token) {
  if (spotifyPlayer) { spotifyPlayer.disconnect(); spotifyPlayer = null; }

  spotifyPlayer = new window.Spotify.Player({
    name:          'placeholder1',
    getOAuthToken: cb => cb(token),
    volume:        0.8,
  });

  spotifyPlayer.addListener('ready', async ({ device_id }) => {
    console.log('[SDK] listo:', device_id);
    state.deviceId = device_id;
    await Spotify.transferPlayback(device_id);
  });

  spotifyPlayer.addListener('not_ready',            ({ device_id }) => console.warn('[SDK] offline:', device_id));
  spotifyPlayer.addListener('initialization_error', ({ message })   => console.error('[SDK] init:', message));
  spotifyPlayer.addListener('authentication_error', ({ message })   => console.error('[SDK] auth:', message));
  spotifyPlayer.addListener('account_error',        ({ message })   => console.error('[SDK] account:', message));

  spotifyPlayer.connect();
}


// ══ BIBLIOTECA ═══════════════════════════════════════════════

async function loadLibrary(filter) {
  if (filter) state.library.filter = filter;
  if (!state.connected) return;
  const container = document.getElementById('libraryGrid');
  if (!container) return;

  const cacheKey = `lib_${state.library.filter}`;
  const cached   = localStorage.getItem(cacheKey);
  if (cached) renderLibrary(JSON.parse(cached));
  else container.innerHTML = '<div class="lib-loading">Cargando...</div>';

  try {
    let items = [];
    const f = state.library.filter;
    if (f === 'todo' || f === 'playlists') items = items.concat(await Spotify.getPlaylists());
    if (f === 'todo' || f === 'albumes')   items = items.concat(await Spotify.getSavedAlbums());
    if (f === 'todo' || f === 'artistas')  items = items.concat(await Spotify.getFollowedArtists());
    if (f === 'canciones')                 items = items.concat(await Spotify.getSavedTracks());
    localStorage.setItem(cacheKey, JSON.stringify(items));
    renderLibrary(items);
  } catch (e) {
    if (!cached) container.innerHTML = '<div class="lib-loading">Error cargando biblioteca</div>';
  }
}

function renderLibrary(items) {
  const container = document.getElementById('libraryGrid');
  if (!container) return;
  if (!items.length) { container.innerHTML = '<div class="lib-loading">Sin elementos</div>'; return; }

  container.innerHTML = items.map(item => `
    <div class="lib-item" data-type="${item.type}" data-uri="${item.uri || ''}">
      <div class="lib-cover">
        ${item.cover ? `<img src="${item.cover}" alt="${item.name}" loading="lazy">` : `<div class="lib-cover-placeholder"></div>`}
        <div class="lib-type-badge">${{ playlist:'Lista', album:'Álbum', artist:'Artista', track:'Canción' }[item.type] || ''}</div>
      </div>
      <div class="lib-name">${item.name}</div>
      <div class="lib-sub">${libSub(item)}</div>
    </div>
  `).join('');
}

function libSub(item) {
  if (item.type === 'playlist') return `${item.tracks} canciones · ${item.owner}`;
  if (item.type === 'album')    return `${item.artist} · ${item.year}`;
  if (item.type === 'artist')   return item.genres.slice(0,2).join(', ') || 'Artista';
  if (item.type === 'track')    return item.artist;
  return '';
}

document.querySelectorAll('.lib-filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.lib-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadLibrary(btn.dataset.filter);
  });
});


// ══ BÚSQUEDA ══════════════════════════════════════════════════

let searchTimeout = null;
searchInput.addEventListener('input', e => {
  const q = e.target.value.trim();
  if (q && state.currentView !== 'busqueda') navigate('busqueda');
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (q) console.log('TODO: buscar', q);
  }, 400);
});


// ══ PINS ══════════════════════════════════════════════════════

document.querySelectorAll('.pin-slot').forEach(slot => {
  slot.addEventListener('click', () => console.log(`Pin slot ${slot.dataset.index}`));
});


// ══ INIT ══════════════════════════════════════════════════════

async function init() {
  nowplayingSection.style.width = state.panelWidth + 'px';
  updatePlayPauseBtn(false);

  if (Spotify.isConnected()) {
    state.connected = true;
    updateSpotifyUI();
    startPolling();
    initSDK();
  } else {
    updateSpotifyUI();
  }
}

init();
