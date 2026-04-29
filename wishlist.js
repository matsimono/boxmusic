/* ══════════════════════════════
   wishlist.js — Supabase integration
   ══════════════════════════════ */

const SUPABASE_URL = 'https://adxupbhawxnktkstszji.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkeHVwYmhhd3hua3Rrc3RzemppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMzQ0MzAsImV4cCI6MjA5MjgxMDQzMH0.-54-eF35xiyQEbQ1ZOgxICtCgZRvFWoP8yd9RzshIJo';

async function sbFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type':  'application/json',
      'Prefer':        'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

export async function getWishlist(userId) {
  const data = await sbFetch(`/wishlist?user_id=eq.${userId}&order=added_at.desc`);
  return data || [];
}

export async function addToWishlist(userId, item) {
  return sbFetch('/wishlist', {
    method: 'POST',
    body: JSON.stringify({
      user_id:    userId,
      spotify_id: item.id,
      type:       item.type,
      name:       item.name,
      cover:      item.cover || null,
      artist:     item.artist || null,
      year:       item.year || null,
      uri:        item.uri || null,
    }),
    headers: { 'Prefer': 'return=representation,resolution=ignore-duplicates' },
  });
}

export async function removeFromWishlist(userId, spotifyId) {
  return sbFetch(`/wishlist?user_id=eq.${userId}&spotify_id=eq.${spotifyId}`, {
    method: 'DELETE',
  });
}

export async function isInWishlist(userId, spotifyId) {
  const data = await sbFetch(`/wishlist?user_id=eq.${userId}&spotify_id=eq.${spotifyId}&select=id`);
  return data && data.length > 0;
}
