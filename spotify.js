/* ══════════════════════════════
   spotify.js — PKCE OAuth + API + SDK (browser puro)
   ══════════════════════════════ */

const CLIENT_ID   = '50d3f535279c49e58e2c02e17402bb68';
const REDIRECT    = window.location.origin + '/callback.html';
const SCOPES      = [
  'user-read-currently-playing',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-private',
  'user-read-email',
  'user-library-read',
  'playlist-read-private',
  'playlist-read-collaborative',
  'user-follow-read',
  'streaming',
].join(' ');

// ── PKCE ─────────────────────────────────────────────────────

async function generateVerifier() {
  const arr = crypto.getRandomValues(new Uint8Array(64));
  return btoa(String.fromCharCode(...arr)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

async function generateChallenge(verifier) {
  const data   = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// ── AUTH ──────────────────────────────────────────────────────

export async function login() {
  const verifier  = await generateVerifier();
  const challenge = await generateChallenge(verifier);
  localStorage.setItem('spotify_verifier', verifier);

  const params = new URLSearchParams({
    client_id:             CLIENT_ID,
    response_type:         'code',
    redirect_uri:          REDIRECT,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    scope:                 SCOPES,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function handleCallback() {
  const params   = new URLSearchParams(window.location.search);
  const code     = params.get('code');
  const verifier = localStorage.getItem('spotify_verifier');
  if (!code || !verifier) return false;

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID, grant_type: 'authorization_code',
      code, redirect_uri: REDIRECT, code_verifier: verifier,
    }),
  });

  const data = await res.json();
  if (data.error) return false;

  localStorage.setItem('spotify_access_token',  data.access_token);
  localStorage.setItem('spotify_refresh_token', data.refresh_token);
  localStorage.setItem('spotify_expires_at',    Date.now() + data.expires_in * 1000);
  localStorage.removeItem('spotify_verifier');
  return true;
}

export function logout() {
  localStorage.removeItem('spotify_access_token');
  localStorage.removeItem('spotify_refresh_token');
  localStorage.removeItem('spotify_expires_at');
}

export function getToken()    { return localStorage.getItem('spotify_access_token'); }
export function isConnected() { return !!getToken() && Date.now() < +localStorage.getItem('spotify_expires_at'); }

export async function getMe() { return apiFetch('/me'); }

async function refreshToken() {
  const refresh = localStorage.getItem('spotify_refresh_token');
  if (!refresh) return;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: refresh }),
  });
  const data = await res.json();
  if (data.error) return;
  localStorage.setItem('spotify_access_token', data.access_token);
  localStorage.setItem('spotify_expires_at',   Date.now() + data.expires_in * 1000);
  if (data.refresh_token) localStorage.setItem('spotify_refresh_token', data.refresh_token);
}

// ── API HELPER ────────────────────────────────────────────────

async function apiFetch(path, options = {}) {
  let token = getToken();
  if (!token) return null;

  // Refresh si está a punto de expirar
  if (Date.now() > +localStorage.getItem('spotify_expires_at') - 60000) {
    await refreshToken();
    token = getToken();
  }

  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 401) { await refreshToken(); return null; }
  if (res.status === 204 || !res.ok) return null;
  return res.json();
}

const apiGet  = (path)         => apiFetch(path);
const apiPut  = (path, body)   => apiFetch(path, { method: 'PUT',  body: body ? JSON.stringify(body) : undefined });
const apiPost = (path, body)   => apiFetch(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined });

// ── NOW PLAYING ───────────────────────────────────────────────

export async function fetchNowPlaying() {
  const data = await apiGet('/me/player/currently-playing');
  if (!data?.item) return null;
  return {
    title:      data.item.name,
    artist:     data.item.artists.map(a => a.name).join(', '),
    album:      data.item.album.name,
    cover:      data.item.album.images[0]?.url || null,
    id:         data.item.id,
    uri:        data.item.uri,
    playing:    data.is_playing,
    progressMs: data.progress_ms,
    durationMs: data.item.duration_ms,
    deviceId:   data.device?.id || null,
  };
}

// ── PLAYBACK CONTROL ──────────────────────────────────────────

export const play         = (deviceId) => apiPut(`/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`);
export const pause        = ()         => apiPut('/me/player/pause');
export const next         = ()         => apiPost('/me/player/next');
export const previous     = ()         => apiPost('/me/player/previous');
export const seek         = (ms)       => apiPut(`/me/player/seek?position_ms=${ms}`);
export const setVolume    = (pct)      => apiPut(`/me/player/volume?volume_percent=${pct}`);
export const setShuffle   = (state)    => apiPut(`/me/player/shuffle?state=${state}`);
export const setRepeat    = (state)    => apiPut(`/me/player/repeat?state=${state}`);
export const getDevices   = async ()   => (await apiGet('/me/player/devices'))?.devices || [];
export const transferPlayback = (id)   => apiPut('/me/player', { device_ids: [id], play: true });

// ── LIBRARY ───────────────────────────────────────────────────

