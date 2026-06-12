// Downloads the GitHub profile avatar + README social cover and generates
// the site avatar, OG cover, and the full favicon set.
//
// Usage: node scripts/gen-assets.mjs

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const PUBLIC = path.resolve('public');
const AVATAR_URL = 'https://github.com/ItayPodhajcer.png?size=512';
const HERO_URL =
	'https://raw.githubusercontent.com/ItayPodhajcer/ItayPodhajcer/main/github-social-preview-shape-only.png';

async function download(url) {
	const res = await fetch(url, { headers: { 'User-Agent': 'asset-fetch' } });
	if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
	return Buffer.from(await res.arrayBuffer());
}

const avatar = await download(AVATAR_URL);
await fs.writeFile(path.join(PUBLIC, 'avatar.png'), avatar);
console.log('avatar.png saved');

try {
	const hero = await download(HERO_URL);
	await fs.writeFile(path.join(PUBLIC, 'og-cover.png'), hero);
	const meta = await sharp(hero).metadata();
	console.log(`og-cover.png saved (${meta.width}x${meta.height})`);
} catch (e) {
	console.warn('og-cover failed:', e.message);
}

// PNG favicons (cover-cropped square)
const pngSizes = {
	'favicon-16x16.png': 16,
	'favicon-32x32.png': 32,
	'apple-touch-icon.png': 180,
	'icon-192.png': 192,
	'icon-512.png': 512,
};
for (const [name, size] of Object.entries(pngSizes)) {
	await sharp(avatar).resize(size, size, { fit: 'cover' }).png().toFile(path.join(PUBLIC, name));
}
console.log('PNG favicons generated');

// Multi-resolution favicon.ico
const icoBuffers = await Promise.all(
	[16, 32, 48].map((s) => sharp(avatar).resize(s, s, { fit: 'cover' }).png().toBuffer()),
);
await fs.writeFile(path.join(PUBLIC, 'favicon.ico'), await pngToIco(icoBuffers));
console.log('favicon.ico generated');

// favicon.svg — round avatar embedded as a data URI
const png64 = await sharp(avatar).resize(64, 64, { fit: 'cover' }).png().toBuffer();
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><clipPath id="c"><circle cx="32" cy="32" r="32"/></clipPath></defs><image href="data:image/png;base64,${png64.toString(
	'base64',
)}" width="64" height="64" clip-path="url(#c)"/></svg>`;
await fs.writeFile(path.join(PUBLIC, 'favicon.svg'), svg);
console.log('favicon.svg generated');
