import type { PathLike } from 'node:fs';

import { XzStreamDecoder } from '../../../packages/xz/index.js';
import IgirException from '../../exceptions/igirException.js';
import Defaults from '../../globals/defaults.js';
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
  // modes 2..s_near+1 are "near" modes, then s_same "same" modes (RFC 3284 section 5.3)
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
const VCDIFF_INSTRUCTION_VALUES: readonly VcdiffInstructionValue[] =
  Object.values(VcdiffInstruction);

interface VcdiffDeltaInstruction {
  type: VcdiffInstructionValue;
  size: number;
  mode: VcdiffCopyAddressModeValue;
}

/** The parts of {@link IOFile} that reading a VCDIFF delta's header and windows uses */
type VcdiffPatchFile = Pick<
  IOFile,
  | 'getPathLike'
  | 'getPosition'
  | 'getSize'
  | 'readNext'
  | 'peekNext'
  | 'skipNext'
  | 'readAt'
  | 'copyRange'
>;

/** The parts of {@link IOFile} that applying a VCDIFF window to a source and target uses */
type VcdiffWindowFile = Pick<IOFile, 'writeAt' | 'copyRange'>;

/**
 * Read a VCDIFF variable-length unsigned integer from a buffer starting at the given offset,
 * returning the value and the new offset past the encoded bytes. Doesn't detect truncation: a
 * value cut off by the end of the buffer is returned partially decoded.
 */
function readVcdiffUintFromBuffer(buffer: Buffer, offset = 0): [number, number] {
  let num = 0;

  let lastOffset = offset;
  while (lastOffset < buffer.length) {
    const bits = buffer.readUInt8(lastOffset);
    lastOffset += 1;
    // Multiply rather than shift, as bitwise operators only work on 32-bit integers
    num = num * 128 + (bits & 0x7f);
    if (!(bits & 0x80)) {
      // high bit clear: this was the last byte
      break;
    }
  }

  return [num, lastOffset];
}

/**
 * Enough bytes, at 7 bits each, for any VCDIFF integer up to 64 bits, the largest that xdelta3
 * encodes
 */
const VCDIFF_UINT_READ_AHEAD_SIZE = 10;

/**
 * Decode the VCDIFF variable-length unsigned integer at the start of `data`, which holds up to
 * {@link VCDIFF_UINT_READ_AHEAD_SIZE} bytes read ahead, throwing if it doesn't end within them.
 * @returns the value and the number of bytes it was encoded in
 */
function decodeVcdiffUint(data: Buffer, pathLike: PathLike): [number, number] {
  const [num, size] = readVcdiffUintFromBuffer(data);
  if (size === 0 || data.readUInt8(size - 1) & 0x80) {
    throw new IgirException(
      `Vcdiff patch is truncated or has an invalid integer: ${pathLike.toString()}`,
    );
  }
  return [num, size];
}

/**
 * Read exactly the next `size` bytes of the patch, advancing the read position, throwing if the
 * patch ends first.
 */
async function readVcdiffBytes(patchIOFile: VcdiffPatchFile, size: number): Promise<Buffer> {
  const data = await patchIOFile.readNext(size);
  if (data.length !== size) {
    throw new IgirException(`Vcdiff patch is truncated: ${patchIOFile.getPathLike().toString()}`);
  }
  return data;
}

/**
 * Read the next byte of the patch, advancing the read position, throwing if the patch ends first.
 */
async function readVcdiffByte(patchIOFile: VcdiffPatchFile): Promise<number> {
  return (await readVcdiffBytes(patchIOFile, 1)).readUInt8();
}

/**
 * Read a VCDIFF variable-length unsigned integer, advancing the read position past the encoded
 * value, throwing if the patch ends first.
 */
