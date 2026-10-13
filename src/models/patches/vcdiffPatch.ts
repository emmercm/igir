import type { PathLike } from 'node:fs';

import { XzStreamDecoder } from '../../../packages/xz/index.js';
import IgirException from '../../exceptions/igirException.js';
import IOFile from '../../models/files/ioFile.js';
import type { FsReadCallback } from '../../streams/fsReadTransform.js';
import type File from '../files/file.js';
import Patch from './patch.js';

/** xdelta3's secondary compressor IDs */
const VcdiffSecondaryCompression = {
  DJW_STATIC_HUFFMAN: 1,
  LZMA: 2,
  FGK_ADAPTIVE_HUFFMAN: 16,
} as const;

const VcdiffHdrIndicator = {
  DECOMPRESS: 0x01,
  CODETABLE: 0x02,
  APPHEADER: 0x04,
} as const;

const VcdiffWinIndicator = {
  SOURCE: 0x01,
  TARGET: 0x02,
  ADLER32: 0x04,
} as const;

const VcdiffDeltaIndicator = {
  DATACOMP: 0x01,
  INSTCOMP: 0x02,
  ADDRCOMP: 0x04,
} as const;

const VcdiffCopyAddressMode = {
  SELF: 0,
  HERE: 1,
  // s_near "near modes"
  // s_same "same modes"
};
type VcdiffCopyAddressModeValue =
  (typeof VcdiffCopyAddressMode)[keyof typeof VcdiffCopyAddressMode];

const VcdiffInstruction = {
  NOOP: 0,
  ADD: 1,
  RUN: 2,
  COPY: 3,
} as const;
type VcdiffInstructionValue = (typeof VcdiffInstruction)[keyof typeof VcdiffInstruction];

interface VcdiffDeltaInstruction {
  type: VcdiffInstructionValue;
  size: number;
  mode: VcdiffCopyAddressModeValue;
}

/**
 * {@link Pick} the methods {@link Keys} of {@link Type}, letting each one that returns a promise
 * return its value directly instead, so in-memory implementations don't have to be async.
 */
type PickSyncOrAsync<Type, Keys extends keyof Type> = {
  [Key in Keys]: Type[Key] extends (...args: infer Args) => Promise<infer Result>
    ? (...args: Args) => Result | Promise<Result>
    : Type[Key];
};

/** The parts of {@link IOFile} that reading a VCDIFF delta's header and windows uses */
type VcdiffPatchFile = PickSyncOrAsync<IOFile, 'getPathLike' | 'isEOF' | 'readNext' | 'skipNext'>;

/** The parts of {@link IOFile} that applying a VCDIFF window to a source and target uses */
type VcdiffWindowFile = PickSyncOrAsync<IOFile, 'readAt' | 'writeAt'>;

/**
 * Read a VCDIFF variable-length unsigned integer from a buffer starting at the given offset,
 * returning the value and the new offset past the encoded bytes.
 */
function readVcdiffUintFromBuffer(buffer: Buffer, offset = 0): [number, number] {
  let num = 0;

  let lastOffset = offset;
  while (lastOffset < buffer.length) {
    const bits = buffer.readUInt8(lastOffset);
    lastOffset += 1;
    num = (num << 7) + (bits & 0x7f);
    if (!(bits & 0x80)) {
      // left-most bit is telling us to keep going
      break;
    }
  }

  return [num, lastOffset];
}

/**
 * Reads a VCDIFF delta's header and windows from a patch file, or from the in-memory nested delta
 * that encodes an application-defined code table.
 */
class VcdiffPatchReader {
  private readonly file: VcdiffPatchFile;

  constructor(file: VcdiffPatchFile) {
    this.file = file;
  }

  /**
   * Get the path of the patch being read, for error messages.
   */
  getPathLike(): PathLike {
    return this.file.getPathLike();
  }

  /**
   * Returns true if the read position has reached the end of the patch.
   */
  isEOF(): boolean {
    return this.file.isEOF();
  }

  /**
   * Read the next `size` bytes, advancing the read position.
   */
  async readNext(size: number): Promise<Buffer> {
    return await this.file.readNext(size);
  }

  /**
   * Advance the read position by `size` bytes.
   */
  skipNext(size: number): void {
    this.file.skipNext(size);
  }

  /**
   * Read one byte of a VCDIFF header or window header, throwing if the patch ends first.
   */
  async readByte(): Promise<number> {
    const byte = await this.file.readNext(1);
    if (byte.length !== 1) {
      throw new IgirException(`Vcdiff patch is truncated: ${this.getPathLike().toString()}`);
    }
    return byte.readUInt8();
  }

