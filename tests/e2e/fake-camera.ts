import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import QRCode from "qrcode";

const W = 640;
const H = 480;

/**
 * Writes a short looping video of one QR code (a Y4M file) and returns the Chromium flags that make the browser's
 * camera play it. That lets a test "hold a phone up" to a sign with no real camera. Pass no text for a blank wall.
 */
export function fakeCameraArgs(name: string, text?: string): string[] {
  const y = Buffer.alloc(W * H, 235); // white
  if (text) {
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const quiet = 4;
    const scale = Math.floor(400 / (n + quiet * 2));
    const size = (n + quiet * 2) * scale;
    const left = Math.floor((W - size) / 2);
    const top = Math.floor((H - size) / 2);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!qr.modules.get(r, c)) continue;
        for (let dy = 0; dy < scale; dy++) {
          const row = top + (r + quiet) * scale + dy;
          const start = row * W + left + (c + quiet) * scale;
          y.fill(16, start, start + scale);
        }
      }
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128);
  const frames = [];
  for (let i = 0; i < 10; i++) frames.push(Buffer.from("FRAME\n"), y, chroma);
  const file = path.join(os.tmpdir(), `fake-camera-${name}.y4m`);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), ...frames]));
  return [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${file}`,
  ];
}