async function readVcdiffUint(patchIOFile: VcdiffPatchFile): Promise<number> {
  // Read ahead rather than byte-by-byte, encoded values are usually only a few bytes
  const data = await patchIOFile.peekNext(VCDIFF_UINT_READ_AHEAD_SIZE);
  const [num, size] = decodeVcdiffUint(data, patchIOFile.getPathLike());
  patchIOFile.skipNext(size);
  return num;
}

/**
 * xdelta3's XD3_HARDMAXWINSIZE, "a safety mechanism to protect decoders against malicious files"
 */
const VCDIFF_HARD_MAX_WINDOW_SIZE = 1 << 26;

const CODE_TABLE_ENTRIES = 256;
// RFC 3284 section 7: inst1, inst2, size1, size2, mode1, mode2
const CODE_TABLE_STRING_SIZE = 6 * CODE_TABLE_ENTRIES;

/**
 * An in-memory {@link VcdiffPatchFile} and {@link VcdiffWindowFile} over a buffer, for the nested
 * delta that encodes an application-defined code table, and for decompressed sections.
 */
class VcdiffBuffer implements VcdiffPatchFile, VcdiffWindowFile {
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

  getPosition(): number {
    return this.position;
  }

  getSize(): number {
    return this.buffer.length;
  }

  /**
   * Read up to the next `maxSize` bytes (fewer at the end of the buffer), advancing the read
   * position by `maxSize`.
   */
  async readNext(maxSize: number): Promise<Buffer> {
    const result = await this.peekNext(maxSize);
    this.position += maxSize;
    return result;
  }

  /**
   * Read up to the next `maxSize` bytes (fewer at the end of the buffer), without advancing the
   * read position.
   */
  async peekNext(maxSize: number): Promise<Buffer> {
    return await this.readAt(this.position, maxSize);
  }

  /**
   * Advance the read position by `size` bytes.
   */
  skipNext(size: number): void {
    this.position += size;
  }

  /**
   * Read up to `maxSize` bytes starting at `position` (fewer at the end of the buffer), without
   * advancing the read position.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async readAt(position: number, maxSize: number): Promise<Buffer> {
    this.assertPosition(position);
    return this.buffer.subarray(position, position + maxSize);
  }

  /**
   * Write `buffer` at `position`, throwing if it doesn't fit.
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async writeAt(buffer: Buffer, position: number): Promise<number> {
    this.assertPosition(position);
    if (position + buffer.length > this.buffer.length) {
      throw new IgirException(
        `Vcdiff code table delta writes past ${this.buffer.length} bytes: ${this.pathLike.toString()}`,
      );
    }
    return buffer.copy(this.buffer, position);
  }

  /**
   * Copy the region [`sourceStart`, `sourceEnd`) of this buffer to `targetIOFile` starting at
   * `targetStart`, as if a byte at a time, so a copy within this buffer can read bytes it wrote
   * earlier in the same copy. Stops early if this buffer ends before `sourceEnd`.
   */
  async copyRange(
    targetIOFile: Pick<IOFile, 'writeAt'>,
    targetStart: number,
    sourceStart: number,
    sourceEnd: number,
  ): Promise<number> {
    this.assertPosition(sourceStart);
    this.assertPosition(targetStart);
    const size = Math.min(sourceEnd, this.buffer.length) - sourceStart;
    if (size <= 0) {
      return 0;
    }

    const distance = targetStart - sourceStart;
    if (targetIOFile !== this || distance <= 0 || distance >= size) {
      // Nothing this copy writes is read back, so copy it all at once
      return await targetIOFile.writeAt(
        this.buffer.subarray(sourceStart, sourceStart + size),
        targetStart,
      );
    }

    // The source overlaps the target, so the target repeats the first `distance` source bytes.
    // Each step copies everything written so far, which is a whole number of repeats, doubling
    // the step size every time.
    let copied = 0;
    while (copied < size) {
      const stepSize = Math.min(distance + copied, size - copied);
      copied += await this.writeAt(
        this.buffer.subarray(sourceStart, sourceStart + stepSize),
        targetStart + copied,
      );
    }
    return copied;
  }