  /**
   * Read a VCDIFF variable-length unsigned integer, advancing the read position past the encoded
   * value.
   */
  async readUint(): Promise<number> {
    let num = 0;

    while (!this.file.isEOF()) {
      const bits = (await this.file.readNext(1)).readUInt8();
      num = (num << 7) + (bits & 0x7f);
      if (!(bits & 0x80)) {
        // left-most bit is telling us to keep going
        break;
      }
    }

    return num;
  }
}

const CODE_TABLE_ENTRIES = 256;
// RFC 3284 section 7: inst1, inst2, size1, size2, mode1, mode2
const CODE_TABLE_STRING_SIZE = 6 * CODE_TABLE_ENTRIES;

/**
 * An in-memory source for a {@link VcdiffPatchReader}, and a {@link VcdiffWindowFile}, over a
 * buffer, for the nested delta that encodes an application-defined code table.
 */
class VcdiffBuffer {
  readonly buffer: Buffer;

  private readonly pathLike: PathLike;

  private position = 0;

  constructor(buffer: Buffer, pathLike: PathLike) {
    this.buffer = buffer;
    this.pathLike = pathLike;
  }

  /**
   * Get the path of the patch this buffer came from, for error messages.
   */
  getPathLike(): PathLike {
    return this.pathLike;
  }

  /**
   * Returns true if the read position has reached the end of the buffer.
   */
  isEOF(): boolean {
    return this.position >= this.buffer.length;
  }

  /**
   * Read the next `size` bytes, advancing the read position.
   */
  readNext(size: number): Buffer {
    const result = this.readAt(this.position, size);
    this.position += size;
    return result;
  }

  /**
   * Advance the read position by `size` bytes.
   */
  skipNext(size: number): void {
    this.position += size;
  }

  /**
   * Read `size` bytes at `position`, or fewer at the end of the buffer.
   */
  readAt(position: number, size: number): Buffer {
    return Buffer.from(this.buffer.subarray(position, position + size));
  }

  /**
   * Write `buffer` at `position`, throwing if it doesn't fit.
   */
  writeAt(buffer: Buffer, position: number): number {
    if (position + buffer.length > this.buffer.length) {
      throw new IgirException(
        `Vcdiff code table delta writes past ${this.buffer.length} bytes: ${this.pathLike.toString()}`,
      );
    }
    return buffer.copy(this.buffer, position);
  }
}

type VcdiffSection = 'data' | 'instructions' | 'addresses';

/**
 * xdelta3's LZMA secondary compression. Each section type is one never-finished xz stream that
 * continues from window to window, and each compressed section is a VCDIFF integer holding the
 * decompressed size, followed by that stream's next whole LZMA2 chunks.
 * @see https://github.com/jmacd/xdelta/blob/v3.2.2/xdelta3/xdelta3-lzma.h
 */
class VcdiffSecondaryDecompressor {
  private readonly decoders = new Map<VcdiffSection, XzStreamDecoder>();

  /**
   * Decompress one window's compressed section, continuing that section type's xz stream.
   */
  decompress(section: VcdiffSection, data: Buffer): Buffer {
    const [size, offset] = readVcdiffUintFromBuffer(data);
    if (size === 0) {
      throw new Error('Vcdiff secondary-compressed section has an invalid size of 0');
    }
    let decoder = this.decoders.get(section);
    if (decoder === undefined) {
      decoder = new XzStreamDecoder();
      this.decoders.set(section, decoder);
    }
    // TODO(cemmer): consider chunking/streaming
    return decoder.decode(data.subarray(offset), size);
  }
}

/**
 * The parsed VCDIFF header — the secondary decompressor selection and the instruction code
 * table used to interpret the patch body.
 */
class VcdiffHeader {
  static readonly FILE_SIGNATURE = Buffer.from('d6c3c4', 'hex');

  private static readonly DEFAULT_S_NEAR = 4;

  private static readonly DEFAULT_S_SAME = 3;

