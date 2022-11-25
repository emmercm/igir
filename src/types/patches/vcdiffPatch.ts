// eslint-disable-next-line max-classes-per-file
import { promises as fsPromises } from 'fs';
import path from 'path';

import Constants from '../../constants.js';
import FilePoly from '../../polyfill/filePoly.js';
import fsPoly from '../../polyfill/fsPoly.js';
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
  mode: number;
}

class VcdiffCache {
  private readonly sNear: number;

  private readonly near: number[];

  private nextSlot = 0;

  private readonly sSame: number;

  private readonly same: number[];

  constructor(sNear = 4, sSame = 3) {
    this.sNear = sNear;
    this.near = new Array(sNear);
    this.sSame = sSame;
    this.same = new Array(sSame * 256);
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
      readValue = copyAddressesData.readUint8(copyAddressesOffset);
      copyAddressesOffsetAfter += 1;
      addr = this.same[m * 256 + readValue];
    }

    this.update(addr);

    return [addr, copyAddressesOffsetAfter];
  }
}

/**
 * @link https://www.rfc-editor.org/rfc/rfc3284
 * @link https://github.com/jmacd/xdelta
 */
export default class VcdiffPatch extends Patch {
  static readonly SUPPORTED_EXTENSIONS = ['.vcdiff', '.xdelta'];

  private static readonly VCDIFF_HEADER = Buffer.from('d6c3c4', 'hex');

