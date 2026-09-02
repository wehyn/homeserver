import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import test from "node:test";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MASKABLE_ICON_PATH = new URL("../public/icon-maskable-512x512.png", import.meta.url);
const CANVAS_SIZE = 512;
const SAFE_ZONE_RADIUS = CANVAS_SIZE * 0.4;
const MAX_FOREGROUND_RADIUS = SAFE_ZONE_RADIUS - 16;
const BACKGROUND = { red: 15, green: 15, blue: 16 };

type Png = {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  pixels: Uint8Array;
};

function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(data: Buffer): Png {
  assert.deepEqual(data.subarray(0, PNG_SIGNATURE.length), PNG_SIGNATURE);

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const imageData: Buffer[] = [];

  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("ascii");
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === "IDAT") {
      imageData.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  assert.equal(bitDepth, 8, "the test decoder expects 8-bit channels");
  assert.equal(colorType, 6, "the maskable icon must be RGBA");

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const filtered = inflateSync(Buffer.concat(imageData));
  const pixels = new Uint8Array(width * height * bytesPerPixel);
  let inputOffset = 0;
  let outputOffset = 0;
  let previousRow = new Uint8Array(stride);

  for (let row = 0; row < height; row += 1) {
    const filter = filtered[inputOffset];
    inputOffset += 1;
    const currentRow = Uint8Array.from(filtered.subarray(inputOffset, inputOffset + stride));
    inputOffset += stride;

    for (let index = 0; index < stride; index += 1) {
      const left = index >= bytesPerPixel ? currentRow[index - bytesPerPixel] : 0;
      const above = previousRow[index];
      const upperLeft = index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
      const predictor = filter === 0
        ? 0
        : filter === 1
          ? left
          : filter === 2
            ? above
            : filter === 3
              ? Math.floor((left + above) / 2)
              : filter === 4
                ? paethPredictor(left, above, upperLeft)
                : undefined;

      assert.notEqual(predictor, undefined, `unsupported PNG filter ${filter}`);
      if (predictor === undefined) throw new Error(`unsupported PNG filter ${filter}`);
      currentRow[index] = (currentRow[index] + predictor) & 0xff;
    }

    pixels.set(currentRow, outputOffset);
    outputOffset += stride;
    previousRow = currentRow;
  }

  return { width, height, bitDepth, colorType, pixels };
}

function pixelAt(png: Png, x: number, y: number) {
  const offset = (y * png.width + x) * 4;
  return {
    red: png.pixels[offset],
    green: png.pixels[offset + 1],
    blue: png.pixels[offset + 2],
    alpha: png.pixels[offset + 3],
  };
}

test("uses a fully opaque 512px RGBA canvas for maskable backgrounds", async () => {
  const png = decodePng(await readFile(MASKABLE_ICON_PATH));

  assert.equal(png.width, CANVAS_SIZE);
  assert.equal(png.height, CANVAS_SIZE);
  for (const corner of [[0, 0], [CANVAS_SIZE - 1, 0], [0, CANVAS_SIZE - 1], [CANVAS_SIZE - 1, CANVAS_SIZE - 1]]) {
    assert.deepEqual(pixelAt(png, corner[0], corner[1]), { ...BACKGROUND, alpha: 255 });
  }

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      assert.equal(pixelAt(png, x, y).alpha, 255, `pixel (${x}, ${y}) is transparent`);
    }
  }
});

test("keeps non-background maskable artwork inside a conservative safe zone", async () => {
  const png = decodePng(await readFile(MASKABLE_ICON_PATH));
  let foregroundPixels = 0;
  let furthestForegroundRadius = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const pixel = pixelAt(png, x, y);
      if (pixel.red === BACKGROUND.red && pixel.green === BACKGROUND.green && pixel.blue === BACKGROUND.blue) continue;
      foregroundPixels += 1;
      furthestForegroundRadius = Math.max(furthestForegroundRadius, Math.hypot(x + 0.5 - 256, y + 0.5 - 256));
    }
  }

  assert.ok(foregroundPixels > 0, "the icon should contain a visible Nimbus emblem");
  assert.ok(
    furthestForegroundRadius <= MAX_FOREGROUND_RADIUS,
    `foreground reaches ${furthestForegroundRadius.toFixed(2)}px, expected at most ${MAX_FOREGROUND_RADIUS}px inside the ${SAFE_ZONE_RADIUS}px safe-zone radius`,
  );
});