  private static readonly DEFAULT_CODE_TABLE = ((): VcdiffDeltaInstruction[][] => {
    const entries: VcdiffDeltaInstruction[][] = [
      [
        { type: VcdiffInstruction.RUN, size: 0, mode: 0 },
        { type: VcdiffInstruction.NOOP, size: 0, mode: 0 },
      ],
    ];

    // ADD+NOOP
    for (let sizeToAdd = 0; sizeToAdd <= 17; sizeToAdd += 1) {
      entries.push([
        { type: VcdiffInstruction.ADD, size: sizeToAdd, mode: 0 },
        { type: VcdiffInstruction.NOOP, size: 0, mode: 0 },
      ]);
    }

    // COPY+NOOP
    for (let copyMode = 0; copyMode <= 8; copyMode += 1) {
      entries.push([
        { type: VcdiffInstruction.COPY, size: 0, mode: copyMode },
        { type: VcdiffInstruction.NOOP, size: 0, mode: 0 },
      ]);
      for (let copySize = 4; copySize <= 18; copySize += 1) {
        entries.push([
          {
            type: VcdiffInstruction.COPY,
            size: copySize,
            mode: copyMode,
          },
          { type: VcdiffInstruction.NOOP, size: 0, mode: 0 },
        ]);
      }
    }

    // ADD+COPY
    for (let copyMode = 0; copyMode <= 5; copyMode += 1) {
      for (let sizeToAdd = 1; sizeToAdd <= 4; sizeToAdd += 1) {
        for (let copySize = 4; copySize <= 6; copySize += 1) {
          entries.push([
            { type: VcdiffInstruction.ADD, size: sizeToAdd, mode: 0 },
            {
              type: VcdiffInstruction.COPY,
              size: copySize,
              mode: copyMode,
            },
          ]);
        }
      }
    }
    for (let copyMode = 6; copyMode <= 8; copyMode += 1) {
      for (let sizeToAdd = 1; sizeToAdd <= 4; sizeToAdd += 1) {
        entries.push([
          { type: VcdiffInstruction.ADD, size: sizeToAdd, mode: 0 },
          { type: VcdiffInstruction.COPY, size: 4, mode: copyMode },
        ]);
      }
    }

    // COPY+ADD
    for (let copyMode = 0; copyMode <= 8; copyMode += 1) {
      entries.push([
        { type: VcdiffInstruction.COPY, size: 4, mode: copyMode },
        { type: VcdiffInstruction.ADD, size: 1, mode: 0 },
      ]);
    }

    return entries;
  })();

  /** RFC 3284 section 7: the default code table as six 256-byte arrays */
  private static readonly DEFAULT_CODE_TABLE_STRING = ((): Buffer => {
    const codeTableString = Buffer.alloc(CODE_TABLE_STRING_SIZE);
    for (const [index, entry] of VcdiffHeader.DEFAULT_CODE_TABLE.entries()) {
      for (const [slot, instruction] of entry.entries()) {
        codeTableString.writeUInt8(instruction.type, slot * CODE_TABLE_ENTRIES + index);
        codeTableString.writeUInt8(instruction.size, (2 + slot) * CODE_TABLE_ENTRIES + index);
        codeTableString.writeUInt8(instruction.mode, (4 + slot) * CODE_TABLE_ENTRIES + index);
      }
    }
    return codeTableString;
  })();

  readonly codeTable: VcdiffDeltaInstruction[][];

  readonly sNear: number;

  readonly sSame: number;

  readonly secondaryDecompressor: VcdiffSecondaryDecompressor | undefined;

  constructor(
    codeTable: VcdiffDeltaInstruction[][],
    sNear: number,
    sSame: number,
    secondaryDecompressor: VcdiffSecondaryDecompressor | undefined,
  ) {
    this.codeTable = codeTable;
    this.sNear = sNear;
    this.sSame = sSame;
    this.secondaryDecompressor = secondaryDecompressor;
  }

  /**
   * Read and validate the VCDIFF header from the patch file, advancing the read position past
   * it.
   */
  static async fromIOFile(patchFile: VcdiffPatchReader): Promise<VcdiffHeader> {
    const hdrIndicator = await this.readIndicator(patchFile);

    let secondaryDecompressor: VcdiffSecondaryDecompressor | undefined;
    if (hdrIndicator & VcdiffHdrIndicator.DECOMPRESS) {
      const compressorId = await patchFile.readByte();
      secondaryDecompressor = this.secondaryDecompressorOf(
        compressorId,
        patchFile.getPathLike().toString(),
      );
    }

    let codeTable = this.DEFAULT_CODE_TABLE;
    let sNear = this.DEFAULT_S_NEAR;
    let sSame = this.DEFAULT_S_SAME;
    if (hdrIndicator & VcdiffHdrIndicator.CODETABLE) {
      ({ codeTable, sNear, sSame } = await this.readCodeTable(patchFile));
    }

    await this.skipAppHeader(patchFile, hdrIndicator);

    return new VcdiffHeader(codeTable, sNear, sSame, secondaryDecompressor);
  }

