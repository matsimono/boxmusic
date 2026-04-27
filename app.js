/* ══════════════════════════════
   app.js — Browser puro, sin player
   ══════════════════════════════ */

import * as Spotify from './spotify.js';
import * as Wishlist from './wishlist.js';

const state = {
  connected:   false,
  userId:      null,
  nowPlaying:  null,
  deviceId:    null,
  panelOpen:   true,
  panelWidth:  260,
  currentView: 'inicio',
  library:     { filter: 'todo' },
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


// ══ NAVEGACIÓN ═══════════════════════════════════════════════

function navigate(viewId) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById('view-' + viewId);
  if (target) target.classList.add('active');
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`.sidebar-btn[data-view="${viewId}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  state.currentView = viewId;
  if (viewId === 'busqueda')  searchInput.focus();
  if (viewId === 'biblioteca') loadLibrary();
  if (viewId === 'favoritos')  loadWishlistCache();
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
}


// ══ POLLING ══════════════════════════════════════════════════

let pollInterval = null;
let lastId = null;

function startPolling() {
  if (pollInterval) return;
  async function poll() {
    const track = await Spotify.fetchNowPlaying();
    if (track) {
      if (track.id !== lastId) { lastId = track.id; updateNowPlaying(track); }
      if (track.deviceId) state.deviceId = track.deviceId;
    } else if (lastId !== null) {
      lastId = null;
      updateNowPlaying(null);
    }
  }
  poll();
  pollInterval = setInterval(poll, 5000);
}

function stopPolling() {
  clearInterval(pollInterval);
  pollInterval = null;
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
    name: 'placeholder1',
    getOAuthToken: cb => cb(token),
    volume: 0.8,
  });
  spotifyPlayer.addListener('ready', async ({ device_id }) => {
    state.deviceId = device_id;
    await Spotify.transferPlayback(device_id);
  });
  spotifyPlayer.connect();
}


// ══ HOME SECTIONS ═════════════════════════════════════════════

function homeCard(item) {
  return `
    <div class="home-card" data-type="${item.type || ''}" data-id="${item.id || ''}" data-uri="${item.uri || ''}">
      <div class="home-card-cover">
        ${item.cover
          ? `<img src="${item.cover}" alt="${item.name}" loading="lazy">`
          : `<div class="home-card-placeholder"></div>`}
      </div>
      <div class="home-card-name">${item.name}</div>
      <div class="home-card-sub">${item.sub || ''}</div>
    </div>`;
}

function trackRow(track, index) {
  return `
    <div class="home-track-row" data-uri="${track.uri || ''}">
      <div class="home-track-num">${index + 1}</div>
      <div class="home-track-cover">
        ${track.cover ? `<img src="${track.cover}" alt="${track.name}" loading="lazy">` : '<div class="home-card-placeholder"></div>'}
      </div>
      <div class="home-track-info">
        <div class="home-track-name">${track.name}</div>
        <div class="home-track-artist">${track.artist}</div>
      </div>
      <div class="home-track-album">${track.album}</div>
    </div>`;
}

async function loadHomeSections() {
  if (!state.connected) return;
  try {
    const [recent, playlists] = await Promise.all([
      Spotify.getSavedTracks(),
      Spotify.getPlaylists(),
    ]);

    // Recientes
    const recentsList = document.getElementById('recentsList');
    if (recentsList && recent.length) {
      recentsList.innerHTML = recent.slice(0, 10).map(t => homeCard({
        name: t.name, cover: t.cover, uri: t.uri, sub: t.artist,
      })).join('');
    }

    // Jump Back In — playlists
    const jumpList = document.getElementById('jumpBackList');
    if (jumpList && playlists.length) {
      jumpList.innerHTML = playlists.slice(0, 8).map(p => homeCard({
        name: p.name, cover: p.cover, uri: p.uri, sub: `${p.tracks} canciones`,
      })).join('');
    }

    // Last Liked Songs
    const likedList = document.getElementById('likedList');
    if (likedList && recent.length) {
      likedList.innerHTML = recent.slice(0, 8).map((t, i) => trackRow(t, i)).join('');
    }

    // Albums Featuring Songs You Like
    const albumsMap = {};
    recent.slice(0, 50).forEach(t => {
      if (t.album && !albumsMap[t.album]) {
        albumsMap[t.album] = { name: t.album, cover: t.cover, sub: t.artist, uri: '' };
      }
    });
    const albumsList = document.getElementById('albumsList');
    if (albumsList) {
      const albums = Object.values(albumsMap).slice(0, 8);
      if (albums.length) albumsList.innerHTML = albums.map(a => homeCard(a)).join('');
    }

  } catch (e) {
    console.error('Error cargando home:', e);
  }
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
  container.innerHTML = items.map(item => {
    const wishlisted = isWishlisted(item.id);
    return `
    <div class="lib-item" data-type="${item.type}" data-id="${item.id || ''}" data-uri="${item.uri || ''}">
      <div class="lib-cover">
        ${item.cover ? `<img src="${item.cover}" alt="${item.name}" loading="lazy">` : `<div class="lib-cover-placeholder"></div>`}
        <div class="lib-type-badge">${{ playlist:'Lista', album:'Álbum', artist:'Artista', track:'Canción' }[item.type] || ''}</div>
        <button class="lib-wish-btn ${wishlisted ? 'active' : ''}"
          data-wishlist-id="${item.id}"
          data-wishlist-type="${item.type}"
          data-wishlist-name="${item.name}"
          data-wishlist-cover="${item.cover || ''}"
          data-wishlist-artist="${item.artist || ''}"
          data-wishlist-year="${item.year || ''}"
          data-wishlist-uri="${item.uri || ''}"
          title="${wishlisted ? 'Quitar de wishlist' : 'Añadir a wishlist'}">
          <svg viewBox="0 0 24 24" fill="${wishlisted ? '#e91e63' : 'none'}" stroke="${wishlisted ? '#e91e63' : '#fff'}" stroke-width="2" width="13" height="13">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div class="lib-name">${item.name}</div>
      <div class="lib-sub">${libSub(item)}</div>
    </div>`;
  }).join('');
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



// ══ DETAIL VIEWS ══════════════════════════════════════════════

function formatMs(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;
}

function detailTrackRow(track, index) {
  return `
    <div class="detail-track" data-uri="${track.uri}">
      <div class="detail-track-num">${index + 1}</div>
      <div class="home-track-cover">
        ${track.cover ? `<img src="${track.cover}" loading="lazy">` : '<div class="home-card-placeholder"></div>'}
      </div>
      <div class="home-track-info">
        <div class="home-track-name">${track.name}</div>
        <div class="home-track-artist">${track.artist}</div>
      </div>
      <div class="detail-track-dur">${formatMs(track.durationMs)}</div>
    </div>`;
}

function showDetail(html, item) {
  const panel = document.getElementById('detailPanel');
  const content = document.getElementById('detailContent');
  content.innerHTML = html;
  panel.classList.remove('hidden');

  // Wishlist button in topbar
  const wbtn = document.getElementById('detailWishlistBtn');
  if (wbtn && item) {
    wbtn.innerHTML = wishlistBtn(item);
  } else if (wbtn) {
    wbtn.innerHTML = '';
  }
}

function hideDetail() {
  document.getElementById('detailPanel').classList.add('hidden');
}

document.getElementById('detailBack')?.addEventListener('click', hideDetail);

async function openItem(type, id, uri) {
  showDetail('<div class="detail-loading">Cargando...</div>');
  try {
    if (type === 'playlist') {
      const pl = await Spotify.getPlaylist(id);
      if (!pl) return;
      const plItem = {id: pl.id, type: 'playlist', name: pl.name, cover: pl.cover, uri: pl.uri};
      showDetail(`
        <div class="detail-header">
          <div class="detail-cover">${pl.cover ? `<img src="${pl.cover}">` : '<div class="home-card-placeholder"></div>'}</div>
          <div class="detail-meta">
            <div class="detail-type">Playlist</div>
            <div class="detail-title">${pl.name}</div>
            <div class="detail-sub">${pl.owner} · ${pl.total} canciones</div>
            ${pl.desc ? `<div class="detail-desc">${pl.desc}</div>` : ''}
          </div>
        </div>
        <div class="detail-tracks">
          ${pl.tracks.map((t, i) => detailTrackRow(t, i)).join('')}
        </div>`, plItem);
    } else if (type === 'album') {
      const al = await Spotify.getAlbum(id);
      if (!al) return;
      const alItem = {id: al.id, type: 'album', name: al.name, cover: al.cover, artist: al.artist, year: al.year, uri: al.uri};
      showDetail(`
        <div class="detail-header">
          <div class="detail-cover">${al.cover ? `<img src="${al.cover}">` : '<div class="home-card-placeholder"></div>'}</div>
          <div class="detail-meta">
            <div class="detail-type">Álbum</div>
            <div class="detail-title">${al.name}</div>
            <div class="detail-sub">${al.artist} · ${al.year} · ${al.total} canciones</div>
          </div>
        </div>
        <div class="detail-tracks">
          ${al.tracks.map((t, i) => detailTrackRow(t, i)).join('')}
        </div>`, alItem);
    } else if (type === 'artist') {
      const ar = await Spotify.getArtist(id);
      if (!ar) return;
      const arItem = {id: ar.id, type: 'artist', name: ar.name, cover: ar.cover, uri: ar.uri};
      showDetail(`
        <div class="detail-header artist">
          <div class="detail-cover artist-cover">${ar.cover ? `<img src="${ar.cover}">` : '<div class="home-card-placeholder"></div>'}</div>
          <div class="detail-meta">
            <div class="detail-type">Artista</div>
            <div class="detail-title">${ar.name}</div>
            <div class="detail-sub">${ar.followers.toLocaleString()} seguidores</div>
            ${ar.genres.length ? `<div class="detail-genres">${ar.genres.slice(0,4).map(g => `<span class="genre-chip">${g}</span>`).join('')}</div>` : ''}
          </div>
        </div>
        <div class="detail-section-label">Canciones populares</div>
        <div class="detail-tracks">
          ${ar.topTracks.map((t, i) => detailTrackRow(t, i)).join('')}
        </div>
        ${ar.albums.length ? `
        <div class="detail-section-label">Discografía</div>
        <div class="home-row">
          ${ar.albums.map(a => `
            <div class="home-card" data-type="album" data-id="${a.id}" data-uri="${a.uri}">
              <div class="home-card-cover">${a.cover ? `<img src="${a.cover}" loading="lazy">` : '<div class="home-card-placeholder"></div>'}</div>
              <div class="home-card-name">${a.name}</div>
              <div class="home-card-sub">${a.year} · ${a.type}</div>
            </div>`).join('')}
        </div>` : ''}
      `);
    }
  } catch(e) {
    showDetail('<div class="detail-loading">Error cargando contenido</div>');
  }
}

// Click delegation para abrir items
document.addEventListener('click', e => {
  const card = e.target.closest('[data-type][data-id], [data-type][data-uri]');
  if (!card) return;
  const type = card.dataset.type;
  const uri  = card.dataset.uri || '';
  let id     = card.dataset.id;

  // Extraer id del URI si no está en data-id
  if (!id && uri) {
    const parts = uri.split(':');
    id = parts[parts.length - 1];
  }

  if (!id || !type || type === 'track') return;
  openItem(type, id, uri);
});


// ══ WISHLIST ══════════════════════════════════════════════════

let wishlistCache = new Set();

async function loadWishlistCache() {
  if (!state.userId) return;
  const items = await Wishlist.getWishlist(state.userId);
  wishlistCache = new Set(items.map(i => i.spotify_id));
  renderWishlistView(items);
}

function isWishlisted(id) {
  return wishlistCache.has(id);
}

async function toggleWishlist(item) {
  if (!state.userId) return;
  if (isWishlisted(item.id)) {
    await Wishlist.removeFromWishlist(state.userId, item.id);
    wishlistCache.delete(item.id);
  } else {
    await Wishlist.addToWishlist(state.userId, item);
    wishlistCache.add(item.id);
  }
  // Refresh wishlist view if active
  if (state.currentView === 'favoritos') loadWishlistCache();
  return isWishlisted(item.id);
}

function wishlistBtn(item) {
  const active = isWishlisted(item.id);
  return `<button class="wishlist-btn ${active ? 'active' : ''}" 
    data-wishlist-id="${item.id}"
    data-wishlist-type="${item.type}"
    data-wishlist-name="${item.name}"
    data-wishlist-cover="${item.cover || ''}"
    data-wishlist-artist="${item.artist || ''}"
    data-wishlist-year="${item.year || ''}"
    data-wishlist-uri="${item.uri || ''}"
    title="${active ? 'Quitar de wishlist' : 'Añadir a wishlist'}">
    <svg viewBox="0 0 24 24" fill="${active ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" width="16" height="16">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  </button>`;
}

// Click delegation para wishlist buttons (detail panel + library)
document.addEventListener('click', async e => {
  const libBtn = e.target.closest('.lib-wish-btn');
  if (libBtn) {
    e.stopPropagation();
    const item = {
      id:     libBtn.dataset.wishlistId,
      type:   libBtn.dataset.wishlistType,
      name:   libBtn.dataset.wishlistName,
      cover:  libBtn.dataset.wishlistCover || null,
      artist: libBtn.dataset.wishlistArtist || null,
      year:   libBtn.dataset.wishlistYear || null,
      uri:    libBtn.dataset.wishlistUri || null,
    };
    const nowActive = await toggleWishlist(item);
    const svg = libBtn.querySelector('svg');
    svg.setAttribute('fill', nowActive ? '#e91e63' : 'none');
    svg.setAttribute('stroke', nowActive ? '#e91e63' : '#fff');
    libBtn.classList.toggle('active', nowActive);
    libBtn.title = nowActive ? 'Quitar de wishlist' : 'Añadir a wishlist';
    return;
  }
});

document.addEventListener('click', async e => {
  const btn = e.target.closest('.wishlist-btn');
  if (!btn) return;
  e.stopPropagation();
  const item = {
    id:     btn.dataset.wishlistId,
    type:   btn.dataset.wishlistType,
    name:   btn.dataset.wishlistName,
    cover:  btn.dataset.wishlistCover || null,
    artist: btn.dataset.wishlistArtist || null,
    year:   btn.dataset.wishlistYear || null,
    uri:    btn.dataset.wishlistUri || null,
  };
  const nowActive = await toggleWishlist(item);
  const svg = btn.querySelector('svg');
  svg.setAttribute('fill', nowActive ? 'currentColor' : 'none');
  btn.classList.toggle('active', nowActive);
  btn.title = nowActive ? 'Quitar de wishlist' : 'Añadir a wishlist';
});

function renderWishlistView(items) {
  const container = document.getElementById('wishlistGrid');
  if (!container) return;
  if (!items.length) {
    container.innerHTML = '<div class="lib-loading">Tu wishlist está vacía</div>';
    return;
  }
  container.innerHTML = items.map(item => `
    <div class="lib-item" data-type="${item.type}" data-id="${item.spotify_id}" data-uri="${item.uri || ''}">
      <div class="lib-cover">
        ${item.cover ? `<img src="${item.cover}" alt="${item.name}" loading="lazy">` : '<div class="lib-cover-placeholder"></div>'}
        <div class="lib-type-badge">${{album:'Álbum', artist:'Artista', playlist:'Lista', track:'Canción'}[item.type] || ''}</div>
      </div>
      <div class="lib-name">${item.name}</div>
      <div class="lib-sub">${item.artist || ''} ${item.year ? '· ' + item.year : ''}</div>
    </div>`).join('');
}

// ══ INIT ══════════════════════════════════════════════════════

async function init() {
  nowplayingSection.style.width = state.panelWidth + 'px';

  if (Spotify.isConnected()) {
    state.connected = true;
    updateSpotifyUI();
    startPolling();
    initSDK();
    loadHomeSections();
    // Cargar user ID para wishlist
    Spotify.getMe().then(me => {
      if (me?.id) { state.userId = me.id; loadWishlistCache(); }
    });
  } else {
    updateSpotifyUI();
  }
}

init();
