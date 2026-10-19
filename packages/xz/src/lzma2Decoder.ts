/**
 * Ported from XZ Utils v5.8.1, `src/liblzma/lzma/lzma2_decoder.c`.
 * @see https://github.com/tukaani-project/xz/blob/v5.8.1/src/liblzma/lzma/lzma2_decoder.c
 *
 * SPDX-License-Identifier: 0BSD
 * Copyright (C) The XZ Utils authors and contributors
 */

import LzDictionary from './lzDictionary.js';
import LzmaDecoder from './lzmaDecoder.js';

const PROPERTIES_MAX = (4 * 5 + 4) * 9 + 8;
const LITERAL_CONTEXT_AND_POSITION_BITS_MAX = 4;

/**
 * An LZMA2 decoder that decodes whole chunks, carrying all state across calls.
 */
export default class Lzma2Decoder {
  private readonly dictionary: LzDictionary;

  private readonly lzmaDecoder = new LzmaDecoder();

  private needDictionaryReset = true;

  private needProperties = true;

  constructor(dictionarySize: number) {
    this.dictionary = new LzDictionary(dictionarySize);
  }

  private readProperties(properties: number): void {
    if (properties > PROPERTIES_MAX) {
      throw new Error(
        `LZMA data is corrupt: the LZMA properties byte 0x${properties.toString(16)} is invalid`,
      );
    }
    const posBits = Math.floor(properties / 45);
    const remainder = properties - posBits * 45;
    const literalPositionBits = Math.floor(remainder / 9);
    const literalContextBits = remainder - literalPositionBits * 9;
    if (literalContextBits + literalPositionBits > LITERAL_CONTEXT_AND_POSITION_BITS_MAX) {
      throw new Error(
        `LZMA data is corrupt: lc=${literalContextBits} plus lp=${literalPositionBits} is more than ${LITERAL_CONTEXT_AND_POSITION_BITS_MAX}`,
      );
    }
    this.lzmaDecoder.setProperties(literalContextBits, literalPositionBits, posBits);
  }

  /**
   * Decode the whole LZMA2 chunks in `input[start, end)` into `output` from its start, continuing
   * the dictionary and LZMA state from the previous call.
   */
  decode(input: Buffer, start: number, end: number, output: Buffer): void {
    this.dictionary.setOutput(output);
    let offset = start;
    while (offset < end) {
      if (this.dictionary.getOutputRemaining() === 0) {
        throw new Error(`xz decoder left ${end - offset} bytes of input unused`);
      }

      const control = input[offset];
      if (control === 0x00) {
        throw new Error('LZMA2 end of data is unsupported');
      }

      if (control >= 0xe0 || control === 0x01) {
        this.needProperties = true;
        this.needDictionaryReset = false;
        this.dictionary.reset();
      } else if (this.needDictionaryReset) {
        throw new Error('LZMA data is corrupt: the first LZMA2 chunk must reset the dictionary');
      }

      if (control >= 0x80) {
        const headerSize = control >= 0xc0 ? 6 : 5;
        if (end - offset < headerSize) {
          throw new Error('xz data ends partway through an LZMA2 chunk header');
        }
        const uncompressedSize = (control & 0x1f) * 0x1_00_00 + input.readUInt16BE(offset + 1) + 1;
        const compressedSize = input.readUInt16BE(offset + 3) + 1;
        if (control >= 0xc0) {
          this.needProperties = false;
          this.readProperties(input[offset + 5]);
        } else if (this.needProperties) {
          throw new Error('LZMA data is corrupt: an LZMA2 chunk needs new properties');
        } else if (control >= 0xa0) {
          this.lzmaDecoder.resetState();
        }
        const dataStart = offset + headerSize;
        const dataEnd = dataStart + compressedSize;
        if (dataEnd > end) {
          throw new Error('xz data ends partway through an LZMA2 chunk');
        }
        this.checkOutputSpace(uncompressedSize);
        this.lzmaDecoder.decodeChunk(input, dataStart, dataEnd, uncompressedSize, this.dictionary);
        offset = dataEnd;
      } else if (control <= 0x02) {
        if (end - offset < 3) {
          throw new Error('xz data ends partway through an LZMA2 chunk header');
        }
        const size = input.readUInt16BE(offset + 1) + 1;
        const dataStart = offset + 3;
        if (dataStart + size > end) {
          throw new Error('xz data ends partway through an LZMA2 chunk');
        }
        this.checkOutputSpace(size);
        this.dictionary.putBytes(input, dataStart, size);
        offset = dataStart + size;
      } else {
        throw new Error(
          `LZMA data is corrupt: the LZMA2 control byte 0x${control.toString(16)} is invalid`,
        );
      }
    }
  }

  private checkOutputSpace(uncompressedSize: number): void {
    const remaining = this.dictionary.getOutputRemaining();
    if (uncompressedSize <= remaining) {
      return;
    }
    const produced = this.dictionary.getOutputPosition() + uncompressedSize;
    throw new Error(
      `xz decoder produced ${produced} bytes, expected ${produced - uncompressedSize + remaining}`,
    );
  }

  /**
   * Get how many bytes the last {@link decode} call produced.
   */
  getOutputPosition(): number {
    return this.dictionary.getOutputPosition();
  }
}