  private assertPosition(position: number): void {
    if (position < 0) {
      throw new IgirException(
        `can't use negative position ${position} in Vcdiff patch: ${this.pathLike.toString()}`,
      );
    }
  }
}

type VcdiffSection = 'data' | 'instructions' | 'addresses';

/** The delta indicator bit that marks each section as secondary-compressed */
const VcdiffSectionCompressedBit: Record<VcdiffSection, number> = {
  data: VcdiffDeltaIndicator.DATACOMP,
  instructions: VcdiffDeltaIndicator.INSTCOMP,
  addresses: VcdiffDeltaIndicator.ADDRCOMP,
};

/** The parts of {@link IOFile} that reading a VCDIFF window's section uses */
type VcdiffSectionFile = Pick<IOFile, 'getPathLike' | 'readAt' | 'copyRange'>;

/**
 * A read cursor over one section of a VCDIFF window: the region [`start`, `end`) of either the
 * patch file itself, or of a decompressed section in memory.
 */
class VcdiffSectionCursor {
  private readonly ioFile: VcdiffSectionFile;

  private readonly section: VcdiffSection;

  private readonly start: number;

  private readonly end: number;

  private position: number;

  constructor(ioFile: VcdiffSectionFile, section: VcdiffSection, start: number, end: number) {
    this.ioFile = ioFile;
    this.section = section;
    this.start = start;
    this.end = end;
    this.position = start;
  }

  /**
   * Returns true if the entire section has been consumed.
   */
  isEOF(): boolean {
    return this.position >= this.end;
  }

  getProgressPercentage(): number {
    return (this.position - this.start) / (this.end - this.start);
  }

  /**
   * Read and consume the next byte of the section, throwing if the section ends first.
   */
  async readByte(): Promise<number> {
    const data = await this.ioFile.readAt(this.position, Math.min(1, this.end - this.position));
    if (data.length !== 1) {
      throw this.endsEarlyError();
    }
    this.position += 1;
    return data.readUInt8();
  }

  /**
   * Read and consume the next variable-length unsigned integer of the section, throwing if the
   * section ends first.
   */
  async readUint(): Promise<number> {
    const data = await this.ioFile.readAt(
      this.position,
      Math.min(VCDIFF_UINT_READ_AHEAD_SIZE, this.end - this.position),
    );
    const [num, size] = decodeVcdiffUint(data, this.ioFile.getPathLike());
    this.position += size;
    return num;
  }

  /**
   * Copy and consume the next `size` bytes of the section to `targetIOFile` starting at
   * `targetStart`, throwing if the section ends first.
   */
  async copyTo(
    targetIOFile: Pick<IOFile, 'writeAt'>,
    targetStart: number,
    size: number,
  ): Promise<void> {
    if (this.position + size > this.end) {
      throw this.endsEarlyError();
    }
    const copied = await this.ioFile.copyRange(
      targetIOFile,
      targetStart,
      this.position,
      this.position + size,
    );
    if (copied !== size) {
      throw this.endsEarlyError();
    }
    this.position += size;
  }

  private endsEarlyError(): IgirException {
    return new IgirException(
      `Vcdiff window's ${this.section} section ends early: ${this.ioFile.getPathLike().toString()}`,
    );
  }
}

/**
 * xdelta3's LZMA secondary compression. Each section type is one never-finished xz stream that
 * continues from window to window, and each compressed section is a VCDIFF integer holding the
 * decompressed size, followed by that stream's next whole LZMA2 chunks.
 * @see https://github.com/jmacd/xdelta/blob/v3.2.2/xdelta3/xdelta3-lzma.h
 */
class VcdiffSecondaryDecompressor {
  private readonly decoders: Record<VcdiffSection, XzStreamDecoder> = {
    data: new XzStreamDecoder(),
    instructions: new XzStreamDecoder(),
    addresses: new XzStreamDecoder(),
  };

