// eslint-disable-next-line max-classes-per-file
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
import ExpectedError from '../expectedError.js';
import File from '../files/file.js';
import Patch from './patch.js';

enum VcdiffSecondaryCompression {
  DJW_STATIC_HUFFMAN = 1,
  LZMA = 2,
  FGK_ADAPTIVE_HUFFMAN = 16,
}

enum VcdiffHdrIndicator {
  DECOMPRESS = 0x01,
  CODETABLE = 0x02,
  APPHEADER = 0x04,
}

enum VcdiffWinIndicator {
  SOURCE = 0x01,
  TARGET = 0x02,
  ADLER32 = 0x04,
}

enum VcdiffDeltaIndicator {
  DATACOMP = 0x01,
  INSTCOMP = 0x02,
  ADDRCOMP = 0x04,
}

enum VcdiffCopyAddressMode {
  SELF = 0,
  HERE = 1,
}

enum VcdiffInstruction {
  NOOP = 0,
  ADD,
  RUN,
  COPY,
}

interface VcdiffDeltaInstruction {
  type: VcdiffInstruction;
  size: number;
  mode: VcdiffCopyAddressMode;
}

class VcdiffHeader {
  static readonly FILE_SIGNATURE = Buffer.from('d6c3c4', 'hex');

  private static readonly DEFAULT_CODE_TABLE = ((): VcdiffDeltaInstruction[][] => {
    const entries: VcdiffDeltaInstruction[][] = [
      [
        { type: VcdiffInstruction.RUN, size: 0, mode: 0 },
        { type: VcdiffInstruction.NOOP, size: 0, mode: 0 },
      ],
    ];

    // ADD+NOOP
    for (let addSize = 0; addSize <= 17; addSize += 1) {
      entries.push([
        { type: VcdiffInstruction.ADD, size: addSize, mode: 0 },
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
          { type: VcdiffInstruction.COPY, size: copySize, mode: copyMode },
          { type: VcdiffInstruction.NOOP, size: 0, mode: 0 },
        ]);
      }
    }

    // ADD+COPY
    for (let copyMode = 0; copyMode <= 5; copyMode += 1) {
      for (let addSize = 1; addSize <= 4; addSize += 1) {
        for (let copySize = 4; copySize <= 6; copySize += 1) {
          entries.push([
            { type: VcdiffInstruction.ADD, size: addSize, mode: 0 },
            { type: VcdiffInstruction.COPY, size: copySize, mode: copyMode },
          ]);
        }
      }
    }
    for (let copyMode = 6; copyMode <= 8; copyMode += 1) {
      for (let addSize = 1; addSize <= 4; addSize += 1) {
        entries.push([
          { type: VcdiffInstruction.ADD, size: addSize, mode: 0 },
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

  readonly secondaryDecompressorId: VcdiffSecondaryCompression;

  readonly codeTable: VcdiffDeltaInstruction[][];

  constructor(
    secondaryDecompressorId: VcdiffSecondaryCompression,
    codeTable: VcdiffDeltaInstruction[][],
  ) {
    this.secondaryDecompressorId = secondaryDecompressorId;
    this.codeTable = codeTable;
  }

  static async fromFilePoly(patchFile: FilePoly): Promise<VcdiffHeader> {
    const header = await patchFile.readNext(3);
    if (!header.equals(VcdiffHeader.FILE_SIGNATURE)) {
      await patchFile.close();
      throw new ExpectedError(`Vcdiff patch header is invalid: ${patchFile.getPathLike()}`);
    }
    patchFile.skipNext(1); // version

    const hdrIndicator = (await patchFile.readNext(1)).readUInt8();
    let secondaryDecompressorId = 0;
    if (hdrIndicator & VcdiffHdrIndicator.DECOMPRESS) {
      secondaryDecompressorId = (await patchFile.readNext(1)).readUInt8();
      if (secondaryDecompressorId) {
        /**
         * TODO(cemmer): notes for later on LZMA (the default for the xdelta3 tool):
         *  - There appears to be a first byte (or more?), and it might be the length of the
         *    encoded data? Maybe that number is encoded like other numbers are?
         *  - The XZ data encoded appears to be non-standard, it doesn't have a terminating set of
         *    bytes "59 5A", only the starting bytes "FD 37 7A 58 5A 00" (after the above number)
         */
        await patchFile.close();
        throw new ExpectedError(`unsupported Vcdiff secondary decompressor ${VcdiffSecondaryCompression[secondaryDecompressorId]}: ${patchFile.getPathLike()}`);
      }
    }

    const codeTable = VcdiffHeader.DEFAULT_CODE_TABLE;
    if (hdrIndicator & VcdiffHdrIndicator.CODETABLE) {
      const codeTableLength = await Patch.readVcdiffUintFromFile(patchFile);
      if (codeTableLength) {
        await patchFile.close();
        throw new ExpectedError(`can't parse Vcdiff application-defined code table: ${patchFile.getPathLike()}`);
      }
    }

    if (hdrIndicator & VcdiffHdrIndicator.APPHEADER) {
      const appHeaderLength = await Patch.readVcdiffUintFromFile(patchFile);
      patchFile.skipNext(appHeaderLength);
    }

    return new VcdiffHeader(secondaryDecompressorId, codeTable);
  }
}
class VcdiffWindow {
  readonly winIndicator: VcdiffWinIndicator;

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
    winIndicator: VcdiffWinIndicator,
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

  static async fromFilePoly(patchFile: FilePoly): Promise<VcdiffWindow> {
    const winIndicator = (await patchFile.readNext(1)).readUInt8();
    let sourceSegmentSize = 0;
    let sourceSegmentPosition = 0;
    if (winIndicator & (VcdiffWinIndicator.SOURCE | VcdiffWinIndicator.TARGET)) {
      sourceSegmentSize = await Patch.readVcdiffUintFromFile(patchFile);
      sourceSegmentPosition = await Patch.readVcdiffUintFromFile(patchFile);
    }

    await Patch.readVcdiffUintFromFile(patchFile); // delta encoding length
    const deltaEncodingTargetWindowSize = await Patch.readVcdiffUintFromFile(patchFile);
    const deltaEncodingIndicator = (await patchFile.readNext(1)).readUInt8();

    const addsAndRunsDataLength = await Patch.readVcdiffUintFromFile(patchFile);
    const instructionsAndSizesLength = await Patch.readVcdiffUintFromFile(patchFile);
    const copyAddressesLength = await Patch.readVcdiffUintFromFile(patchFile);

    if (winIndicator & VcdiffWinIndicator.ADLER32) {
      (await patchFile.readNext(4)).readUInt32BE(); // TODO(cemmer): handle
    }

    const addsAndRunsData = await patchFile.readNext(addsAndRunsDataLength);
    if (deltaEncodingIndicator & VcdiffDeltaIndicator.DATACOMP) {
      // TODO(cemmer)
    }

    const instructionsAndSizesData = await patchFile.readNext(instructionsAndSizesLength);
    if (deltaEncodingIndicator & VcdiffDeltaIndicator.INSTCOMP) {
      // TODO(cemmer)
    }

    const copyAddressesData = await patchFile.readNext(copyAddressesLength);
    if (deltaEncodingIndicator & VcdiffDeltaIndicator.ADDRCOMP) {
      // TODO(cemmer)
    }

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

  isEOF(): boolean {
    return this.instructionsAndSizeOffset >= this.instructionsAndSizesData.length;
  }

  readInstructionIndex(): number {
    const instructionCodeIdx = this.instructionsAndSizesData
      .readUInt8(this.instructionsAndSizeOffset);
    this.instructionsAndSizeOffset += 1;
    return instructionCodeIdx;
  }

  readInstructionSize(): number {
    const [size, instructionsAndSizeOffset] = Patch.readVcdiffUintFromBuffer(
      this.instructionsAndSizesData,
      this.instructionsAndSizeOffset,
    );
    this.instructionsAndSizeOffset = instructionsAndSizeOffset;
    return size;
  }

  async writeAddData(
    targetFile: FilePoly,
    targetWindowPosition: number,
    size: number,
  ): Promise<void> {
    // Read
    const data = this.addsAndRunsData
      .subarray(this.addsAndRunsOffset, this.addsAndRunsOffset + size);
    this.addsAndRunsOffset += size;
    // Write
    await targetFile.writeAt(data, targetWindowPosition + this.targetWindowOffset);
    this.targetWindowOffset += size;
  }

  async writeRunData(
    targetFile: FilePoly,
    targetWindowPosition: number,
    size: number,
  ): Promise<void> {
    // Read
    const data = Buffer.from(this.addsAndRunsData
      .subarray(this.targetWindowOffset, this.targetWindowOffset + 1)
      .toString('hex')
      .repeat(size), 'hex');
    this.addsAndRunsOffset += 1;
    // Write
    await targetFile.writeAt(data, targetWindowPosition + this.targetWindowOffset);
    this.targetWindowOffset += size;
  }

  async writeCopyData(
    sourceFile: FilePoly,
    targetFile: FilePoly,
    targetWindowPosition: number,
    size: number,
    copyCache: VcdiffCache,
    mode: number,
  ): Promise<void> {
    const [addr, copyAddressesOffset] = copyCache.decode(
      this.copyAddressesData,
      this.copyAddressesOffset,
      this.targetWindowOffset,
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
      await targetFile.writeAt(
        byte,
        targetWindowPosition + this.targetWindowOffset + byteNum,
      );
    }
    this.targetWindowOffset += size;
  }
}

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

  decode(
    copyAddressesData: Buffer,
    copyAddressesOffset: number,
    here: number,
    mode: number,
  ): [number, number] {
    let addr: number;
    let readValue: number;
    let copyAddressesOffsetAfter = copyAddressesOffset;

    if (mode === VcdiffCopyAddressMode.SELF) {
      [readValue, copyAddressesOffsetAfter] = Patch.readVcdiffUintFromBuffer(
        copyAddressesData,
        copyAddressesOffset,
      );
      addr = readValue;
    } else if (mode === VcdiffCopyAddressMode.HERE) {
      [readValue, copyAddressesOffsetAfter] = Patch.readVcdiffUintFromBuffer(
        copyAddressesData,
        copyAddressesOffset,
      );
      addr = here - readValue;
    } else if (mode >= 2 && mode <= this.sNear + 1) {
      const m = mode - 2;
      [readValue, copyAddressesOffsetAfter] = Patch.readVcdiffUintFromBuffer(
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

  static patchFrom(file: File): VcdiffPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new VcdiffPatch(file, crcBefore);
  }

  async createPatchedFile(inputRomFile: File, outputRomPath: string): Promise<void> {
    return this.getFile().extractToTempFilePoly('r', async (patchFile) => {
      const copyCache = new VcdiffCache();
      const header = await VcdiffHeader.fromFilePoly(patchFile);

      return VcdiffPatch.writeOutputFile(
        inputRomFile,
        outputRomPath,
        patchFile,
        header,
        copyCache,
      );
    });
  }

  private static async writeOutputFile(
    inputRomFile: File,
    outputRomPath: string,
    patchFile: FilePoly,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
  ): Promise<void> {
    return inputRomFile.extractToTempFile(async (tempRomFile) => {
      const sourceFile = await FilePoly.fileFrom(tempRomFile, 'r');

      await fsPoly.copyFile(tempRomFile, outputRomPath);
      const targetFile = await FilePoly.fileFrom(outputRomPath, 'r+');

      try {
        await VcdiffPatch.applyPatch(patchFile, sourceFile, targetFile, header, copyCache);
      } finally {
        await targetFile.close();
        await sourceFile.close();
      }
    });
  }

  private static async applyPatch(
    patchFile: FilePoly,
    sourceFile: FilePoly,
    targetFile: FilePoly,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
  ): Promise<void> {
    let targetWindowPosition = 0;

    while (!patchFile.isEOF()) {
      const window = await VcdiffWindow.fromFilePoly(patchFile);
      copyCache.reset();

      await this.applyPatchWindow(
        sourceFile,
        targetFile,
        header,
        copyCache,
        targetWindowPosition,
        window,
      );

      targetWindowPosition += window.deltaEncodingTargetWindowSize;
    }
  }

  private static async applyPatchWindow(
    sourceFile: FilePoly,
    targetFile: FilePoly,
    header: VcdiffHeader,
    copyCache: VcdiffCache,
    targetWindowPosition: number,
    window: VcdiffWindow,
  ): Promise<void> {
    while (!window.isEOF()) {
      const instructionCodeIdx = window.readInstructionIndex();

      for (let i = 0; i <= 1; i += 1) {
        const instruction = header.codeTable[instructionCodeIdx][i];
        if (instruction.type === VcdiffInstruction.NOOP) {
          // eslint-disable-next-line no-continue
          continue;
        }

        let { size } = instruction;
        if (!size) {
          size = window.readInstructionSize();
        }

        if (instruction.type === VcdiffInstruction.ADD) {
          await window.writeAddData(targetFile, targetWindowPosition, size);
        } else if (instruction.type === VcdiffInstruction.RUN) {
          await window.writeRunData(targetFile, targetWindowPosition, size);
        } else if (instruction.type === VcdiffInstruction.COPY) {
          await window.writeCopyData(
            sourceFile,
            targetFile,
            targetWindowPosition,
            size,
            copyCache,
            instruction.mode,
          );
        }
      }
    }
  }
}
