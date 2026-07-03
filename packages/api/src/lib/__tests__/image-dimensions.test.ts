import { describe, test, expect } from "bun:test";
import { readImageDimensions, hasImageSignature } from "../image-dimensions";

// --- minimal header fixtures, built by construction so they document the format ---

const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u16le = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

function png(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a, // signature
    0x00,
    0x00,
    0x00,
    0x0d,
    0x49,
    0x48,
    0x44,
    0x52, // IHDR length + "IHDR"
    ...u32be(w),
    ...u32be(h),
    0x08,
    0x06,
    0x00,
    0x00,
    0x00, // depth, colour type, ...
  ]);
}

function gif(w: number, h: number): Uint8Array {
  return new Uint8Array([
    0x47,
    0x49,
    0x46,
    0x38,
    0x39,
    0x61, // "GIF89a"
    ...u16le(w),
    ...u16le(h),
    0x00,
    0x00,
  ]);
}

function jpeg(
  w: number,
  h: number,
  opts: { extraSegment?: boolean; progressive?: boolean } = {},
): Uint8Array {
  const sof = opts.progressive ? 0xc2 : 0xc0; // SOF2 (progressive) vs SOF0 (baseline)
  const bytes: number[] = [0xff, 0xd8]; // SOI
  if (opts.extraSegment) {
    bytes.push(0xff, 0xe0, 0x00, 0x04, 0x00, 0x00); // APP0 to skip over (len 4)
  }
  bytes.push(
    0xff,
    sof,
    0x00,
    0x11,
    0x08, // SOFn, length 17, precision 8
    ...u16be(h),
    ...u16be(w),
    0x03,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0, // components padding
  );
  return new Uint8Array(bytes);
}

function webpVP8(w: number, h: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  b.set([0x56, 0x50, 0x38, 0x20], 12); // "VP8 "
  b.set([0x9d, 0x01, 0x2a], 23); // start code
  b.set(u16le(w & 0x3fff), 26);
  b.set(u16le(h & 0x3fff), 28);
  return b;
}

function webpVP8L(w: number, h: number): Uint8Array {
  const b = new Uint8Array(25);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  b.set([0x56, 0x50, 0x38, 0x4c], 12); // "VP8L"
  b[20] = 0x2f;
  const v = ((w - 1) & 0x3fff) + ((h - 1) & 0x3fff) * 0x4000;
  b[21] = v & 0xff;
  b[22] = (v >> 8) & 0xff;
  b[23] = (v >> 16) & 0xff;
  b[24] = Math.floor(v / 0x1000000) & 0xff;
  return b;
}

function webpVP8X(w: number, h: number): Uint8Array {
  const b = new Uint8Array(30);
  b.set([0x52, 0x49, 0x46, 0x46], 0);
  b.set([0x57, 0x45, 0x42, 0x50], 8);
  b.set([0x56, 0x50, 0x38, 0x58], 12); // "VP8X"
  const wm = w - 1;
  const hm = h - 1;
  b.set([wm & 0xff, (wm >> 8) & 0xff, (wm >> 16) & 0xff], 24);
  b.set([hm & 0xff, (hm >> 8) & 0xff, (hm >> 16) & 0xff], 27);
  return b;
}

describe("readImageDimensions - happy path", () => {
  test("PNG", () => {
    expect(readImageDimensions(png(1920, 1080))).toEqual({ width: 1920, height: 1080 });
  });
  test("GIF", () => {
    expect(readImageDimensions(gif(320, 240))).toEqual({ width: 320, height: 240 });
  });
  test("JPEG baseline (SOF0)", () => {
    expect(readImageDimensions(jpeg(800, 600))).toEqual({ width: 800, height: 600 });
  });
  test("WEBP lossy (VP8 )", () => {
    expect(readImageDimensions(webpVP8(100, 200))).toEqual({ width: 100, height: 200 });
  });
  test("WEBP lossless (VP8L)", () => {
    expect(readImageDimensions(webpVP8L(100, 200))).toEqual({ width: 100, height: 200 });
  });
  test("WEBP extended (VP8X)", () => {
    expect(readImageDimensions(webpVP8X(4000, 3000))).toEqual({ width: 4000, height: 3000 });
  });
});

