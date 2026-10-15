/**
 * Ported from XZ Utils v5.8.1, `src/liblzma/rangecoder/range_decoder.h` and
 * `src/liblzma/rangecoder/range_common.h`.
 * @see https://github.com/tukaani-project/xz/blob/v5.8.1/src/liblzma/rangecoder/range_decoder.h
 *
 * SPDX-License-Identifier: 0BSD
 * Copyright (C) The XZ Utils authors and contributors
 */

const TOP_VALUE = 1 << 24;
const BIT_MODEL_TOTAL_BITS = 11;
const BIT_MODEL_TOTAL = 1 << BIT_MODEL_TOTAL_BITS;
const MOVE_BITS = 5;

/** The initial value of every probability, an even chance of 0 or 1 */
export const PROBABILITY_INITIAL = BIT_MODEL_TOTAL / 2;

/**
 * An LZMA range decoder over one LZMA2 chunk's compressed bytes. LZMA2 starts a new range
 * decoder for every LZMA chunk.
 */
export default class RangeDecoder {
  private readonly input: Buffer;

  private readonly end: number;

  private position: number;

  private range = 0xff_ff_ff_ff;

  private code = 0;

  constructor(input: Buffer, start: number, end: number) {
    if (end - start < 5) {
      throw new Error('LZMA data is corrupt: the chunk is too short for a range decoder');
    }
    // The first byte is always 0x00
    if (input[start] !== 0x00) {
      throw new Error("LZMA data is corrupt: the range decoder's first byte isn't 0x00");
    }
    this.input = input;
    this.end = end;
    this.position = start + 1;
    for (let i = 0; i < 4; i += 1) {
      this.code = ((this.code << 8) | input[this.position]) >>> 0;
      this.position += 1;
    }
  }

  private normalize(): void {
    if (!(this.range < TOP_VALUE)) {
      return;
    }

    if (this.position >= this.end) {
      throw new Error('LZMA data is corrupt: the chunk ended before its data did');
    }
    this.range = (this.range << 8) >>> 0;
    this.code = ((this.code << 8) | this.input[this.position]) >>> 0;
    this.position += 1;
  }

  /**
   * Decode one bit with the probability at `probabilities[index]`, then adapt that probability.
   */
  decodeBit(probabilities: Uint16Array, index: number): number {
    this.normalize();
    const probability = probabilities[index];
    const bound = (this.range >>> BIT_MODEL_TOTAL_BITS) * probability;
    if (this.code < bound) {
      this.range = bound;
      probabilities[index] = probability + ((BIT_MODEL_TOTAL - probability) >>> MOVE_BITS);
      return 0;
    }
    this.range -= bound;
    this.code -= bound;
    probabilities[index] = probability - (probability >>> MOVE_BITS);
    return 1;
  }

  /**
   * Decode a `bitCount`-bit number, most significant bit first, from the bit tree whose root is
   * at `probabilities[offset + 1]`.
   */
  decodeBitTree(probabilities: Uint16Array, offset: number, bitCount: number): number {
    let symbol = 1;
    for (let i = 0; i < bitCount; i += 1) {
      symbol = (symbol << 1) | this.decodeBit(probabilities, offset + symbol);
    }
    return symbol - (1 << bitCount);
  }

  /**
   * Decode a `bitCount`-bit number, least significant bit first, from the bit tree whose root is
   * at `probabilities[offset + 1]`.
   */
  decodeReverseBitTree(probabilities: Uint16Array, offset: number, bitCount: number): number {
    let symbol = 1;
    let result = 0;
    for (let i = 0; i < bitCount; i += 1) {
      const bit = this.decodeBit(probabilities, offset + symbol);
      symbol = (symbol << 1) | bit;
      result |= bit << i;
    }
    return result;
  }

  /**
   * Decode a `bitCount`-bit number, most significant bit first, where each bit has an even
   * chance of being 0 or 1.
   */
  decodeDirectBits(bitCount: number): number {
    let result = 0;
    for (let i = 0; i < bitCount; i += 1) {
      this.normalize();
      this.range >>>= 1;
      let bit = 0;
      if (this.code >= this.range) {
        this.code -= this.range;
        bit = 1;
      }
      result = result * 2 + bit;
    }
    return result;
  }

  /**
   * Throw unless the range decoder finished cleanly, exactly at the end of its chunk.
   */
  finish(): void {
    // In rare cases there is a useless byte that needs to be read anyway
    this.normalize();
    if (this.code !== 0) {
      throw new Error("LZMA data is corrupt: the range decoder didn't finish cleanly");
    }
    if (this.position !== this.end) {
      throw new Error(
        `LZMA data is corrupt: ${this.end - this.position} bytes of the chunk were left unused`,
      );
    }
  }
}