  /**
   * Read the file signature and version, returning the header indicator byte.
   */
  private static async readIndicator(patchFile: VcdiffPatchReader): Promise<number> {
    const header = await patchFile.readNext(3);
    if (!header.equals(this.FILE_SIGNATURE)) {
      throw new IgirException(
        `Vcdiff patch header is invalid: ${patchFile.getPathLike().toString()}`,
      );
    }
    patchFile.skipNext(1); // version
    return await patchFile.readByte();
  }

  private static async skipAppHeader(
    patchFile: VcdiffPatchReader,
    hdrIndicator: number,
  ): Promise<void> {
    if (!(hdrIndicator & VcdiffHdrIndicator.APPHEADER)) {
      return;
    }

    const appHeaderLength = await patchFile.readUint();
    patchFile.skipNext(appHeaderLength);
  }

  /**
   * Read an RFC 3284 section 7 application-defined code table: `s_near`, `s_same`, then a
   * VCDIFF delta that turns the default code table string into the new one.
   */
  private static async readCodeTable(
    patchFile: VcdiffPatchReader,
  ): Promise<Pick<VcdiffHeader, 'codeTable' | 'sNear' | 'sSame'>> {
    const patchPath = patchFile.getPathLike().toString();
    const codeTableLength = await patchFile.readUint();
    if (codeTableLength <= 2) {
      throw new IgirException(
        `Vcdiff code table length ${codeTableLength} is invalid: ${patchPath}`,
      );
    }
    const codeTableData = await patchFile.readNext(codeTableLength);
    if (codeTableData.length !== codeTableLength) {
      throw new IgirException(`Vcdiff code table is truncated: ${patchPath}`);
    }
    const sNear = codeTableData.readUInt8(0);
    const sSame = codeTableData.readUInt8(1);

    const delta = new VcdiffPatchReader(
      new VcdiffBuffer(codeTableData.subarray(2), patchFile.getPathLike()),
    );
    const deltaIndicator = await this.readIndicator(delta);
    if (deltaIndicator & (VcdiffHdrIndicator.DECOMPRESS | VcdiffHdrIndicator.CODETABLE)) {
      throw new IgirException(
        `Vcdiff code table delta can't use secondary compression or another code table: ${patchPath}`,
      );
    }
    await this.skipAppHeader(delta, deltaIndicator);

    const source = new VcdiffBuffer(this.DEFAULT_CODE_TABLE_STRING, patchFile.getPathLike());
    const target = new VcdiffBuffer(Buffer.alloc(CODE_TABLE_STRING_SIZE), patchFile.getPathLike());
    const copyCache = new VcdiffCache(this.DEFAULT_S_NEAR, this.DEFAULT_S_SAME);
    let targetWindowPosition = 0;
    while (!delta.isEOF()) {
      const window = await VcdiffWindow.fromIOFile(delta);
      copyCache.reset();
      await window.apply(source, target, this.DEFAULT_CODE_TABLE, copyCache, targetWindowPosition);
      targetWindowPosition += window.deltaEncodingTargetWindowSize;
    }
    if (targetWindowPosition !== CODE_TABLE_STRING_SIZE) {
      throw new IgirException(
        `Vcdiff code table decodes to ${targetWindowPosition} bytes, expected ${CODE_TABLE_STRING_SIZE}: ${patchPath}`,
      );
    }

    return {
      codeTable: this.parseCodeTable(target.buffer, sNear, sSame, patchPath),
      sNear,
      sSame,
    };
  }

