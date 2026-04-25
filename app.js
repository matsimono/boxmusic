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

document.querySelector('.player-track')?.addEventListener('click', (e) => {
  if (!state.nowPlaying?.durationMs) return;
  const bar = e.currentTarget.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - bar.left) / bar.width));
  const ms  = Math.floor(pct * state.nowPlaying.durationMs);
  updateProgress({ progressMs: ms, durationMs: state.nowPlaying.durationMs, playing: state.nowPlaying.playing });
  Spotify.seek(ms);
});


// ══ PLAYER CONTROLS ══════════════════════════════════════════

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
  } else {
    await Spotify.play(state.deviceId);
    state.nowPlaying.playing = true;
  }
  updatePlayPauseBtn(state.nowPlaying?.playing);
});

btnNext?.addEventListener('click', () => Spotify.next());
btnPrev?.addEventListener('click', () => Spotify.previous());


// ══ POLLING ══════════════════════════════════════════════════

let pollInterval = null, progressInterval = null;
let localProgress = 0, localDuration = 0, isPlaying = false, lastId = null;

function startPolling() {
  if (pollInterval) return;

  async function poll() {
    const track = await Spotify.fetchNowPlaying();
    if (track) {
      if (track.id !== lastId) { lastId = track.id; updateNowPlaying(track); }
      localProgress = track.progressMs;
      localDuration = track.durationMs;
      isPlaying     = track.playing;
      updateProgress({ progressMs: track.progressMs, durationMs: track.durationMs, playing: track.playing });
      if (track.deviceId) state.deviceId = track.deviceId;
    } else if (lastId !== null) {
      lastId = null;
      updateNowPlaying(null);
    }
  }

  poll();
  pollInterval = setInterval(poll, 5000);

  progressInterval = setInterval(() => {
    if (isPlaying && localDuration > 0) {
      localProgress = Math.min(localProgress + 1000, localDuration);
      updateProgress({ progressMs: localProgress, durationMs: localDuration, playing: true });
    }
  }, 1000);
}

function stopPolling() {
  clearInterval(pollInterval);     pollInterval     = null;
  clearInterval(progressInterval); progressInterval = null;
}


// ══ SDK ═══════════════════════════════════════════════════════

let spotifyPlayer = null;

function initSDK() {
  const token = Spotify.getToken();
  if (!token) return;

  if (typeof Spotify_SDK === 'undefined') {
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

  // Cache en localStorage
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
