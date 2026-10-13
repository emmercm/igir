/**
 * Ported from XZ Utils v5.8.1, `src/liblzma/lz/lz_decoder.h`.
 * @see https://github.com/tukaani-project/xz/blob/v5.8.1/src/liblzma/lz/lz_decoder.h
 *
 * SPDX-License-Identifier: 0BSD
 * Copyright (C) The XZ Utils authors and contributors
 */

const INITIAL_CAPACITY = 64 * 1024;

// Chunks shorter than this are copied a byte at a time
const BULK_COPY_MIN = 32;

/**
 * The LZ sliding-window dictionary. Every byte put into it is also written to the current
 * output buffer. The ring buffer grows on demand, up to the dictionary size.
 */
export default class LzDictionary {
  private readonly dictionarySize: number;

  private buffer = new Uint8Array(0);

  private bufferPosition = 0;

  private full = 0;

  private totalPosition = 0;

  private output: Buffer = Buffer.alloc(0);

  private outputPosition = 0;

  constructor(dictionarySize: number) {
    this.dictionarySize = dictionarySize;
  }

  /**
   * Set the buffer that the following bytes will be written to.
   */
  setOutput(output: Buffer): void {
    this.output = output;
    this.outputPosition = 0;
  }

  /**
   * Get how many bytes have been written to the current output buffer.
   */
  getOutputPosition(): number {
    return this.outputPosition;
  }

  /**
   * Get how many more bytes fit in the current output buffer.
   */
  getOutputRemaining(): number {
    return this.output.length - this.outputPosition;
  }

  /**
   * Forget all history, as an LZMA2 dictionary reset does.
   */
  reset(): void {
    this.bufferPosition = 0;
    this.full = 0;
    this.totalPosition = 0;
  }

  /**
   * Get the number of bytes put since the last reset.
   */
  getTotalPosition(): number {
    return this.totalPosition;
  }

  /**
   * Get the most recently put byte, or 0 if there is none.
   */
  getPreviousByte(): number {
    if (this.full === 0) {
      return 0;
    }
    return this.get(0);
  }

  /**
   * Get the byte `distance + 1` bytes back.
   */
  get(distance: number): number {
    let index = this.bufferPosition - distance - 1;
    if (index < 0) {
      index += this.buffer.length;
    }
    return this.buffer[index];
  }

  /**
   * Return true if a match `distance + 1` bytes back stays within the history.
   */
  isDistanceValid(distance: number): boolean {
    return this.full > distance;
  }

  private grow(): void {
    // Before the buffer reaches the dictionary size it never wraps, so the write position is the
    // number of bytes in it
    const capacity = Math.min(
      this.dictionarySize,
      Math.max(INITIAL_CAPACITY, this.buffer.length * 2),
    );
    const buffer = new Uint8Array(capacity);
    buffer.set(this.buffer.subarray(0, this.bufferPosition));
    this.buffer = buffer;
  }

  /**
   * Make room for the next byte: grow the buffer, or wrap around once it's the dictionary size.
   */
  private prepareWrite(): void {
    if (this.bufferPosition === this.buffer.length) {
      if (this.buffer.length < this.dictionarySize) {
        this.grow();
      } else {
        this.bufferPosition = 0;
      }
    }
  }

  /**
   * Account for `length` bytes just written to the buffer at the write position and to the
   * output.
   */
  private advance(length: number): void {
    this.bufferPosition += length;
    this.full = Math.min(this.full + length, this.dictionarySize);
    this.totalPosition += length;
    this.outputPosition += length;
  }

  /**
   * Append one byte to both the dictionary and the output.
   */
  put(byte: number): void {
    this.prepareWrite();
    this.buffer[this.bufferPosition] = byte;
    this.bufferPosition += 1;
    if (this.full < this.dictionarySize) {
      this.full += 1;
    }
    this.totalPosition += 1;
    this.output[this.outputPosition] = byte;
    this.outputPosition += 1;
  }

  /**
   * Put `length` bytes copied from `distance + 1` bytes back.
   */
  repeat(distance: number, length: number): void {
    let remaining = length;
    while (remaining > 0) {
      this.prepareWrite();
      let sourceIndex = this.bufferPosition - distance - 1;
      if (sourceIndex < 0) {
        sourceIndex += this.buffer.length;
      }
      // Copying at most `distance + 1` bytes keeps the source and destination from overlapping,
      // so a short distance repeats its pattern across chunks
      const chunkLength = Math.min(
        remaining,
        this.buffer.length - this.bufferPosition,
        this.buffer.length - sourceIndex,
        distance + 1,
      );
      if (chunkLength < BULK_COPY_MIN) {
        // Short matches are common, so copy them with a plain loop instead of typed array calls
        for (let i = 0; i < chunkLength; i += 1) {
          const byte = this.buffer[sourceIndex + i];
          this.buffer[this.bufferPosition + i] = byte;
          this.output[this.outputPosition + i] = byte;
        }
      } else {
        this.buffer.copyWithin(this.bufferPosition, sourceIndex, sourceIndex + chunkLength);
        this.output.set(
          this.buffer.subarray(this.bufferPosition, this.bufferPosition + chunkLength),
          this.outputPosition,
        );
      }
      this.advance(chunkLength);
      remaining -= chunkLength;
    }
  }

  /**
   * Put `length` bytes from `input`, starting at `start`.
   */
  putBytes(input: Buffer, start: number, length: number): void {
    let offset = start;
    const end = start + length;
    while (offset < end) {
      this.prepareWrite();
      const chunkLength = Math.min(end - offset, this.buffer.length - this.bufferPosition);
      const chunk = input.subarray(offset, offset + chunkLength);
      this.buffer.set(chunk, this.bufferPosition);
      this.output.set(chunk, this.outputPosition);
      this.advance(chunkLength);
      offset += chunkLength;
    }
  }
}