  /**
   * Turn an RFC 3284 section 7 code table string into instructions, validating every type and
   * COPY mode.
   */
  private static parseCodeTable(
    codeTableString: Buffer,
    sNear: number,
    sSame: number,
    patchPath: string,
  ): VcdiffDeltaInstruction[][] {
    const modeCount = 2 + sNear + sSame;
    const codeTable: VcdiffDeltaInstruction[][] = [];
    for (let index = 0; index < CODE_TABLE_ENTRIES; index += 1) {
      const entry: VcdiffDeltaInstruction[] = [];
      for (let slot = 0; slot <= 1; slot += 1) {
        const typeByte = codeTableString.readUInt8(slot * CODE_TABLE_ENTRIES + index);
        const size = codeTableString.readUInt8((2 + slot) * CODE_TABLE_ENTRIES + index);
        const mode = codeTableString.readUInt8((4 + slot) * CODE_TABLE_ENTRIES + index);
        const type = Object.values(VcdiffInstruction).find((value) => value === typeByte);
        if (type === undefined) {
          throw new IgirException(
            `Vcdiff code table entry ${index} has an invalid instruction type ${typeByte}: ${patchPath}`,
          );
        }
        if (type === VcdiffInstruction.COPY && mode >= modeCount) {
          throw new IgirException(
            `Vcdiff code table entry ${index} has an invalid COPY mode ${mode}: ${patchPath}`,
          );
        }
        entry.push({ type, size, mode });
      }
      codeTable.push(entry);
    }
    return codeTable;
  }

  private static secondaryDecompressorOf(
    compressorId: number,
    patchPath: string,
  ): VcdiffSecondaryDecompressor {
    switch (compressorId) {
      case VcdiffSecondaryCompression.LZMA: {
        return new VcdiffSecondaryDecompressor();
      }
      case VcdiffSecondaryCompression.DJW_STATIC_HUFFMAN: {
        throw new IgirException(
          `Vcdiff secondary compressor DJW (static Huffman) isn't supported, re-create the patch with "xdelta3 -S lzma" or "xdelta3 -S none": ${patchPath}`,
        );
      }
      case VcdiffSecondaryCompression.FGK_ADAPTIVE_HUFFMAN: {
        throw new IgirException(
          `Vcdiff secondary compressor FGK (adaptive Huffman) isn't supported, re-create the patch with "xdelta3 -S lzma" or "xdelta3 -S none": ${patchPath}`,
        );
      }
      default: {
        throw new IgirException(
          `unknown Vcdiff secondary compressor ID ${compressorId}: ${patchPath}`,
        );
      }
    }
  }
}

/**
 * A single delta-encoded window within a VCDIFF patch, holding the adds/runs, instructions,
 * and copy-address sections together with the source segment that they reference.
 */
class VcdiffWindow {
  readonly winIndicator: number;

  readonly sourceSegmentSize: number;

  readonly sourceSegmentPosition: number;

  readonly deltaEncodingTargetWindowSize: number;

  private targetWindowOffset = 0;

  private addsAndRunsOffset = 0;

  readonly addsAndRunsData: Buffer;

  private instructionsAndSizeOffset = 0;

  readonly instructionsAndSizesData: Buffer;

  private copyAddressesOffset = 0;

  readonly copyAddressesData: Buffer;

  private constructor(
    winIndicator: number,
    sourceSegmentSize: number,
    sourceSegmentPosition: number,
    deltaEncodingTargetWindowSize: number,
    addsAndRunsData: Buffer,
    instructionsAndSizesData: Buffer,
    copyAddressesData: Buffer,
  ) {
    this.winIndicator = winIndicator;
    this.sourceSegmentSize = sourceSegmentSize;
    this.sourceSegmentPosition = sourceSegmentPosition;
    this.deltaEncodingTargetWindowSize = deltaEncodingTargetWindowSize;
    this.addsAndRunsData = addsAndRunsData;
    this.instructionsAndSizesData = instructionsAndSizesData;
    this.copyAddressesData = copyAddressesData;
  }

