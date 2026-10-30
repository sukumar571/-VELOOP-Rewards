/** giveawaysApi — public reads for draws and their prize tiers. */
import { get } from './client.js';

/** GET /giveaways?status=&featured=&sort=&order=&page=&limit= */
export async function list(params) {
  const { data, meta } = await get('/giveaways', { query: params });
  return { items: data || [], meta };
}

/** GET /giveaways/:id — full document (404 for an unpublished draw publicly). */
export async function getById(id) {
  const { data } = await get(`/giveaways/${id}`);
  return data;
}

/** GET /giveaways/by-slug/:slug — the stable human key. */
export async function bySlug(slug) {
  const { data } = await get(`/giveaways/by-slug/${encodeURIComponent(slug)}`);
  return data;
}

/** GET /giveaways/:id/prizes — tiers incl. entry fees. */
export async function prizes(id) {
  const { data } = await get(`/giveaways/${id}/prizes`);
  return data || [];
}

/** GET /giveaways/current — the single draw open right now (404 if none). */
export async function current() {
  const { data } = await get('/giveaways/current');
  return data;
}

/** GET /giveaways/previous — finished draws, newest first. */
export async function previous(params) {
  const { data, meta } = await get('/giveaways/previous', { query: params });
  return { items: data || [], meta };
}
