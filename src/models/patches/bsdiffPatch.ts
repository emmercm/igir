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
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly corruptException: () => IgirException;

  private pending: Buffer = Buffer.alloc(0);

  constructor(
    patchFile: IOFile,
    start: number,
    end: number,
    corruptException: () => IgirException,
    maxDecompressedBytes?: number,
  ) {
    let position = start;
    const compressed = new ReadableStream<Uint8Array>({
      pull: async (controller): Promise<void> => {
        const chunk = await patchFile.readAt(
          position,
          Math.min(end - position, Defaults.FILE_READING_CHUNK_SIZE),
        );
        if (chunk.length === 0) {
          controller.close();
          return;
        }
        position += chunk.length;
        controller.enqueue(chunk);
      },
    });
    this.reader = unbzip2Stream(compressed, maxDecompressedBytes).getReader();
    this.corruptException = corruptException;
  }

  /**
   * Read the next {@link size} decompressed bytes into a new buffer, throwing if the block ends
   * first.
   */
  async read(size: number): Promise<Buffer> {
    const result = Buffer.allocUnsafe(size);
    let length = 0;
    while (length < size) {
      if (this.pending.length === 0) {
        const { done, value } = await this.reader.read();
        if (done) {
          throw this.corruptException();
        }
        this.pending = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      }
      const copied = this.pending.copy(result, length, 0, size - length);
      this.pending = this.pending.subarray(copied);
      length += copied;
    }
    return result;
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
      [controlLength, diffLength, newSize].some((value) => !this.isLength(value)) ||
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
    const corruptException = (): IgirException => this.corruptException();
    const controlBlock = new BSDiffBlockReader(
      patchFile,
      BSDiffPatch.HEADER_SIZE,
      diffStart,
      corruptException,
    );
    const diffBlock = new BSDiffBlockReader(
      patchFile,
      diffStart,
      extraStart,
      corruptException,
      header.newSize,
    );
    const extraBlock = new BSDiffBlockReader(
      patchFile,
      extraStart,
      patchFile.getSize(),
      corruptException,
      header.newSize,
    );

    let oldPosition = 0;
    let newPosition = 0;
    while (newPosition < header.newSize) {
      const control = await controlBlock.read(BSDiffPatch.CONTROL_SIZE);
      const diffLength = BSDiffPatch.readBsdiffInt(control, 0);
      const extraLength = BSDiffPatch.readBsdiffInt(control, 8);
      const seekLength = BSDiffPatch.readBsdiffInt(control, 16);
      if (
        !BSDiffPatch.isLength(diffLength) ||
        !BSDiffPatch.isLength(extraLength) ||
        !Number.isSafeInteger(seekLength) ||
        newPosition + diffLength + extraLength > header.newSize
      ) {
        throw this.corruptException();
      }

      // Add the old file's bytes to the diff block's bytes
      for (let offset = 0; offset < diffLength; offset += Defaults.FILE_READING_CHUNK_SIZE) {
        const diff = await diffBlock.read(
          Math.min(diffLength - offset, Defaults.FILE_READING_CHUNK_SIZE),
        );
        const old = await BSDiffPatch.readOld(sourceFile, oldPosition + offset, diff.length);
        for (let i = 0; i < diff.length; i += 1) {
          // Buffers wrap values mod 256 on assignment
          diff[i] += old[i];
        }
        await targetFile.write(diff);
      }
      oldPosition += diffLength;
      newPosition += diffLength;

      // Copy the extra block's bytes
      for (let offset = 0; offset < extraLength; offset += Defaults.FILE_READING_CHUNK_SIZE) {
        await targetFile.write(
          await extraBlock.read(Math.min(extraLength - offset, Defaults.FILE_READING_CHUNK_SIZE)),
        );
      }
      newPosition += extraLength;

      oldPosition += seekLength;

      if (callback !== undefined) {
        callback(newPosition);
      }
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
    const start = Math.max(position, 0);
    const end = Math.min(position + size, sourceFile.getSize());
    if (start === position && end - start === size) {
      return await sourceFile.readAt(position, size);
    }

    const old = Buffer.alloc(size);
    if (start < end) {
      (await sourceFile.readAt(start, end - start)).copy(old, start - position);
    }
    return old;
  }

  /**
   * @returns if {@link value} is a valid non-negative length
   */
  private static isLength(value: number): boolean {
    return Number.isSafeInteger(value) && value >= 0;
  }

  private corruptException(): IgirException {
    return new IgirException(`BSDiff patch is corrupt: ${this.getFile().toString()}`);
  }
}
