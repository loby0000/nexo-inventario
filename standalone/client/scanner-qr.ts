import QRCode from "qrcode";
import {
  QRCodeReader,
  BinaryBitmap,
  HybridBinarizer,
  RGBLuminanceSource,
} from "@zxing/library";
// Some dense matrices confuse ZXing's finder-pattern detector. Check the
// actual rendered modules (with detection enabled), trying the standard masks.
export function pairingMask(text: string): QRCode.QRCodeMaskPattern {
  const initial = QRCode.create(text, {
    errorCorrectionLevel: "M",
  }).maskPattern!;
  for (const maskPattern of [
    initial,
    ...Array.from({ length: 8 }, (_, i) => i).filter((i) => i !== initial),
  ]) {
    const qr = QRCode.create(text, {
        errorCorrectionLevel: "M",
        maskPattern: maskPattern as QRCode.QRCodeMaskPattern,
      }),
      width = (qr.modules.size + 8) * 6,
      pixels = new Uint8ClampedArray(width * width).fill(255);
    for (let y = 0; y < width; y++)
      for (let x = 0; x < width; x++) {
        const r = Math.floor(y / 6) - 4,
          c = Math.floor(x / 6) - 4;
        if (
          r >= 0 &&
          c >= 0 &&
          r < qr.modules.size &&
          c < qr.modules.size &&
          qr.modules.get(r, c)
        )
          pixels[y * width + x] = 0;
      }
    try {
      const read = new QRCodeReader().decode(
        new BinaryBitmap(
          new HybridBinarizer(new RGBLuminanceSource(pixels, width, width)),
        ),
      );
      if (read.getText() === text)
        return maskPattern as QRCode.QRCodeMaskPattern;
    } catch {
      /* Try another standard QR mask, never weaken verification. */
    }
  }
  throw Error("No pudimos preparar un QR legible. Genera otro QR.");
}