  /**
   * Decompress one window's compressed section, continuing that section type's xz stream.
   */
  decompress(section: VcdiffSection, data: Buffer): Buffer {
    const [size, offset] = readVcdiffUintFromBuffer(data);
    if (size === 0) {
      throw new Error('Vcdiff secondary-compressed section has an invalid size of 0');
    }
    // NOTE(cemmer): this can't be chunked, the xz decoder needs whole LZMA2 chunks as input and
    //  produces the whole section as output
    return this.decoders[section].decode(data.subarray(offset), size);
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

  /** RFC 3284 section 7: the default code table as six 256-byte arrays, built on first use */
  private static defaultCodeTableString?: Buffer;

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
  static async fromPatchFile(patchIOFile: VcdiffPatchFile): Promise<VcdiffHeader> {
    const hdrIndicator = await this.readIndicator(patchIOFile);

    let secondaryDecompressor: VcdiffSecondaryDecompressor | undefined;
    if (hdrIndicator & VcdiffHdrIndicator.DECOMPRESS) {
      const compressorId = await readVcdiffByte(patchIOFile);
      secondaryDecompressor = this.secondaryDecompressorOf(
        compressorId,
        patchIOFile.getPathLike().toString(),
      );
    }

    let codeTable = this.DEFAULT_CODE_TABLE;
    let sNear = this.DEFAULT_S_NEAR;
    let sSame = this.DEFAULT_S_SAME;
    if (hdrIndicator & VcdiffHdrIndicator.CODETABLE) {
      ({ codeTable, sNear, sSame } = await this.readCodeTable(patchIOFile));
    }

    await this.skipAppHeader(patchIOFile, hdrIndicator);

    return new VcdiffHeader(codeTable, sNear, sSame, secondaryDecompressor);
  }

  /**
   * Read the file signature and version, returning the header indicator byte.
   */
  private static async readIndicator(patchIOFile: VcdiffPatchFile): Promise<number> {
    const header = await patchIOFile.readNext(3);
    if (!header.equals(this.FILE_SIGNATURE)) {
      throw new IgirException(
        `Vcdiff patch header is invalid: ${patchIOFile.getPathLike().toString()}`,
      );
    }
    patchIOFile.skipNext(1); // version
    return await readVcdiffByte(patchIOFile);
  }

  private static async skipAppHeader(
    patchIOFile: VcdiffPatchFile,
    hdrIndicator: number,
  ): Promise<void> {
    if (!(hdrIndicator & VcdiffHdrIndicator.APPHEADER)) {
      return;
    }

    const appHeaderLength = await readVcdiffUint(patchIOFile);
    patchIOFile.skipNext(appHeaderLength);
  }

  /**
   * Read an RFC 3284 section 7 application-defined code table: `s_near`, `s_same`, then a
   * VCDIFF delta that turns the default code table string into the new one.
   */
  private static async readCodeTable(
    patchIOFile: VcdiffPatchFile,
  ): Promise<Pick<VcdiffHeader, 'codeTable' | 'sNear' | 'sSame'>> {
    const patchPath = patchIOFile.getPathLike().toString();
    const codeTableLength = await readVcdiffUint(patchIOFile);
    if (codeTableLength <= 2) {
      throw new IgirException(
        `Vcdiff code table length ${codeTableLength} is invalid: ${patchPath}`,
      );
    }
    const codeTableData = await readVcdiffBytes(patchIOFile, codeTableLength);
    const sNear = codeTableData.readUInt8(0);
    const sSame = codeTableData.readUInt8(1);

    const delta = new VcdiffBuffer(codeTableData.subarray(2), patchIOFile.getPathLike());
    const deltaIndicator = await this.readIndicator(delta);
    if (deltaIndicator & (VcdiffHdrIndicator.DECOMPRESS | VcdiffHdrIndicator.CODETABLE)) {
      throw new IgirException(
        `Vcdiff code table delta can't use secondary compression or another code table: ${patchPath}`,
      );
    }
    await this.skipAppHeader(delta, deltaIndicator);

    const source = new VcdiffBuffer(this.getDefaultCodeTableString(), patchIOFile.getPathLike());
    const target = new VcdiffBuffer(
      Buffer.alloc(CODE_TABLE_STRING_SIZE),
      patchIOFile.getPathLike(),
    );
    const copyCache = new VcdiffCache(this.DEFAULT_S_NEAR, this.DEFAULT_S_SAME);
    let targetWindowPosition = 0;
    while (!delta.isEOF()) {
      const window = await VcdiffWindow.fromPatchFile(delta);
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

  private static getDefaultCodeTableString(): Buffer {
    if (this.defaultCodeTableString === undefined) {
      const codeTableString = Buffer.alloc(CODE_TABLE_STRING_SIZE);
      for (const [index, entry] of this.DEFAULT_CODE_TABLE.entries()) {
        for (const [slot, instruction] of entry.entries()) {
          codeTableString.writeUInt8(instruction.type, slot * CODE_TABLE_ENTRIES + index);
          codeTableString.writeUInt8(instruction.size, (2 + slot) * CODE_TABLE_ENTRIES + index);
          codeTableString.writeUInt8(instruction.mode, (4 + slot) * CODE_TABLE_ENTRIES + index);
        }
      }
      this.defaultCodeTableString = codeTableString;
    }
    return this.defaultCodeTableString;
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
        const type = VCDIFF_INSTRUCTION_VALUES.find((value) => value === typeByte);
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
          `Vcdiff secondary compressor DJW (static Huffman) isn't supported: ${patchPath}`,
        );
      }
      case VcdiffSecondaryCompression.FGK_ADAPTIVE_HUFFMAN: {
        throw new IgirException(
          `Vcdiff secondary compressor FGK (adaptive Huffman) isn't supported: ${patchPath}`,
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
 * and copy-address sections, and the size and position of the source segment they reference.
 */
class VcdiffWindow {
  readonly winIndicator: number;

  readonly sourceSegmentSize: number;

  readonly sourceSegmentPosition: number;

  readonly deltaEncodingTargetWindowSize: number;

  private targetWindowOffset = 0;

  private readonly addsAndRuns: VcdiffSectionCursor;

  private readonly instructionsAndSizes: VcdiffSectionCursor;

  private readonly copyAddresses: VcdiffSectionCursor;

  private constructor(
    winIndicator: number,
    sourceSegmentSize: number,
    sourceSegmentPosition: number,
    deltaEncodingTargetWindowSize: number,
    addsAndRuns: VcdiffSectionCursor,
    instructionsAndSizes: VcdiffSectionCursor,
    copyAddresses: VcdiffSectionCursor,
  ) {
    this.winIndicator = winIndicator;
    this.sourceSegmentSize = sourceSegmentSize;
    this.sourceSegmentPosition = sourceSegmentPosition;
    this.deltaEncodingTargetWindowSize = deltaEncodingTargetWindowSize;
    this.addsAndRuns = addsAndRuns;
    this.instructionsAndSizes = instructionsAndSizes;
    this.copyAddresses = copyAddresses;
  }

  /**
   * Read a single VCDIFF window from the patch file, advancing the read position past it.
   */
  static async fromPatchFile(
    patchIOFile: VcdiffPatchFile,
    secondaryDecompressor?: VcdiffSecondaryDecompressor,
  ): Promise<VcdiffWindow> {
    const winIndicator = await readVcdiffByte(patchIOFile);
    let sourceSegmentSize = 0;
    let sourceSegmentPosition = 0;
    if (winIndicator & (VcdiffWinIndicator.SOURCE | VcdiffWinIndicator.TARGET)) {
      sourceSegmentSize = await readVcdiffUint(patchIOFile);
      sourceSegmentPosition = await readVcdiffUint(patchIOFile);
    }

    await readVcdiffUint(patchIOFile); // delta encoding length
    const deltaEncodingTargetWindowSize = await readVcdiffUint(patchIOFile);
    if (deltaEncodingTargetWindowSize > VCDIFF_HARD_MAX_WINDOW_SIZE) {
      throw new IgirException(
        `Vcdiff window target size ${deltaEncodingTargetWindowSize} exceeds the hard window size of ${VCDIFF_HARD_MAX_WINDOW_SIZE}: ${patchIOFile.getPathLike().toString()}`,
      );
    }
    const deltaEncodingIndicator = await readVcdiffByte(patchIOFile);
    const compressedSections =
      VcdiffDeltaIndicator.DATACOMP | VcdiffDeltaIndicator.INSTCOMP | VcdiffDeltaIndicator.ADDRCOMP;
    if (deltaEncodingIndicator & compressedSections && secondaryDecompressor === undefined) {
      throw new IgirException(
        `Vcdiff window sets compressed-section bits but the header names no secondary compressor: ${patchIOFile.getPathLike().toString()}`,
      );
    }

    const addsAndRunsDataLength = await readVcdiffUint(patchIOFile);
    const instructionsAndSizesLength = await readVcdiffUint(patchIOFile);
    const copyAddressesLength = await readVcdiffUint(patchIOFile);

    if (winIndicator & VcdiffWinIndicator.ADLER32) {
      await readVcdiffBytes(patchIOFile, 4); // TODO(cemmer): verify the Adler-32 checksum
    }

    const addsAndRunsStart = patchIOFile.getPosition();
    const instructionsAndSizesStart = addsAndRunsStart + addsAndRunsDataLength;
    const copyAddressesStart = instructionsAndSizesStart + instructionsAndSizesLength;
    const sectionsEnd = copyAddressesStart + copyAddressesLength;
    if (sectionsEnd > patchIOFile.getSize()) {
      throw new IgirException(`Vcdiff patch is truncated: ${patchIOFile.getPathLike().toString()}`);
    }

    const addsAndRuns = await this.openSection(
      patchIOFile,
      'data',
      addsAndRunsStart,
      instructionsAndSizesStart,
      deltaEncodingIndicator,
      secondaryDecompressor,
    );
    const instructionsAndSizes = await this.openSection(
      patchIOFile,
      'instructions',
      instructionsAndSizesStart,
      copyAddressesStart,
      deltaEncodingIndicator,
      secondaryDecompressor,
    );
    const copyAddresses = await this.openSection(
      patchIOFile,
      'addresses',
      copyAddressesStart,
      sectionsEnd,
      deltaEncodingIndicator,
      secondaryDecompressor,
    );
    patchIOFile.skipNext(sectionsEnd - addsAndRunsStart);

    return new VcdiffWindow(
      winIndicator,
      sourceSegmentSize,
      sourceSegmentPosition,
      deltaEncodingTargetWindowSize,
      addsAndRuns,
      instructionsAndSizes,
      copyAddresses,
    );
  }

  /**
   * Open a cursor over the section [`start`, `end`) of the patch file, decompressing it into
   * memory if `deltaEncodingIndicator` marks it as compressed.
   */
  private static async openSection(
    patchIOFile: VcdiffPatchFile,
    section: VcdiffSection,
    start: number,
    end: number,
    deltaEncodingIndicator: number,
    secondaryDecompressor: VcdiffSecondaryDecompressor | undefined,
  ): Promise<VcdiffSectionCursor> {
    if (
      !(deltaEncodingIndicator & VcdiffSectionCompressedBit[section]) ||
      secondaryDecompressor === undefined
    ) {
      return new VcdiffSectionCursor(patchIOFile, section, start, end);
    }

    // NOTE(cemmer): compressed sections are read whole, rather than through a cursor over the
    //  patch file, because they need to be decompressed whole (see VcdiffSecondaryDecompressor)
    const data = await patchIOFile.readAt(start, end - start);
    let decompressed: Buffer;
    try {
      decompressed = secondaryDecompressor.decompress(section, data);
    } catch (error) {
      throw new IgirException(
        `can't decompress Vcdiff ${section} section: ${error instanceof Error ? error.message : String(error)}: ${patchIOFile.getPathLike().toString()}`,
        { cause: error },
      );
    }
    return new VcdiffSectionCursor(
      new VcdiffBuffer(decompressed, patchIOFile.getPathLike()),
      section,
      0,
      decompressed.length,
    );
  }

  /**
   * Returns true if the entire instructions-and-sizes section of this window has been consumed.
   */
  isEOF(): boolean {
    return this.instructionsAndSizes.isEOF();
  }

  getProgressPercentage(): number {
    return this.instructionsAndSizes.getProgressPercentage();
  }

  /**
   * Apply a VCDIFF ADD instruction, copying the next `size` bytes from this window's data
   * section into the target file at the current window position.
   */
  async writeAddData(
    targetIOFile: VcdiffWindowFile,
    targetWindowPosition: number,
    size: number,
  ): Promise<void> {
    await this.addsAndRuns.copyTo(
      targetIOFile,
      targetWindowPosition + this.targetWindowOffset,
      size,
    );
    this.targetWindowOffset += size;
  }

  /**
   * Apply a VCDIFF RUN instruction, writing `size` repetitions of the next byte from this
   * window's data section into the target file at the current window position.
   */
  async writeRunData(
    targetIOFile: VcdiffWindowFile,
    targetWindowPosition: number,
    size: number,
  ): Promise<void> {
    // Runs can be as large as the target window, so write them a chunk at a time
    const chunk = Buffer.alloc(
      Math.min(size, Defaults.FILE_READING_CHUNK_SIZE),
      await this.addsAndRuns.readByte(),
    );
    for (let written = 0; written < size; written += chunk.length) {
      await targetIOFile.writeAt(
        chunk.subarray(0, size - written),
        targetWindowPosition + this.targetWindowOffset + written,
      );
    }
    this.targetWindowOffset += size;
  }

  /**
   * Apply a VCDIFF COPY instruction, copying `size` bytes from the source segment or the
   * already-written target window into the target file at the current window position.
   */
  async writeCopyData(
    sourceIOFile: VcdiffWindowFile,
    targetIOFile: VcdiffWindowFile,
    targetWindowPosition: number,
    size: number,
    copyCache: VcdiffCache,
    mode: VcdiffCopyAddressModeValue,
  ): Promise<void> {
    const addr = await copyCache.decode(
      this.copyAddresses,
      this.sourceSegmentSize + this.targetWindowOffset,
      mode,
    );

    let copyIOFile = targetIOFile;
    let copyPosition = targetWindowPosition + (addr - this.sourceSegmentSize);
    if (addr < this.sourceSegmentSize) {
      if (this.winIndicator & VcdiffWinIndicator.SOURCE) {
        copyIOFile = sourceIOFile;
      }
      copyPosition = this.sourceSegmentPosition + addr;
    }
    await copyIOFile.copyRange(
      targetIOFile,
      targetWindowPosition + this.targetWindowOffset,
      copyPosition,
      copyPosition + size,
    );
    this.targetWindowOffset += size;
  }

  /**
   * Apply every instruction in this window, writing the target window at
   * `targetWindowPosition`.
   */
  async apply(
    sourceIOFile: VcdiffWindowFile,
    targetIOFile: VcdiffWindowFile,
    codeTable: VcdiffDeltaInstruction[][],
    copyCache: VcdiffCache,
    targetWindowPosition: number,
    callback?: FsReadCallback,
  ): Promise<void> {
    while (!this.isEOF()) {
      if (callback !== undefined) {
        callback(this.getProgressPercentage());
      }

      const instructionCodeIdx = await this.instructionsAndSizes.readByte();

      for (let i = 0; i <= 1; i += 1) {
        const instruction = codeTable[instructionCodeIdx][i];
        if (instruction.type === VcdiffInstruction.NOOP) {
          continue;
        }

        let { size } = instruction;
        if (!size) {
          size = await this.instructionsAndSizes.readUint();
        }

        if (instruction.type === VcdiffInstruction.ADD) {
          await this.writeAddData(targetIOFile, targetWindowPosition, size);
        } else if (instruction.type === VcdiffInstruction.RUN) {
          await this.writeRunData(targetIOFile, targetWindowPosition, size);
        } else if (instruction.type === VcdiffInstruction.COPY) {
          await this.writeCopyData(
            sourceIOFile,
            targetIOFile,
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
   * Read and decode the next copy address from the addresses section under the given address
   * mode.
   */
  async decode(
    copyAddresses: VcdiffSectionCursor,
    here: number,
    mode: VcdiffCopyAddressModeValue,
  ): Promise<number> {
    let addr: number;
    if (mode === VcdiffCopyAddressMode.SELF) {
      addr = await copyAddresses.readUint();
    } else if (mode === VcdiffCopyAddressMode.HERE) {
      addr = here - (await copyAddresses.readUint());
    } else if (mode >= 2 && mode <= this.sNear + 1) {
      addr = this.near[mode - 2] + (await copyAddresses.readUint());
    } else {
      const sameMode = mode - (2 + this.sNear);
      addr = this.same[sameMode * 256 + (await copyAddresses.readByte())];
    }

    this.update(addr);

    return addr;
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
   * Create a {@link VcdiffPatch} for a .vcdiff/.xdelta file, taking the source ROM's CRC from the
   * file name.
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
    await this.getFile().extractToIOFile(async (patchIOFile) => {
      const header = await VcdiffHeader.fromPatchFile(patchIOFile);
      const copyCache = new VcdiffCache(header.sNear, header.sSame);

      await VcdiffPatch.writeOutputFile(
        inputRomFile,
        outputRomPath,
        patchIOFile,
        header,
        copyCache,
        callback,
      );
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchIOFile: IOFile,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
    callback?: FsReadCallback,
  ): Promise<void> {
    await inputRomFile.extractToIOFile(async (sourceIOFile) => {
      // The target windows write every output byte, so the output starts empty. The source's
      // size is only an estimate; the output is truncated to its real size once patched.
      const targetIOFile = await IOFile.fileFrom(outputRomPath, 'w+', sourceIOFile.getSize());

      try {
        await this.applyPatch(patchIOFile, sourceIOFile, targetIOFile, header, copyCache, callback);
      } finally {
        await targetIOFile.close();
      }
    });
  }

  private static async applyPatch(
    patchIOFile: IOFile,
    sourceIOFile: IOFile,
    targetIOFile: IOFile,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
    callback?: FsReadCallback,
  ): Promise<void> {
    let targetWindowPosition = 0;

    while (!patchIOFile.isEOF()) {
      const windowStartOffset = patchIOFile.getPosition();
      const window = await VcdiffWindow.fromPatchFile(patchIOFile, header.secondaryDecompressor);
      const windowEndOffset = patchIOFile.getPosition();
      copyCache.reset();

      const startPercentage = windowStartOffset / patchIOFile.getSize();
      const windowSizePercentage = (windowEndOffset - windowStartOffset) / patchIOFile.getSize();
      const patchWindowCallback =
        callback === undefined
          ? undefined
          : (((windowProgressPercentage: number): void => {
              const progressPercentage =
                startPercentage + windowSizePercentage * windowProgressPercentage;
              callback(Math.floor(progressPercentage * targetIOFile.getSize()));
            }) satisfies FsReadCallback);

      await window.apply(
        sourceIOFile,
        targetIOFile,
        header.codeTable,
        copyCache,
        targetWindowPosition,
        patchWindowCallback,
      );

      targetWindowPosition += window.deltaEncodingTargetWindowSize;
    }

    // The output is exactly as long as every target window combined, not the source-size hint
    await targetIOFile.truncate(targetWindowPosition);
  }
}
