/**
 * Ported from XZ Utils v5.8.1, `src/liblzma/lzma/lzma_decoder.c` and
 * `src/liblzma/lzma/lzma_common.h`.
 * @see https://github.com/tukaani-project/xz/blob/v5.8.1/src/liblzma/lzma/lzma_decoder.c
 *
 * SPDX-License-Identifier: 0BSD
 * Copyright (C) The XZ Utils authors and contributors
 */

import type LzDictionary from './lzDictionary.js';
import RangeDecoder, { PROBABILITY_INITIAL } from './rangeDecoder.js';

const STATES = 12;
const LITERAL_STATES = 7;
const POS_STATES_MAX = 1 << 4;
const MATCH_LEN_MIN = 2;
const LEN_LOW_BITS = 3;
const LEN_LOW_SYMBOLS = 1 << LEN_LOW_BITS;
const LEN_MID_BITS = 3;
const LEN_MID_SYMBOLS = 1 << LEN_MID_BITS;
const LEN_HIGH_BITS = 8;
const DIST_STATES = 4;
const DIST_SLOT_BITS = 6;
const DIST_SLOTS = 1 << DIST_SLOT_BITS;
const DIST_MODEL_START = 4;
const DIST_MODEL_END = 14;
const FULL_DISTANCES = 1 << (DIST_MODEL_END >>> 1);
const ALIGN_BITS = 4;
const LITERAL_CODER_SIZE = 0x3_00;
const END_OF_PAYLOAD_MARKER = 0xff_ff_ff_ff;

/** The probabilities of one match-length or rep-length decoder */
class LengthDecoder {
  readonly choice = new Uint16Array(2);

  readonly low = new Uint16Array(POS_STATES_MAX * LEN_LOW_SYMBOLS);

  readonly mid = new Uint16Array(POS_STATES_MAX * LEN_MID_SYMBOLS);

  readonly high = new Uint16Array(1 << LEN_HIGH_BITS);

  /**
   * Reset every probability to an even chance.
   */
  reset(): void {
    this.choice.fill(PROBABILITY_INITIAL);
    this.low.fill(PROBABILITY_INITIAL);
    this.mid.fill(PROBABILITY_INITIAL);
    this.high.fill(PROBABILITY_INITIAL);
  }

  /**
   * Decode one match or rep length.
   */
  decode(rangeDecoder: RangeDecoder, posState: number): number {
    if (rangeDecoder.decodeBit(this.choice, 0) === 0) {
      return (
        MATCH_LEN_MIN +
        rangeDecoder.decodeBitTree(this.low, posState * LEN_LOW_SYMBOLS, LEN_LOW_BITS)
      );
    }
    if (rangeDecoder.decodeBit(this.choice, 1) === 0) {
      return (
        MATCH_LEN_MIN +
        LEN_LOW_SYMBOLS +
        rangeDecoder.decodeBitTree(this.mid, posState * LEN_MID_SYMBOLS, LEN_MID_BITS)
      );
    }
    return (
      MATCH_LEN_MIN +
      LEN_LOW_SYMBOLS +
      LEN_MID_SYMBOLS +
      rangeDecoder.decodeBitTree(this.high, 0, LEN_HIGH_BITS)
    );
  }
}

/**
 * An LZMA decoder whose state, reps, and probabilities carry across LZMA2 chunks.
 */
export default class LzmaDecoder {
  private literalContextBits = 0;

  private literalPositionMask = 0;

  private posMask = 0;

  private literal = new Uint16Array(0);

  private readonly isMatch = new Uint16Array(STATES * POS_STATES_MAX);

  private readonly isRep = new Uint16Array(STATES);

  private readonly isRep0 = new Uint16Array(STATES);

  private readonly isRep1 = new Uint16Array(STATES);

  private readonly isRep2 = new Uint16Array(STATES);

  private readonly isRep0Long = new Uint16Array(STATES * POS_STATES_MAX);

  private readonly distSlot = new Uint16Array(DIST_STATES * DIST_SLOTS);

  private readonly posSpecial = new Uint16Array(FULL_DISTANCES - DIST_MODEL_END);

  private readonly align = new Uint16Array(1 << ALIGN_BITS);

  private readonly matchLength = new LengthDecoder();

  private readonly repLength = new LengthDecoder();

  private state = 0;

  private rep0 = 0;

  private rep1 = 0;

  private rep2 = 0;

  private rep3 = 0;

  /**
   * Set the lc/lp/pb properties, then reset the state.
   */
  setProperties(literalContextBits: number, literalPositionBits: number, posBits: number): void {
    this.literalContextBits = literalContextBits;
    this.literalPositionMask = (0x1_00 << literalPositionBits) - (0x1_00 >>> literalContextBits);
    this.posMask = (1 << posBits) - 1;
    this.literal = new Uint16Array(
      LITERAL_CODER_SIZE << (literalContextBits + literalPositionBits),
    );
    this.resetState();
  }

  /**
   * Reset the state, reps, and probabilities, keeping lc/lp/pb.
   */
  resetState(): void {
    this.state = 0;
    this.rep0 = 0;
    this.rep1 = 0;
    this.rep2 = 0;
    this.rep3 = 0;
    this.literal.fill(PROBABILITY_INITIAL);
    this.isMatch.fill(PROBABILITY_INITIAL);
    this.isRep.fill(PROBABILITY_INITIAL);
    this.isRep0.fill(PROBABILITY_INITIAL);
    this.isRep1.fill(PROBABILITY_INITIAL);
    this.isRep2.fill(PROBABILITY_INITIAL);
    this.isRep0Long.fill(PROBABILITY_INITIAL);
    this.distSlot.fill(PROBABILITY_INITIAL);
    this.posSpecial.fill(PROBABILITY_INITIAL);
    this.align.fill(PROBABILITY_INITIAL);
    this.matchLength.reset();
    this.repLength.reset();
  }