  private static readonly VCDIFF_DEFAULT_CODE_TABLE = ((): VcdiffDeltaInstruction[][] => {
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

  static patchFrom(file: File): VcdiffPatch {
    const crcBefore = Patch.getCrcFromPath(file.getExtractedFilePath());
    return new VcdiffPatch(file, crcBefore);
  }

  async apply<T>(file: File, callback: (tempFile: string) => (Promise<T> | T)): Promise<T> {
    /* eslint-disable no-bitwise */
    return this.getFile().extractToFile(async (patchFilePath) => {
      const patchFile = await FilePoly.fileFrom(patchFilePath, 'r');

      const header = await patchFile.readNext(3);
      if (!header.equals(VcdiffPatch.VCDIFF_HEADER)) {
        await patchFile.close();
        throw new Error(`Vcdiff patch header is invalid: ${this.getFile().toString()}`);
      }
      await patchFile.readNext(1); // version

      const hdrIndicator = (await patchFile.readNext(1)).readUint8();
      let secondaryDecompressorId = 0;
      if (hdrIndicator & VcdiffHdrIndicator.DECOMPRESS) {
        secondaryDecompressorId = (await patchFile.readNext(1)).readUint8();
        if (secondaryDecompressorId) {
          /**
           * TODO(cemmer): notes for later on LZMA (the default for the xdelta3 tool):
           *  - There appears to be a first byte (or more?), and it might be the length of the
           *    encoded data? Maybe that number is encoded like other numbers are?
           *  - The XZ data encoded appears to be non-standard, it doesn't have a terminating set of
           *    bytes "59 5A", only the starting bytes "FD 37 7A 58 5A 00" (after the above number)
           */
          await patchFile.close();
          throw new Error(`Unsupported Vcdiff secondary decompressor ${VcdiffSecondaryCompression[secondaryDecompressorId]}: ${this.getFile().toString()}`);
        }
      }
      if (hdrIndicator & VcdiffHdrIndicator.CODETABLE) {
        const codeTableLength = await Patch.readVcdiffUintFromFile(patchFile);
        if (codeTableLength) {
          await patchFile.close();
          throw new Error(`Can't parse Vcdiff application-defined code table: ${this.getFile().toString()}`);
        }
      }
      if (hdrIndicator & VcdiffHdrIndicator.APPHEADER) {
        const appHeaderLength = await Patch.readVcdiffUintFromFile(patchFile);
        await patchFile.readNext(appHeaderLength);
      }

      const copyCache = new VcdiffCache();

      const result = await file.extractToFile(async (sourceFilePath) => {
        const targetFilePath = fsPoly.mktempSync(path.join(
          Constants.GLOBAL_TEMP_DIR,
          `${path.basename(sourceFilePath)}.vcdiff`,
        ));
        await fsPromises.copyFile(sourceFilePath, targetFilePath);
        const targetFile = await FilePoly.fileFrom(targetFilePath, 'r+');

        const sourceFile = await FilePoly.fileFrom(sourceFilePath, 'r');

        let targetWindowPosition = 0;

        /* eslint-disable no-await-in-loop */
        while (!patchFile.isEOF()) {
          const winIndicator = (await patchFile.readNext(1)).readUint8();
          let sourceSegmentSize = 0;
          let sourceSegmentPosition = 0;
          if (winIndicator & (VcdiffWinIndicator.SOURCE | VcdiffWinIndicator.TARGET)) {
            sourceSegmentSize = await Patch.readVcdiffUintFromFile(patchFile);
            sourceSegmentPosition = await Patch.readVcdiffUintFromFile(patchFile);
          }

          await Patch.readVcdiffUintFromFile(patchFile); // delta encoding length
          const deltaEncodingTargetWindowSize = await Patch.readVcdiffUintFromFile(patchFile);
          const deltaEncodingIndicator = (await patchFile.readNext(1)).readUint8();

          const addsAndRunsDataLength = await Patch.readVcdiffUintFromFile(patchFile);
          const instructionsAndSizesLength = await Patch.readVcdiffUintFromFile(patchFile);
          const copyAddressesLength = await Patch.readVcdiffUintFromFile(patchFile);

          if (winIndicator & VcdiffWinIndicator.ADLER32) {
            (await patchFile.readNext(4)).readUInt32BE(); // TODO(cemmer): handle
          }

          let targetWindowOffset = 0;

          let addsAndRunsOffset = 0;
          const addsAndRunsData = await patchFile.readNext(addsAndRunsDataLength);
          if (deltaEncodingIndicator & VcdiffDeltaIndicator.DATACOMP) {
            // TODO(cemmer)
          }

          let instructionsAndSizeOffset = 0;
          const instructionsAndSizesData = await patchFile.readNext(instructionsAndSizesLength);
          if (deltaEncodingIndicator & VcdiffDeltaIndicator.INSTCOMP) {
            // TODO(cemmer)
          }

          let copyAddressesOffset = 0;
          const copyAddressesData = await patchFile.readNext(copyAddressesLength);
          if (deltaEncodingIndicator & VcdiffDeltaIndicator.ADDRCOMP) {
            // TODO(cemmer)
          }

          copyCache.reset();

          while (instructionsAndSizeOffset < instructionsAndSizesData.length) {
            const instructionCodeIdx = instructionsAndSizesData
              .readUint8(instructionsAndSizeOffset);
            instructionsAndSizeOffset += 1;

            for (let i = 0; i <= 1; i += 1) {
              const instruction = VcdiffPatch.VCDIFF_DEFAULT_CODE_TABLE[instructionCodeIdx][i];
              if (instruction.type === VcdiffInstruction.NOOP) {
                // eslint-disable-next-line no-continue
                continue;
              }

              let { size } = instruction;
              if (!size) {
                [size, instructionsAndSizeOffset] = Patch.readVcdiffUintFromBuffer(
                  instructionsAndSizesData,
                  instructionsAndSizeOffset,
                );
              }

              if (instruction.type === VcdiffInstruction.ADD) {
                // Read
                const data = addsAndRunsData
                  .subarray(addsAndRunsOffset, addsAndRunsOffset + size);
                addsAndRunsOffset += size;
                // Write
                await targetFile.writeAt(data, targetWindowPosition + targetWindowOffset);
                targetWindowOffset += size;
              } else if (instruction.type === VcdiffInstruction.RUN) {
                // Read
                const data = Buffer.from(addsAndRunsData
                  .subarray(targetWindowOffset, targetWindowOffset + 1)
                  .toString('hex')
                  .repeat(size), 'hex');
                addsAndRunsOffset += 1;
                // Write
                await targetFile.writeAt(data, targetWindowPosition + targetWindowOffset);
                targetWindowOffset += size;
              } else if (instruction.type === VcdiffInstruction.COPY) {
                let addr: number;
                [addr, copyAddressesOffset] = copyCache.decode(
                  copyAddressesData,
                  copyAddressesOffset,
                  targetWindowOffset,
                  instruction.mode,
                );

                /**
                 * NOTE(cemmer): this has to write byte-by-byte because it may read-after-write with
                 *  the target file.
                 */
                for (let byteNum = 0; byteNum < size; byteNum += 1) {
                  let byte: Buffer;
                  if (addr < sourceSegmentSize) {
                    if (winIndicator & VcdiffWinIndicator.SOURCE) {
                      byte = await sourceFile.readAt(sourceSegmentPosition + addr + byteNum, 1);
                    } else {
                      byte = await targetFile.readAt(sourceSegmentPosition + addr + byteNum, 1);
                    }
                  } else {
                    byte = await targetFile.readAt(
                      targetWindowPosition + (addr - sourceSegmentSize) + byteNum,
                      1,
                    );
                  }
                  await targetFile.writeAt(
                    byte,
                    targetWindowPosition + targetWindowOffset + byteNum,
                  );
                }
                targetWindowOffset += size;
              }
            }
          }

          targetWindowPosition += deltaEncodingTargetWindowSize;
        }

        await targetFile.close();
        await sourceFile.close();

        const callbackResult = await callback(targetFilePath);
        await fsPoly.rm(targetFilePath);
        return callbackResult;
      });

      await patchFile.close();

      return result;
    });
  }
}
