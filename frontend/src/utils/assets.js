/**
 * Optional local design assets.
 *
 * The two Google Drive folders from the project brief are accessible, but
 * browsers/tooling cannot silently add files to the repo. To use the real
 * artwork, download the images and drop them into `src/assets/` using the
 * file-name conventions below — this loader picks them up automatically and
 * every visual slot swaps from its generated fallback to the real asset.
 *
 *   src/assets/hero-collection.webp — home hero product collection (supplied)
 *   src/assets/hero-gift.png        — giveaway hero 3D gift-box render
 *   src/assets/hero-phone.png       — giveaway hero phone-in-hand visual
 *   src/assets/iphone-15-pro.webp   — prize image (also: apple-watch-series-9,
 *                                      airpods-pro-2, amazon-gift-card,
 *                                      samsung-s24-ultra, playstation-5)
 *   src/assets/logo.png|svg         — VELOOP logo mark
 *
 * Supplied product photography (cropped to the prize, no labels or collage):
 *
 *   src/assets/iphone-15-pro.webp        — smartphones
 *   src/assets/headphones.webp          — over-ear headphones
 *   src/assets/earbuds.webp             — `dev-wireless-earbuds` (true-wireless
 *                                           earbud case with buds on a lit plinth)
 *   src/assets/smart-watch.webp         — `dev-smart-watch` (square smartwatch
 *                                           with a sport band on a lit plinth)
 *   src/assets/mechanical-watch.webp    — `dev-mechanical-watch` (gold skeleton
 *                                           mechanical watch on a lit plinth)
 *   src/assets/power-bank.webp          — `dev-power-bank` (gold-and-black power
 *                                           bank on a lit plinth)
 *   src/assets/watch.webp               — steel luxury watch (generic fallback,
 *                                           still serves the
 *                                           `apple-watch-series-9` mock key)
 *   src/assets/designer-handbag.webp    — designer handbag (no prize key yet)
 *
 * A file matches a prize when its name is contained in the prize key (or the
 * key in the file name), so `iphone-15-pro.webp` serves both the `iphone-15-pro`
 * mock key and the `dev-iphone-15-pro` API slug.
 */

const files = import.meta.glob('../assets/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function baseName(path) {
  const file = String(path).split('/').pop() || '';
  return file.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
}

/**
 * Return the URL for the first asset whose file name contains `key`
 * (case-insensitive), or whose name is contained in `key` — the latter lets an
 * asset named for the prize still match a prefixed API slug such as
 * `dev-iphone-15-pro`. Returns null when no local asset has been provided yet.
 */
export function asset(key) {
  if (!key) return null;
  const needle = String(key).toLowerCase();
  for (const [path, url] of Object.entries(files)) {
    const base = baseName(path);
    if (path.toLowerCase().includes(needle) || (base && needle.includes(base))) return url;
  }
  return null;
}
