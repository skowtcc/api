/**
 * dependency-free image dimension reader for the four formats skowt accepts
 * (PNG, JPEG, WEBP, GIF). reads only header bytes; safe to run on untrusted or
 * truncated input.
 *
 * contract: never throws, never loops unboundedly, and returns `null` for
 * anything it cannot confidently parse (unknown signature, truncated header,
 * inconsistent values). a wrong-but-confident result would reserve the wrong
 * layout box, so "unsure" always degrades to `null` and the caller falls back.
 *
 * dispatch is by signature sniff, not the file extension - a mislabeled upload
 * cannot steer the parser to the wrong branch.
 */

export type ImageDimensions = { width: number; height: number };

export function readImageDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (isPng(bytes)) return readPng(bytes);
  if (isGif(bytes)) return readGif(bytes);
  if (isWebp(bytes)) return readWebp(bytes);
  if (isJpeg(bytes)) return readJpeg(bytes);
  return null;
}

/**
 * true if the bytes begin with one of the four accepted image signatures.
 * deliberately looser than `readImageDimensions`: this only checks the magic
 * bytes, so a valid-but-truncated or exotic image (whose dimensions we can't
 * confidently parse) still passes. used as a cheap upload gate - it rejects
 * non-images (HTML/JS/arbitrary bytes) without ever false-rejecting a real
 * image the user actually uploaded.
 */
export function hasImageSignature(bytes: Uint8Array): boolean {
  return isPng(bytes) || isGif(bytes) || isWebp(bytes) || isJpeg(bytes);
}

// bounded sanity check - reject 0, negatives, non-integers, and absurd sizes
function ok(width: number, height: number): ImageDimensions | null {
  if (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width > 0 &&
    height > 0 &&
    width <= 100_000 &&
    height <= 100_000
  ) {
    return { width, height };
  }
  return null;
}

/*
 * all readers below are called only after an explicit length guard, so the
 * indexed reads are in-bounds; the `!` keeps noUncheckedIndexedAccess happy
 */
function u16le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}

function u16be(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}

function u24le(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16);
}

function u32be(b: Uint8Array, o: number): number {
  // avoid the sign flip of `<< 24`
  return b[o]! * 0x1000000 + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!;
}

// --- PNG: 8-byte signature, then IHDR chunk with width/height as u32 BE ---
const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function isPng(b: Uint8Array): boolean {
  return b.length >= 24 && PNG_SIG.every((v, i) => b[i] === v);
}

function readPng(b: Uint8Array): ImageDimensions | null {
  // first chunk must be IHDR ("IHDR" at bytes 12..15); dims at 16 / 20
  if (b[12] !== 0x49 || b[13] !== 0x48 || b[14] !== 0x44 || b[15] !== 0x52) {
    return null;
  }
  return ok(u32be(b, 16), u32be(b, 20));
}

// --- GIF: "GIF87a"/"GIF89a", then logical screen width/height as u16 LE ---
function isGif(b: Uint8Array): boolean {
  return (
    b.length >= 10 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38 &&
    (b[4] === 0x37 || b[4] === 0x39) &&
    b[5] === 0x61
  );
}

function readGif(b: Uint8Array): ImageDimensions | null {
  return ok(u16le(b, 6), u16le(b, 8));
}

// --- JPEG: SOI, then walk segments to the first SOFn marker ---
function isJpeg(b: Uint8Array): boolean {
  return b.length >= 2 && b[0] === 0xff && b[1] === 0xd8;
}

function readJpeg(b: Uint8Array): ImageDimensions | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) {
      i++; // resync past padding / fill bytes
      continue;
    }
    const marker = b[i + 1]!;
    // markers without a length payload
    if (
      marker === 0xd8 || // SOI
      marker === 0xd9 || // EOI
      marker === 0x01 || // TEM
      marker === 0xff || // padding
      (marker >= 0xd0 && marker <= 0xd7) // RSTn
    ) {
      i += 2;
      continue;
    }
    const len = u16be(b, i + 2); // segment length includes the 2 length bytes
    if (len < 2) return null; // malformed
    // SOFn markers carry dimensions: 0xC0..0xCF except DHT/JPG/DAC
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      // segment payload: precision(1), height(u16 BE), width(u16 BE)
      return ok(u16be(b, i + 7), u16be(b, i + 5));
    }
    i += 2 + len; // skip this segment
  }
  return null;
}

// --- WEBP: RIFF container; branch on VP8 / VP8L / VP8X chunk ---
function isWebp(b: Uint8Array): boolean {
  return (
    b.length >= 16 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  );
}

function readWebp(b: Uint8Array): ImageDimensions | null {
  const tag = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);

  if (tag === "VP8 ") {
    // lossy: frame tag(3) + start code 0x9D 0x01 0x2A, then 14-bit dims LE
    if (b.length < 30) return null;
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return ok(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  }

  if (tag === "VP8L") {
    /*
     * lossless: signature 0x2F, then packed 14-bit (width-1) / (height-1).
     * computed with arithmetic (not bitwise) so the 32-bit read never sign-flips
     */
    if (b.length < 25) return null;
    if (b[20] !== 0x2f) return null;
    const v = b[21]! + b[22]! * 0x100 + b[23]! * 0x10000 + b[24]! * 0x1000000;
    const width = (v % 0x4000) + 1;
    const height = (Math.floor(v / 0x4000) % 0x4000) + 1;
    return ok(width, height);
  }

  if (tag === "VP8X") {
    // extended: flags(1) + reserved(3), then 24-bit (canvas-1) width/height LE
    if (b.length < 30) return null;
    return ok(u24le(b, 24) + 1, u24le(b, 27) + 1);
  }

  return null;
}
