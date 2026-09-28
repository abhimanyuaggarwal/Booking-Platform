// The strip that sits along the bottom of a live: his name, what a sitting is, and the QR she scans.
// Drawn here rather than by a designer so the team can make one for any QR row, in one tap.
// 1920 × 280 is the safe lower third of a 1080p stream (an "L-band" in the studio's words).

const WIDTH = 1920;
const HEIGHT = 280;
const PAD = 36;

export interface BandWords { guruName: string; line: string; call: string }

/** Draws the band and hands back a PNG blob. `qrPng` is a data URL from the qrcode library. */
export async function drawStreamBand(qrPng: string, words: BandWords): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot draw the band. Download the plain QR instead.');

  paint(ctx, words);
  const qr = await loadImage(qrPng);
  const side = HEIGHT - PAD * 2;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(PAD, PAD, side, side);
  ctx.drawImage(qr, PAD + 8, PAD + 8, side - 16, side - 16);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The band could not be saved'))), 'image/png');
  });
}

/** Exported for the test: the words and their places, without a canvas. */
export function bandLayout(words: BandWords) {
  const textLeft = PAD + (HEIGHT - PAD * 2) + 40;
  return {
    width: WIDTH, height: HEIGHT, qr: { x: PAD, y: PAD, side: HEIGHT - PAD * 2 },
    lines: [
      { text: words.guruName, x: textLeft, y: 108, font: '600 62px "Iowan Old Style", Palatino, Georgia, serif', fill: '#231F19' },
      { text: words.line, x: textLeft, y: 168, font: '400 34px system-ui, -apple-system, Helvetica, Arial, sans-serif', fill: '#7C756A' },
      { text: words.call, x: textLeft, y: 224, font: '600 34px system-ui, -apple-system, Helvetica, Arial, sans-serif', fill: '#9C5A2C' },
    ],
  };
}

function paint(ctx: CanvasRenderingContext2D, words: BandWords) {
  const layout = bandLayout(words);
  ctx.fillStyle = '#F4F1EA';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.fillStyle = '#9C5A2C';
  ctx.fillRect(0, 0, layout.width, 6);
  for (const line of layout.lines) {
    ctx.font = line.font;
    ctx.fillStyle = line.fill;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(line.text, line.x, line.y);
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The QR image could not be drawn'));
    img.src = src;
  });
}