  /**
   * Read a single VCDIFF window from the patch file, advancing the read position past it.
   */
  static async fromIOFile(
    patchFile: VcdiffPatchReader,
    secondaryDecompressor?: VcdiffSecondaryDecompressor,
  ): Promise<VcdiffWindow> {
    const winIndicator = await patchFile.readByte();
    let sourceSegmentSize = 0;
    let sourceSegmentPosition = 0;
    if (winIndicator & (VcdiffWinIndicator.SOURCE | VcdiffWinIndicator.TARGET)) {
      sourceSegmentSize = await patchFile.readUint();
      sourceSegmentPosition = await patchFile.readUint();
    }

    await patchFile.readUint(); // delta encoding length
    const deltaEncodingTargetWindowSize = await patchFile.readUint();
    const deltaEncodingIndicator = await patchFile.readByte();
    const compressedSections =
      VcdiffDeltaIndicator.DATACOMP | VcdiffDeltaIndicator.INSTCOMP | VcdiffDeltaIndicator.ADDRCOMP;
    if (deltaEncodingIndicator & compressedSections && secondaryDecompressor === undefined) {
      throw new IgirException(
        `Vcdiff window sets compressed-section bits but the header names no secondary compressor: ${patchFile.getPathLike().toString()}`,
      );
    }

    const addsAndRunsDataLength = await patchFile.readUint();
    const instructionsAndSizesLength = await patchFile.readUint();
    const copyAddressesLength = await patchFile.readUint();

    if (winIndicator & VcdiffWinIndicator.ADLER32) {
      (await patchFile.readNext(4)).readUInt32BE(); // TODO(cemmer): handle
    }

    const addsAndRunsData = await this.readSection(
      patchFile,
      addsAndRunsDataLength,
      'data',
      deltaEncodingIndicator & VcdiffDeltaIndicator.DATACOMP ? secondaryDecompressor : undefined,
    );
    const instructionsAndSizesData = await this.readSection(
      patchFile,
      instructionsAndSizesLength,
      'instructions',
      deltaEncodingIndicator & VcdiffDeltaIndicator.INSTCOMP ? secondaryDecompressor : undefined,
    );
    const copyAddressesData = await this.readSection(
      patchFile,
      copyAddressesLength,
      'addresses',
      deltaEncodingIndicator & VcdiffDeltaIndicator.ADDRCOMP ? secondaryDecompressor : undefined,
    );

    return new VcdiffWindow(
      winIndicator,
      sourceSegmentSize,
      sourceSegmentPosition,
      deltaEncodingTargetWindowSize,
      addsAndRunsData,
      instructionsAndSizesData,
      copyAddressesData,
    );
  }

  /**
   * Read one section, decompressing it if `secondaryDecompressor` is given.
   */
  private static async readSection(
    patchFile: VcdiffPatchReader,
    length: number,
    section: VcdiffSection,
    secondaryDecompressor: VcdiffSecondaryDecompressor | undefined,
  ): Promise<Buffer> {
    // TODO(cemmer): consider chunking/streaming
    const data = await patchFile.readNext(length);
    if (secondaryDecompressor === undefined) {
      return data;
    }
    try {
      return secondaryDecompressor.decompress(section, data);
    } catch (error) {
      throw new IgirException(
        `can't decompress Vcdiff ${section} section: ${error instanceof Error ? error.message : String(error)}: ${patchFile.getPathLike().toString()}`,
        { cause: error },
      );
    }
  }

  /**
   * Returns true if the entire instructions-and-sizes section of this window has been consumed.
   */
  isEOF(): boolean {
    return this.instructionsAndSizeOffset >= this.instructionsAndSizesData.length;
  }

  getProgressPercentage(): number {
    return this.instructionsAndSizeOffset / this.instructionsAndSizesData.length;
  }

  /**
   * Read and consume the next instruction-code-table index from the instructions stream.
   */
  readInstructionIndex(): number {
    const instructionCodeIdx = this.instructionsAndSizesData.readUInt8(
      this.instructionsAndSizeOffset,
    );
    this.instructionsAndSizeOffset += 1;
    return instructionCodeIdx;
  }

  /**
   * Read and consume the next variable-length size value from the instructions stream.
   */
  readInstructionSize(): number {
    const [size, instructionsAndSizeOffset] = readVcdiffUintFromBuffer(
      this.instructionsAndSizesData,
      this.instructionsAndSizeOffset,
    );
    this.instructionsAndSizeOffset = instructionsAndSizeOffset;
    return size;
  }

  /**
   * Apply a VCDIFF ADD instruction, writing the next `size` bytes from this window's data
   * section into the target file at the current window position.
   */
  async writeAddData(
    targetFile: VcdiffWindowFile,
    targetWindowPosition: number,
    size: number,
  ): Promise<void> {
    // Read
    const data = this.addsAndRunsData.subarray(
      this.addsAndRunsOffset,
      this.addsAndRunsOffset + size,
    );
    this.addsAndRunsOffset += size;
    // Write
    await targetFile.writeAt(data, targetWindowPosition + this.targetWindowOffset);
    this.targetWindowOffset += size;
  }

  /**
   * Apply a VCDIFF RUN instruction, writing `size` repetitions of the next byte from this
   * window's data section into the target file at the current window position.
   */
  async writeRunData(
    targetFile: VcdiffWindowFile,
    targetWindowPosition: number,
    size: number,
  ): Promise<void> {
    // Read
    const data = Buffer.from(
      this.addsAndRunsData
        .subarray(this.addsAndRunsOffset, this.addsAndRunsOffset + 1)
        .toString('hex')
        .repeat(size),
      'hex',
    );
    this.addsAndRunsOffset += 1;
    // Write
    await targetFile.writeAt(data, targetWindowPosition + this.targetWindowOffset);
    this.targetWindowOffset += size;
  }

