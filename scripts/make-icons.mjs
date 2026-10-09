// One-off: draws the home-screen icons (PNG) with the same "P" mark as app/icon.svg.
// Run with: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";

const svg = (size) => `<!doctype html><body style="margin:0;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">
<rect width="64" height="64" fill="#141414"/>
<text x="32" y="45" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#ffffff">P</text>
</svg></body>`;

const browser = await chromium.launch();
for (const [size, file] of [
  [192, "public/icon-192.png"],
  [512, "public/icon-512.png"],
  [180, "public/apple-touch-icon.png"],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(svg(size));
  await page.screenshot({ path: file });
  await page.close();
}
await browser.close();
console.log("Icons written to public/.");