describe("readImageDimensions - edge cases", () => {
  test("progressive JPEG (SOF2)", () => {
    expect(readImageDimensions(jpeg(640, 480, { progressive: true }))).toEqual({
      width: 640,
      height: 480,
    });
  });
  test("JPEG with a preceding segment to skip (APP0)", () => {
    expect(readImageDimensions(jpeg(800, 600, { extraSegment: true }))).toEqual({
      width: 800,
      height: 600,
    });
  });
  test("very wide, non-square image keeps orientation", () => {
    expect(readImageDimensions(png(2560, 100))).toEqual({ width: 2560, height: 100 });
  });
  test("VP8X large 24-bit canvas", () => {
    expect(readImageDimensions(webpVP8X(16384, 16384))).toEqual({ width: 16384, height: 16384 });
  });
});

describe("readImageDimensions - malformed / never-throws", () => {
  test("empty buffer -> null", () => {
    expect(readImageDimensions(new Uint8Array(0))).toBeNull();
  });
  test("truncated PNG header -> null", () => {
    expect(readImageDimensions(png(10, 10).slice(0, 20))).toBeNull();
  });
  test("garbage bytes -> null", () => {
    expect(readImageDimensions(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))).toBeNull();
  });
  test("PNG signature but corrupt IHDR -> null", () => {
    const b = png(10, 10);
    b[12] = 0x00; // break the "IHDR" tag
    expect(readImageDimensions(b)).toBeNull();
  });
  test("JPEG with no SOF marker -> null", () => {
    expect(
      readImageDimensions(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00])),
    ).toBeNull();
  });
  test("zero dimensions rejected -> null", () => {
    expect(readImageDimensions(png(0, 0))).toBeNull();
  });
  test("WEBP with unknown chunk tag -> null", () => {
    const b = webpVP8(10, 10);
    b.set([0x58, 0x58, 0x58, 0x58], 12); // clobber "VP8 " with "XXXX"
    expect(readImageDimensions(b)).toBeNull();
  });
  test("never throws on random / truncated buffers", () => {
    for (let i = 0; i < 100; i++) {
      const len = i * 3;
      const buf = new Uint8Array(len);
      for (let j = 0; j < len; j++) buf[j] = (i * 7 + j * 13) % 256;
      expect(() => readImageDimensions(buf)).not.toThrow();
    }
  });
});

describe("hasImageSignature (upload gate)", () => {
  test("true for each accepted image format", () => {
    expect(hasImageSignature(png(10, 10))).toBe(true);
    expect(hasImageSignature(gif(10, 10))).toBe(true);
    expect(hasImageSignature(jpeg(10, 10))).toBe(true);
    expect(hasImageSignature(webpVP8(10, 10))).toBe(true);
  });

  test("false for HTML / arbitrary / empty bytes", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(hasImageSignature(html)).toBe(false);
    expect(hasImageSignature(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBe(false);
    expect(hasImageSignature(new Uint8Array())).toBe(false);
  });

  test("lenient: accepts a valid signature even when dimensions are unparseable", () => {
    /* valid PNG signature, garbage IHDR - dims can't be read, but a real image
       must never be rejected by the gate, so the signature alone is enough */
    const truncatedPng = new Uint8Array([
      0x89,
      0x50,
      0x4e,
      0x47,
      0x0d,
      0x0a,
      0x1a,
      0x0a,
      ...Array.from({ length: 20 }, () => 0),
    ]);
    expect(readImageDimensions(truncatedPng)).toBeNull();
    expect(hasImageSignature(truncatedPng)).toBe(true);
  });
});