  /**
   * Apply a VCDIFF COPY instruction, copying `size` bytes from the source segment or the
   * already-written target window into the target file at the current window position.
   */
  async writeCopyData(
    sourceFile: VcdiffWindowFile,
    targetFile: VcdiffWindowFile,
    targetWindowPosition: number,
    size: number,
    copyCache: VcdiffCache,
    mode: VcdiffCopyAddressModeValue,
  ): Promise<void> {
    const [addr, copyAddressesOffset] = copyCache.decode(
      this.copyAddressesData,
      this.copyAddressesOffset,
      this.sourceSegmentSize + this.targetWindowOffset,
      mode,
    );
    this.copyAddressesOffset = copyAddressesOffset;

    /**
     * NOTE(cemmer): this has to write byte-by-byte because it may read-after-write with
     *  the target file.
     */
    for (let byteNum = 0; byteNum < size; byteNum += 1) {
      let byte: Buffer;
      if (addr < this.sourceSegmentSize) {
        if (this.winIndicator & VcdiffWinIndicator.SOURCE) {
          byte = await sourceFile.readAt(this.sourceSegmentPosition + addr + byteNum, 1);
        } else {
          byte = await targetFile.readAt(this.sourceSegmentPosition + addr + byteNum, 1);
        }
      } else {
        byte = await targetFile.readAt(
          targetWindowPosition + (addr - this.sourceSegmentSize) + byteNum,
          1,
        );
      }
      await targetFile.writeAt(byte, targetWindowPosition + this.targetWindowOffset + byteNum);
    }
    this.targetWindowOffset += size;
  }

  /**
   * Apply every instruction in this window, writing the target window at
   * `targetWindowPosition`.
   */
  async apply(
    sourceFile: VcdiffWindowFile,
    targetFile: VcdiffWindowFile,
    codeTable: VcdiffDeltaInstruction[][],
    copyCache: VcdiffCache,
    targetWindowPosition: number,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (!this.isEOF()) {
      if (callback !== undefined) {
        callback(this.getProgressPercentage());
      }

      const instructionCodeIdx = this.readInstructionIndex();

      for (let i = 0; i <= 1; i += 1) {
        const instruction = codeTable[instructionCodeIdx][i];
        if (instruction.type === VcdiffInstruction.NOOP) {
          continue;
        }

        let { size } = instruction;
        if (!size) {
          size = this.readInstructionSize();
        }

        if (instruction.type === VcdiffInstruction.ADD) {
          await this.writeAddData(targetFile, targetWindowPosition, size);
        } else if (instruction.type === VcdiffInstruction.RUN) {
          await this.writeRunData(targetFile, targetWindowPosition, size);
        } else if (instruction.type === VcdiffInstruction.COPY) {
          await this.writeCopyData(
            sourceFile,
            targetFile,
            targetWindowPosition,
            size,
            copyCache,
            instruction.mode,
          );
        } else {
          throw new IgirException(`Vcdiff instruction ${instruction.type} isn't supported`);
        }
      }
    }
  }
}

/**
 * The VCDIFF "near" and "same" address caches used to decode COPY-instruction addresses
 * across address modes.
 */
class VcdiffCache {
  private readonly sNear: number;

  private readonly near: number[];

  private nextSlot = 0;

  private readonly sSame: number;

  private readonly same: number[];

  constructor(sNear = 4, sSame = 3) {
    this.sNear = sNear;
    this.near = Array.from({ length: sNear });
    this.sSame = sSame;
    this.same = Array.from({ length: sSame * 256 });
  }

  /**
   * Clear both address caches back to their initial state.
   */
  reset(): void {
    this.near.fill(0);
    this.same.fill(0);
    this.nextSlot = 0;
  }

  private update(addr: number): void {
    if (this.sNear > 0) {
      this.near[this.nextSlot] = addr;
      this.nextSlot = (this.nextSlot + 1) % this.sNear;
    }
    if (this.sSame > 0) {
      this.same[addr % (this.sSame * 256)] = addr;
    }
  }

