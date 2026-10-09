import RangeDecoder, { PROBABILITY_INITIAL } from '../src/rangeDecoder.js';

// The first byte is always 0x00, then the code's four bytes, then more input
const ZEROS = Buffer.alloc(8);
const ONES = Buffer.from('00ffffffffffffffff', 'hex');

function rangeDecoderOf(input: Buffer): RangeDecoder {
  return new RangeDecoder(input, 0, input.length);
}

describe('constructor', () => {
  it('should throw on fewer than 5 bytes', () => {
    expect(() => new RangeDecoder(Buffer.alloc(8), 2, 6)).toThrow(
      'the chunk is too short for a range decoder',
    );
  });

  it("should throw when the first byte isn't 0x00", () => {
    expect(() => rangeDecoderOf(Buffer.from('0100000000', 'hex'))).toThrow(
      "the range decoder's first byte isn't 0x00",
    );
  });
});

describe('decodeBit', () => {
  it('should decode 0 and raise the probability when the code is below the bound', () => {
    const probabilities = new Uint16Array([PROBABILITY_INITIAL]);
    expect(rangeDecoderOf(ZEROS).decodeBit(probabilities, 0)).toEqual(0);
    expect(probabilities).toEqual(new Uint16Array([PROBABILITY_INITIAL + 32]));
  });

  it('should decode 1 and lower the probability when the code is at or above the bound', () => {
    const probabilities = new Uint16Array([PROBABILITY_INITIAL]);
    expect(rangeDecoderOf(ONES).decodeBit(probabilities, 0)).toEqual(1);
    expect(probabilities).toEqual(new Uint16Array([PROBABILITY_INITIAL - 32]));
  });

  it('should throw when it needs more input than the chunk has', () => {
    const rangeDecoder = rangeDecoderOf(Buffer.alloc(5));
    const probabilities = new Uint16Array(1 << 16).fill(PROBABILITY_INITIAL);
    expect(() => rangeDecoder.decodeBitTree(probabilities, 0, 16)).toThrow(
      'the chunk ended before its data did',
    );
  });
});

describe('decodeBitTree', () => {
  test.each([
    [ZEROS, 0],
    [ONES, 0xff],
  ])('should decode %s to %s', (input, expected) => {
    const probabilities = new Uint16Array(1 << 8).fill(PROBABILITY_INITIAL);
    expect(rangeDecoderOf(input).decodeBitTree(probabilities, 0, 8)).toEqual(expected);
  });
});

describe('decodeReverseBitTree', () => {
  test.each([
    [ZEROS, 0],
    [ONES, 0x0f],
  ])('should decode %s to %s', (input, expected) => {
    const probabilities = new Uint16Array(1 << 4).fill(PROBABILITY_INITIAL);
    expect(rangeDecoderOf(input).decodeReverseBitTree(probabilities, 0, 4)).toEqual(expected);
  });
});

describe('decodeDirectBits', () => {
  test.each([
    [ZEROS, 0],
    [ONES, 0x0f],
  ])('should decode %s to %s', (input, expected) => {
    expect(rangeDecoderOf(input).decodeDirectBits(4)).toEqual(expected);
  });
});

describe('finish', () => {
  it('should accept a range decoder that used its whole chunk and ended at 0', () => {
    expect(() => {
      rangeDecoderOf(Buffer.alloc(5)).finish();
    }).not.toThrow();
  });

  it("should throw when the code isn't 0", () => {
    expect(() => {
      rangeDecoderOf(Buffer.from('0000000001', 'hex')).finish();
    }).toThrow("the range decoder didn't finish cleanly");
  });

  it('should throw when bytes of the chunk are left unused', () => {
    expect(() => {
      rangeDecoderOf(Buffer.alloc(6)).finish();
    }).toThrow('1 bytes of the chunk were left unused');
  });
});
