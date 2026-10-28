/**
 * Optional local design assets.
 *
 * The two Google Drive folders from the project brief are accessible, but
 * browsers/tooling cannot silently add files to the repo. To use the real
 * artwork, download the images and drop them into `src/assets/` using the
 * file-name conventions below — this loader picks them up automatically and
 * every visual slot swaps from its generated fallback to the real asset.
 *
 *   src/assets/hero-gift.png        — hero 3D gift-box render (Ref_01 left)
 *   src/assets/hero-phone.png       — hero phone-in-hand visual (Ref_01 right)
 *   src/assets/iphone-15-pro.png    — prize image (also: apple-watch-series-9,
 *                                      airpods-pro-2, amazon-gift-card,
 *                                      samsung-s24-ultra, playstation-5)
 *   src/assets/logo.png|svg         — VELOOP logo mark
 */

const files = import.meta.glob('../assets/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  query: '?url',
  import: 'default',
});

/**
 * Return the URL for the first asset whose file name contains `key`
 * (case-insensitive), or null when no local asset has been provided yet.
 */
export function asset(key) {
  if (!key) return null;
  const needle = String(key).toLowerCase();
  for (const [path, url] of Object.entries(files)) {
    if (path.toLowerCase().includes(needle)) return url;
  }
  return null;
}