async function fetchAllPages(path) {
  let items = [], url = `${path}${path.includes('?') ? '&' : '?'}limit=50`;
  while (url) {
    const data = await apiGet(url.replace('https://api.spotify.com/v1', ''));
    if (!data) break;
    items = items.concat(data.items || []);
    url = data.next || null;
  }
  return items;
}

export async function getPlaylists() {
  return (await fetchAllPages('/me/playlists')).map(p => ({
    id: p.id, name: p.name, cover: p.images?.[0]?.url || null,
    tracks: p.tracks?.total || 0, owner: p.owner?.display_name || '',
    uri: p.uri, type: 'playlist',
  }));
}

export async function getSavedAlbums() {
  return (await fetchAllPages('/me/albums')).map(({ album }) => ({
    id: album.id, name: album.name, cover: album.images?.[0]?.url || null,
    artist: album.artists.map(a => a.name).join(', '),
    year: album.release_date?.split('-')[0] || '',
    tracks: album.total_tracks, uri: album.uri, type: 'album',
  }));
}

export async function getFollowedArtists() {
  let items = [], cursor = null;
  while (true) {
    const data = await apiGet(`/me/following?type=artist&limit=50${cursor ? `&after=${cursor}` : ''}`);
    if (!data?.artists?.items?.length) break;
    items = items.concat(data.artists.items);
    cursor = data.artists.cursors?.after;
    if (!cursor) break;
  }
  return items.map(a => ({
    id: a.id, name: a.name, cover: a.images?.[0]?.url || null,
    followers: a.followers?.total || 0, genres: a.genres || [],
    uri: a.uri, type: 'artist',
  }));
}

export async function getSavedTracks() {
  return (await fetchAllPages('/me/tracks')).map(({ track }) => ({
    id: track.id, name: track.name,
    artist: track.artists.map(a => a.name).join(', '),
    album: track.album.name, cover: track.album.images?.[0]?.url || null,
    uri: track.uri, type: 'track',
  }));
}


// ── DETAIL VIEWS ──────────────────────────────────────────────

export async function getPlaylist(id) {
  const data = await apiGet(`/playlists/${id}`);
  if (!data) return null;

  // Paginar todas las canciones
  let trackItems = [], nextUrl = `/playlists/${id}/tracks?limit=100`;
  while (nextUrl) {
    const page = await apiGet(nextUrl);
    if (!page) break;
    trackItems = trackItems.concat(page.items || []);
    nextUrl = page.next ? page.next.replace('https://api.spotify.com/v1', '') : null;
  }

  return {
    id:     data.id,
    name:   data.name,
    cover:  data.images?.[0]?.url || null,
    owner:  data.owner?.display_name || '',
    desc:   data.description || '',
    total:  trackItems.length,
    uri:    data.uri,
    tracks: trackItems.filter(i => i?.track).map(i => ({
      id:         i.track.id,
      name:       i.track.name,
      artist:     i.track.artists.map(a => a.name).join(', '),
      album:      i.track.album.name,
      cover:      i.track.album.images?.[0]?.url || null,
      uri:        i.track.uri,
      durationMs: i.track.duration_ms,
    })),
  };
}

export async function getAlbum(id) {
  const data = await apiGet(`/albums/${id}`);
  if (!data) return null;
  return {
    id:     data.id,
    name:   data.name,
    cover:  data.images?.[0]?.url || null,
    artist: data.artists.map(a => a.name).join(', '),
    year:   data.release_date?.split('-')[0] || '',
    total:  data.total_tracks,
    uri:    data.uri,
    tracks: (data.tracks?.items || []).map(t => ({
      id:         t.id,
      name:       t.name,
      artist:     t.artists.map(a => a.name).join(', '),
      album:      data.name,
      cover:      data.images?.[0]?.url || null,
      uri:        t.uri,
      durationMs: t.duration_ms,
    })),
  };
}

export async function getArtist(id) {
  const [artist, topTracks, albums] = await Promise.all([
    apiGet(`/artists/${id}`),
    apiGet(`/artists/${id}/top-tracks?market=ES`),
    apiGet(`/artists/${id}/albums?include_groups=album,single&limit=20&market=ES`),
  ]);
  if (!artist) return null;
  return {
    id:        artist.id,
    name:      artist.name,
    cover:     artist.images?.[0]?.url || null,
    followers: artist.followers?.total || 0,
    genres:    artist.genres || [],
    uri:       artist.uri,
    topTracks: (topTracks?.tracks || []).map(t => ({
      id:         t.id,
      name:       t.name,
      artist:     t.artists.map(a => a.name).join(', '),
      album:      t.album.name,
      cover:      t.album.images?.[0]?.url || null,
      uri:        t.uri,
      durationMs: t.duration_ms,
    })),
    albums: (albums?.items || []).map(a => ({
      id:    a.id,
      name:  a.name,
      cover: a.images?.[0]?.url || null,
      year:  a.release_date?.split('-')[0] || '',
      type:  a.album_type,
      uri:   a.uri,
    })),
  };
}
