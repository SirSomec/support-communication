// Rasterizes public/favicon.svg into the PNG/ICO fallbacks browsers still ask for.
// Run after editing the SVG: node scripts/generate-favicons.mjs
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const publicDir = fileURLToPath(new URL("../public/", import.meta.url));
const svg = await readFile(new URL("favicon.svg", `file://${publicDir}`), "utf8");

const PNG_TARGETS = [
  { size: 180, file: "apple-touch-icon.png" },
  { size: 192, file: "icon-192.png" },
  { size: 512, file: "icon-512.png" }
];
const ICO_SIZES = [16, 32, 48];

const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0">${svg.replace("<svg", `<svg width="${size}" height="${size}"`)}</body>`
  );
  return page.screenshot({ omitBackground: true });
}

for (const { size, file } of PNG_TARGETS) {
  await writeFile(new URL(file, `file://${publicDir}`), await render(size));
}

const icoFrames = [];
for (const size of ICO_SIZES) {
  icoFrames.push({ size, png: await render(size) });
}
await browser.close();

// ICO container with PNG-compressed frames (supported by every browser we target).
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(icoFrames.length, 4);

let offset = header.length + icoFrames.length * 16;
const entries = icoFrames.map(({ size, png }) => {
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // palette colors
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // color planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  offset += png.length;
  return entry;
});

await writeFile(
  new URL("favicon.ico", `file://${publicDir}`),
  Buffer.concat([header, ...entries, ...icoFrames.map((frame) => frame.png)])
);

console.log(`favicon.ico (${ICO_SIZES.join("/")}) + ${PNG_TARGETS.map((t) => t.file).join(", ")}`);
