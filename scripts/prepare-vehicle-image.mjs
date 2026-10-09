// One-off: trims the white margin off the supplied vehicle illustration and saves it as
// the project asset used by the VehicleImage component. The car itself is never cropped
// or stretched; only empty white space around it is removed.
//   node scripts/prepare-vehicle-image.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const SOURCE = "references/images (2).jpg";
const TARGET = "public/vehicle-illustration.png";
const WHITE_ABOVE = 244; // a pixel counts as background when all its colours are brighter than this
const PADDING = 6;

const dataUrl = `data:image/jpeg;base64,${readFileSync(SOURCE).toString("base64")}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const result = await page.evaluate(
  async ({ dataUrl, WHITE_ABOVE, PADDING }) => {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    let minX = w, minY = h, maxX = 0, maxY = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (data[i] < WHITE_ABOVE || data[i + 1] < WHITE_ABOVE || data[i + 2] < WHITE_ABOVE) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    minX = Math.max(0, minX - PADDING);
    minY = Math.max(0, minY - PADDING);
    maxX = Math.min(w - 1, maxX + PADDING);
    maxY = Math.min(h - 1, maxY + PADDING);
    const cw = maxX - minX + 1;
    const ch = maxY - minY + 1;
    const out = document.createElement("canvas");
    out.width = cw;
    out.height = ch;
    out.getContext("2d").drawImage(img, minX, minY, cw, ch, 0, 0, cw, ch);
    return { width: cw, height: ch, png: out.toDataURL("image/png").split(",")[1] };
  },
  { dataUrl, WHITE_ABOVE, PADDING },
);
writeFileSync(TARGET, Buffer.from(result.png, "base64"));
await browser.close();
console.log(`Saved ${TARGET}: ${result.width}x${result.height}`);