  /**
   * Decode a copy address from the buffer at the given offset under the given address mode,
   * returning the resolved address and the new offset past the encoded bytes.
   */
  decode(
    copyAddressesData: Buffer,
    copyAddressesOffset: number,
    here: number,
    mode: VcdiffCopyAddressModeValue,
  ): [number, number] {
    let addr: number;
    let readValue: number;
    let copyAddressesOffsetAfter = copyAddressesOffset;

    if (mode === VcdiffCopyAddressMode.SELF) {
      [readValue, copyAddressesOffsetAfter] = readVcdiffUintFromBuffer(
        copyAddressesData,
        copyAddressesOffset,
      );
      addr = readValue;
    } else if (mode === VcdiffCopyAddressMode.HERE) {
      [readValue, copyAddressesOffsetAfter] = readVcdiffUintFromBuffer(
        copyAddressesData,
        copyAddressesOffset,
      );
      addr = here - readValue;
    } else if (mode >= 2 && mode <= this.sNear + 1) {
      const m = mode - 2;
      [readValue, copyAddressesOffsetAfter] = readVcdiffUintFromBuffer(
        copyAddressesData,
        copyAddressesOffset,
      );
      addr = this.near[m] + readValue;
    } else {
      const m = mode - (2 + this.sNear);
      readValue = copyAddressesData.readUInt8(copyAddressesOffset);
      copyAddressesOffsetAfter += 1;
      addr = this.same[m * 256 + readValue];
    }

    this.update(addr);

    return [addr, copyAddressesOffsetAfter];
  }
}

/**
 * @see https://www.rfc-editor.org/rfc/rfc3284
 * @see https://github.com/jmacd/xdelta
 */
export default class VcdiffPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.vcdiff', '.xdelta'];

  static readonly FILE_SIGNATURE = VcdiffHeader.FILE_SIGNATURE;

  /**
   * Parse a .vcdiff/.xdelta patch file and return a {@link VcdiffPatch}.
   */
  static patchFrom(file: File): VcdiffPatch {
    const crcBefore = super.getCrcFromPath(file.getExtractedFilePath());
    return new VcdiffPatch(file, crcBefore);
  }

  /**
   * Apply this patch to the input ROM file and write the patched result to the output path.
   */
  async createPatchedFile(
    inputRomFile: File,
    outputRomPath: string,
    callback?: FsReadCallback,
  ): Promise<void> {
    await this.getFile().extractToIOFile(async (patchFile) => {
      const header = await VcdiffHeader.fromIOFile(new VcdiffPatchReader(patchFile));
      const copyCache = new VcdiffCache(header.sNear, header.sSame);

      await VcdiffPatch.writeOutputFile(
        inputRomFile,
        outputRomPath,
        patchFile,
        header,
        copyCache,
        callback,
      );
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: IOFile,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToIOFile(async (sourceFile) => {
      // The target windows write every output byte, so the output starts empty. The source's
      // size is only a hint for whether to build the output in memory or on disk.
      const targetFile = await IOFile.fileFrom(outputRomPath, 'w+', sourceFile.getSize());

      try {
        await this.applyPatch(patchFile, sourceFile, targetFile, header, copyCache, callback);
      } finally {
        await targetFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: IOFile,
    sourceFile: IOFile,
    targetFile: IOFile,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
    callback?: FsReadCallback,
  ): Promise<void> {
    let targetWindowPosition = 0;

    while (!patchFile.isEOF()) {
      const windowStartOffset = patchFile.getPosition();
      const window = await VcdiffWindow.fromIOFile(
        new VcdiffPatchReader(patchFile),
        header.secondaryDecompressor,
      );
      const windowEndOffset = patchFile.getPosition();
      copyCache.reset();

      const startPercentage = windowStartOffset / patchFile.getSize();
      const windowSizePercentage = (windowEndOffset - windowStartOffset) / patchFile.getSize();
      const patchWindowCallback =
        callback === undefined
          ? undefined
          : (((windowProgressPercentage: number): void => {
              const progressPercentage =
                startPercentage + windowSizePercentage * windowProgressPercentage;
              callback(Math.floor(progressPercentage * targetFile.getSize()));
            }) satisfies FsReadCallback);

      await window.apply(
        sourceFile,
        targetFile,
        header.codeTable,
        copyCache,
        targetWindowPosition,
        patchWindowCallback,
      );

      targetWindowPosition += window.deltaEncodingTargetWindowSize;
    }

    // The output is exactly as long as every target window combined, not the source-size hint
    await targetFile.truncate(targetWindowPosition);
  }
}
