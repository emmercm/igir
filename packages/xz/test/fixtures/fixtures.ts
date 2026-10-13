/**
 * Deterministic pseudo-random bytes (xorshift32), which xz can't compress, so it may store them in
 * uncompressed chunks.
 */
function seededBytes(seed: number, size: number): Buffer {
  const buffer = Buffer.alloc(size);
  let state = seed;
  for (let i = 0; i < size; i += 1) {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    buffer[i] = state & 0xff;
  }
  return buffer;
}

/**
 * Numbered lines of text, which xz compresses well.
 */
function text(prefix: string, size: number): Buffer {
  const lines: string[] = [];
  let length = 0;
  for (let line = 0; length < size; line += 1) {
    const value = `${prefix} line ${line}: the quick brown fox jumps over the lazy dog\n`;
    lines.push(value);
    length += value.length;
  }
  return Buffer.from(lines.join('').slice(0, size));
}

/**
 * Lines of text that repeat a little at a time, so that most matches are a few KiB back.
 */
function repeatingText(size: number): Buffer {
  const lines: string[] = [];
  let length = 0;
  for (let line = 0; length < size; line += 1) {
    const value = `dict line ${line % 997}: the quick brown fox jumps over the lazy dog ${(line * 7919) % 10_007}\n`;
    lines.push(value);
    length += value.length;
  }
  return Buffer.from(lines.join('').slice(0, size));
}

export interface Fixture {
  /** The xz CLI's `--lzma2` option */
  lzma2Options: string;
  /** The fixture's uncompressed contents */
  input: () => Buffer;
}

/** The fixtures in this directory, by file name */
export const FIXTURES: Record<string, Fixture> = {
  // 8 KiB of pseudo-random bytes, then the same 8 KiB again, so one match is 8 KiB back
  'distantMatch.xz': {
    lzma2Options: 'preset=6',
    input: () => {
      const block = seededBytes(0x78_7c, 8 * 1024);
      return Buffer.concat([block, block]);
    },
  },
  // An uncompressed chunk with a dictionary reset (0x01), an LZMA chunk with new properties
  // (0xC0-0xDF), then an LZMA chunk without any reset (0x80-0x9F)
  'randomFirst.xz': {
    lzma2Options: 'preset=6',
    input: () =>
      Buffer.concat([seededBytes(0x78_7a, 66 * 1024), text('random', 2.5 * 1024 * 1024)]),
  },
  // An LZMA chunk with a dictionary reset (0xE0-0xFF), an uncompressed chunk without one (0x02),
  // then an LZMA chunk with a state reset (0xA0-0xBF)
  'randomMiddle.xz': {
    lzma2Options: 'preset=6',
    input: () =>
      Buffer.concat([
        text('before', 1024 * 1024),
        seededBytes(0x78_7b, 128 * 1024),
        text('after', 1024 * 1024),
      ]),
  },
  // A 4 KiB dictionary, the smallest xz allows, which the output wraps around many times
  'smallDictionary.xz': {
    lzma2Options: 'preset=6,dict=4KiB',
    input: () => repeatingText(300 * 1024),
  },
};