  private decodeLiteral(rangeDecoder: RangeDecoder, dictionary: LzDictionary): void {
    // liblzma's literal_subcoder(): after masking and shifting left by lc the value is a multiple
    // of 0x100, so multiplying by 3 makes it a multiple of LITERAL_CODER_SIZE (0x300)
    const base =
      3 *
      ((((dictionary.getTotalPosition() << 8) + dictionary.getPreviousByte()) &
        this.literalPositionMask) <<
        this.literalContextBits);
    let symbol = 1;
    if (this.state < LITERAL_STATES) {
      while (symbol < 0x1_00) {
        symbol = (symbol << 1) | rangeDecoder.decodeBit(this.literal, base + symbol);
      }
    } else {
      let matchByte = dictionary.get(this.rep0) << 1;
      let offset = 0x1_00;
      while (symbol < 0x1_00) {
        const matchBit = matchByte & offset;
        matchByte <<= 1;
        const bit = rangeDecoder.decodeBit(this.literal, base + offset + matchBit + symbol);
        symbol = (symbol << 1) | bit;
        offset &= bit === 0 ? ~matchBit : matchBit;
      }
    }
    dictionary.put(symbol & 0xff);
    if (this.state < 4) {
      this.state = 0;
    } else if (this.state < 10) {
      this.state -= 3;
    } else {
      this.state -= 6;
    }
  }

  private decodeDistance(rangeDecoder: RangeDecoder, length: number): number {
    const distState =
      length < DIST_STATES + MATCH_LEN_MIN ? length - MATCH_LEN_MIN : DIST_STATES - 1;
    const slot = rangeDecoder.decodeBitTree(this.distSlot, distState * DIST_SLOTS, DIST_SLOT_BITS);
    if (slot < DIST_MODEL_START) {
      return slot;
    }
    const limit = (slot >>> 1) - 1;
    const base = 2 | (slot & 1);
    if (slot < DIST_MODEL_END) {
      const distance = base << limit;
      return (
        distance + rangeDecoder.decodeReverseBitTree(this.posSpecial, distance - slot - 1, limit)
      );
    }
    return (
      base * 2 ** limit +
      rangeDecoder.decodeDirectBits(limit - ALIGN_BITS) * (1 << ALIGN_BITS) +
      rangeDecoder.decodeReverseBitTree(this.align, 0, ALIGN_BITS)
    );
  }

  /**
   * Decode one LZMA chunk of `uncompressedSize` bytes from `input[start, end)` into the
   * dictionary. The chunk's compressed data must end exactly at `end`.
   */
  decodeChunk(
    input: Buffer,
    start: number,
    end: number,
    uncompressedSize: number,
    dictionary: LzDictionary,
  ): void {
    const rangeDecoder = new RangeDecoder(input, start, end);
    let remaining = uncompressedSize;
    while (remaining > 0) {
      const posState = dictionary.getTotalPosition() & this.posMask;

      if (rangeDecoder.decodeBit(this.isMatch, this.state * POS_STATES_MAX + posState) === 0) {
        this.decodeLiteral(rangeDecoder, dictionary);
        remaining -= 1;
        continue;
      }

      let length: number;
      if (rangeDecoder.decodeBit(this.isRep, this.state) === 0) {
        // A match with a new distance
        this.state = this.state < LITERAL_STATES ? 7 : 10;
        this.rep3 = this.rep2;
        this.rep2 = this.rep1;
        this.rep1 = this.rep0;
        length = this.matchLength.decode(rangeDecoder, posState);
        this.rep0 = this.decodeDistance(rangeDecoder, length);
        if (this.rep0 === END_OF_PAYLOAD_MARKER) {
          throw new Error("LZMA data is corrupt: LZMA2 chunks can't have an end marker");
        }
        if (!dictionary.isDistanceValid(this.rep0)) {
          throw new Error('LZMA data is corrupt: a match distance is beyond the dictionary');
        }
      } else {
        // A match with a recently used distance
        if (!dictionary.isDistanceValid(0)) {
          throw new Error('LZMA data is corrupt: a repeated match is before any data');
        }
        if (rangeDecoder.decodeBit(this.isRep0, this.state) === 0) {
          if (
            rangeDecoder.decodeBit(this.isRep0Long, this.state * POS_STATES_MAX + posState) === 0
          ) {
            // A short rep: one byte from rep0
            this.state = this.state < LITERAL_STATES ? 9 : 11;
            dictionary.put(dictionary.get(this.rep0));
            remaining -= 1;
            continue;
          }
        } else {
          let distance: number;
          if (rangeDecoder.decodeBit(this.isRep1, this.state) === 0) {
            distance = this.rep1;
          } else {
            if (rangeDecoder.decodeBit(this.isRep2, this.state) === 0) {
              distance = this.rep2;
            } else {
              distance = this.rep3;
              this.rep3 = this.rep2;
            }
            this.rep2 = this.rep1;
          }
          this.rep1 = this.rep0;
          this.rep0 = distance;
        }
        this.state = this.state < LITERAL_STATES ? 8 : 11;
        length = this.repLength.decode(rangeDecoder, posState);
      }

      if (length > remaining) {
        throw new Error('LZMA data is corrupt: a match continues past the end of its chunk');
      }
      dictionary.repeat(this.rep0, length);
      remaining -= length;
    }
    rangeDecoder.finish();
  }
}
