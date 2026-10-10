// Renders the app icons from "Jamal Ibn Adam Logo.svg" onto the site's dark background.
// sharp is a dev dependency only; nothing here runs on the live page.
//   node scripts/build-icons.mjs
import fs from 'node:fs';
import sharp from 'sharp';

const root = new URL('../', import.meta.url);
const logo = fs.readFileSync(new URL('Jamal Ibn Adam Logo.svg', root));
const BG = '#121614';
fs.mkdirSync(new URL('icons/', root), { recursive: true });

// the logo centred on an opaque square; `fill` is the share of the side the logo takes
async function icon(name, size, fill) {
  const inner = Math.round(size * fill);
  const art = await sharp(logo, { density: 300 }).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const flat = await sharp({ create: { width: size, height: size, channels: 3, background: BG } })
    .composite([{ input: art, gravity: 'centre' }])
    .png().toBuffer();
  // opaque: no transparency in any icon (iOS paints transparent pixels black)
  await sharp(flat).removeAlpha().png({ compressionLevel: 9 }).toFile(new URL(`icons/${name}`, root).pathname.replace(/%20/g, ' '));
  console.log(`icons/${name}`, `${size}x${size}`);
}

await icon('icon-192.png', 192, 0.8);
await icon('icon-512.png', 512, 0.8);
await icon('icon-maskable-512.png', 512, 0.6);   // safe zone for round and squircle masks
await icon('apple-touch-180.png', 180, 0.8);
