import QRCode from "qrcode";

/** An inline SVG QR code. Made on the server so no scanner code ships to drivers. */
export async function qrSvg(text: string): Promise<string> {
  return QRCode.toString(text, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
