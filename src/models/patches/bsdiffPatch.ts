import events from 'node:events';
import type { PathLike } from 'node:fs';
import fs from 'node:fs';
import stream from 'node:stream';

import unbzip2Stream from '@openpgp/unbzip2-stream';

import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import type File from '../files/file.js';
import Patch from './patch.js';

interface BSDiffHeader {
  controlLength: number;
  diffLength: number;
  newSize: number;
}

/**
 * Reads exact byte counts from one bzip2-compressed block of a BSDiff patch.
 */
class BSDiffBlockReader {
  private readonly fileStream: stream.Readable;

  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;

  private pending: Buffer = Buffer.alloc(0);

  constructor(filePath: PathLike, start: number, end: number, maxDecompressedBytes?: number) {
    this.fileStream =
      start < end
        ? fs.createReadStream(filePath, { start, end: end - 1 })
        : stream.Readable.from([]);
    this.reader = unbzip2Stream(
      stream.Readable.toWeb(this.fileStream),
      maxDecompressedBytes,
    ).getReader();
  }

  /**
   * Read the next {@link size} decompressed bytes, or fewer if the block ends first.
   */
  async read(size: number): Promise<Buffer> {
    if (this.pending.length >= size) {
      const result = this.pending.subarray(0, size);
      this.pending = this.pending.subarray(size);
      return result;
    }

    const chunks: Buffer[] = [this.pending];
    let length = this.pending.length;
    while (length < size) {
      const { done, value } = await this.reader.read();
      if (done) {
        break;
      }
      chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
      length += value.byteLength;
    }

    const buffer = Buffer.concat(chunks, length);
    this.pending = buffer.subarray(size);
    return buffer.subarray(0, size);
  }

  /**
   * Close the underlying file stream.
   */
  async close(): Promise<void> {
    this.reader.releaseLock();

    // NOTE(cemmer): @openpgp/unbzip2-stream@2.1.0's cancel() calls a nonexistent
    //  `inputReader.abort()`, so destroy the file stream directly instead of cancelling.
    if (this.fileStream.closed) {
      return;
    }
    const closed = events.once(this.fileStream, 'close');
    this.fileStream.destroy();
    await closed;
  }
}

/**
 * @see https://www.daemonology.net/bsdiff/
 * @see https://github.com/freebsd/freebsd-src/blob/main/usr.bin/bsdiff/bspatch/bspatch.c
 */
