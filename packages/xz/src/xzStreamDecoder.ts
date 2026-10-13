/**
 * Built on the liblzma ports in this directory, following XZ Utils v5.8.1's
 * `src/liblzma/common/stream_decoder.c`.
 * @see https://github.com/tukaani-project/xz/blob/v5.8.1/src/liblzma/common/stream_decoder.c
 *
 * SPDX-License-Identifier: 0BSD
 * Copyright (C) The XZ Utils authors and contributors
 */

import Lzma2Decoder from './lzma2Decoder.js';
import { readBlockHeader, readStreamHeader } from './xzHeaders.js';

/**
 * Decodes one never-finished xz stream in parts, the way xdelta3 writes its LZMA secondary
 * compression: each part is whole LZMA2 chunks, and only the first part has the stream and
 * block headers.
 */
export default class XzStreamDecoder {
  private lzma2Decoder?: Lzma2Decoder;

  private firstError?: unknown;

  /**
   * Decode the next part of one xz stream, continuing from all state left by earlier calls.
   * Throws unless exactly `outputSize` bytes are produced and all of `input` is consumed. Once a
   * call throws, every later call throws too, because the decoder's state is no longer usable.
   */
  decode(input: Buffer, outputSize: number): Buffer {
    if (this.firstError !== undefined) {
      throw new Error("xz decoder can't continue after an earlier error", {
        cause: this.firstError,
      });
    }
    try {
      return this.decodeNext(input, outputSize);
    } catch (error) {
      this.firstError = error;
      throw error;
    }
  }

  private decodeNext(input: Buffer, outputSize: number): Buffer {
    let offset = 0;
    if (this.lzma2Decoder === undefined) {
      offset = readStreamHeader(input, offset);
      const blockHeader = readBlockHeader(input, offset);
      offset = blockHeader.nextOffset;
      this.lzma2Decoder = new Lzma2Decoder(blockHeader.dictionarySize);
    }

    const output = Buffer.allocUnsafe(outputSize);
    this.lzma2Decoder.decode(input, offset, input.length, output);
    const produced = this.lzma2Decoder.getOutputPosition();
    if (produced !== outputSize) {
      throw new Error(`xz decoder produced ${produced} bytes, expected ${outputSize}`);
    }
    return output;
  }
}