export default class BSDiffPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.bdf', '.bsdiff'];

  static readonly FILE_SIGNATURE = Buffer.from('BSDIFF40');

  private static readonly HEADER_SIZE = 32;

  private static readonly CONTROL_SIZE = 24;

  /**
   * Parse a .bdf/.bsdiff patch file and return a {@link BSDiffPatch}.
   */
  static async patchFrom(file: File): Promise<BSDiffPatch> {
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    const header = await file.extractToTempIOFile(
      'r',
      async (patchFile) => await this.readHeader(patchFile, file),
    );
    return new BSDiffPatch(file, crcBefore, undefined, header.newSize);
  }

  private static async readHeader(patchFile: IOFile, file: File): Promise<BSDiffHeader> {
    const header = await patchFile.readAt(0, this.HEADER_SIZE);
    if (
      header.length < this.HEADER_SIZE ||
      !header.subarray(0, this.FILE_SIGNATURE.length).equals(this.FILE_SIGNATURE)
    ) {
      throw new IgirException(`BSDiff patch header is invalid: ${file.toString()}`);
    }

    const controlLength = this.readBsdiffInt(header, 8);
    const diffLength = this.readBsdiffInt(header, 16);
    const newSize = this.readBsdiffInt(header, 24);
    if (
      [controlLength, diffLength, newSize].some(
        (value) => !Number.isSafeInteger(value) || value < 0,
      ) ||
      this.HEADER_SIZE + controlLength + diffLength > patchFile.getSize()
    ) {
      throw new IgirException(`BSDiff patch header is invalid: ${file.toString()}`);
    }

    return { controlLength, diffLength, newSize };
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.getFile().extractToTempIOFile('r', async (patchFile) => {
      const header = await BSDiffPatch.readHeader(patchFile, this.getFile());

      await inputRomFile.extractToTempIOFile('r', async (sourceFile) => {
        const targetFile = await IOFile.fileOfSize(outputRomPath, 'r+', header.newSize);
        try {
          await this.applyPatch(patchFile, header, sourceFile, targetFile, callback);
        } finally {
          await targetFile.close();
        }
      });
    });
  }

  private async applyPatch(
    patchFile: IOFile,
    header: BSDiffHeader,
    sourceFile: IOFile,
    targetFile: IOFile,
    callback?: FsReadCallback,
  ): Promise<void> {
    const diffStart = BSDiffPatch.HEADER_SIZE + header.controlLength;
    const extraStart = diffStart + header.diffLength;
    const controlBlock = new BSDiffBlockReader(
      patchFile.getPathLike(),
      BSDiffPatch.HEADER_SIZE,
      diffStart,
    );
    const diffBlock = new BSDiffBlockReader(
      patchFile.getPathLike(),
      diffStart,
      extraStart,
      header.newSize,
    );
    const extraBlock = new BSDiffBlockReader(
      patchFile.getPathLike(),
      extraStart,
      patchFile.getSize(),
      header.newSize,
    );

    try {
      let oldPosition = 0;
      let newPosition = 0;
      while (newPosition < header.newSize) {
        const control = await controlBlock.read(BSDiffPatch.CONTROL_SIZE);
        if (control.length < BSDiffPatch.CONTROL_SIZE) {
          throw this.corruptException();
        }
        const diffLength = BSDiffPatch.readBsdiffInt(control, 0);
        const extraLength = BSDiffPatch.readBsdiffInt(control, 8);
        const seekLength = BSDiffPatch.readBsdiffInt(control, 16);
        if (
          !Number.isSafeInteger(diffLength) ||
          diffLength < 0 ||
          !Number.isSafeInteger(extraLength) ||
          extraLength < 0 ||
          !Number.isSafeInteger(seekLength) ||
          newPosition + diffLength + extraLength > header.newSize
        ) {
          throw this.corruptException();
        }

        // Add the old file's bytes to the diff block's bytes
        for (let written = 0; written < diffLength;) {
          const size = Math.min(diffLength - written, Defaults.FILE_READING_CHUNK_SIZE);
          const diff = await diffBlock.read(size);
          if (diff.length < size) {
            throw this.corruptException();
          }
          const old = await BSDiffPatch.readOld(sourceFile, oldPosition + written, size);
          for (let i = 0; i < size; i += 1) {
            diff[i] = (diff[i] + old[i]) & 0xff;
          }
          await targetFile.write(diff);
          written += size;
        }
        oldPosition += diffLength;
        newPosition += diffLength;

        // Copy the extra block's bytes
        for (let written = 0; written < extraLength;) {
          const size = Math.min(extraLength - written, Defaults.FILE_READING_CHUNK_SIZE);
          const extra = await extraBlock.read(size);
          if (extra.length < size) {
            throw this.corruptException();
          }
          await targetFile.write(extra);
          written += size;
        }
        newPosition += extraLength;

        oldPosition += seekLength;

        if (callback !== undefined) {
          callback(newPosition);
        }
      }
    } finally {
      await Promise.all([controlBlock.close(), diffBlock.close(), extraBlock.close()]);
    }
  }

  /**
   * Read {@link size} bytes from the old file, treating out-of-bounds bytes as zero.
   */
  private static async readOld(
    sourceFile: IOFile,
    position: number,
    size: number,
  ): Promise<Buffer> {
    const old = Buffer.alloc(size);
    const start = Math.max(position, 0);
    const end = Math.min(position + size, sourceFile.getSize());
    if (start < end) {
      (await sourceFile.readAt(start, end - start)).copy(old, start - position);
    }
    return old;
  }

  private corruptException(): IgirException {
    return new IgirException(`BSDiff patch is corrupt: ${this.getFile().toString()}`);
  }
}
