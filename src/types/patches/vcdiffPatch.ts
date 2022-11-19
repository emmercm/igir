import FilePoly from '../../polyfill/filePoly.js';
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
      const fp = await FilePoly.fileFrom(patchFilePath, 'r');

      const header = await fp.readNext(3);
      if (!header.equals(VcdiffPatch.VCDIFF_HEADER)) {
        await fp.close();
        throw new Error(`Vcdiff patch header is invalid: ${this.getFile().toString()}`);
      }
      await fp.readNext(1); // version

      const hdrIndicator = (await fp.readNext(1)).readUint8();
      let secondaryDecompressorId = 0;
      if (hdrIndicator & VcdiffHdrIndicator.DECOMPRESS) {
        secondaryDecompressorId = (await fp.readNext(1)).readUint8();
        if (secondaryDecompressorId) {
          /**
           * TODO(cemmer): notes for later on LZMA (the default for the xdelta32 tool):
           *  - There appears to be a first byte (or more?), and it might be the length of the
           *    encoded data? Maybe that number is encoded like other numbers are?
           *  - The XZ data encoded appears to be non-standard, it doesn't have a terminating set of
           *    bytes "59 5A", only the starting bytes "FD 37 7A 58 5A 00" (after the above number)
           */
          await fp.close();
          throw new Error(`Unsupported Vcdiff secondary decompressor ${VcdiffSecondaryCompression[secondaryDecompressorId]}: ${this.getFile().toString()}`);
        }
      }
      if (hdrIndicator & VcdiffHdrIndicator.CODETABLE) {
        const codeTableLength = await Patch.readVcdiffUintFromFile(fp);
        if (codeTableLength) {
          await fp.close();
          throw new Error(`Can't parse Vcdiff application-defined code table: ${this.getFile().toString()}`);
        }
      }
      if (hdrIndicator & VcdiffHdrIndicator.APPHEADER) {
        const appHeaderLength = await Patch.readVcdiffUintFromFile(fp);
        await fp.readNext(appHeaderLength);
      }

      const result = await file.extractToTempFile(async (tempFile) => {
        const targetFile = await FilePoly.fileFrom(tempFile, 'r+');
        let targetWindowPosition = 0;

        /* eslint-disable no-await-in-loop */
        while (!fp.isEOF()) {
          const winIndicator = (await fp.readNext(1)).readUint8();
          let sourceSegmentSize = 0;
          let sourceSegmentPosition = 0;
          if (winIndicator & (VcdiffWinIndicator.SOURCE | VcdiffWinIndicator.TARGET)) {
            sourceSegmentSize = await Patch.readVcdiffUintFromFile(fp);
            sourceSegmentPosition = await Patch.readVcdiffUintFromFile(fp);
          }

          const deltaEncodingLength = await Patch.readVcdiffUintFromFile(fp);
          const deltaEncodingTargetWindowSize = await Patch.readVcdiffUintFromFile(fp);
          const deltaEncodingIndicator = (await fp.readNext(1)).readUint8();

          const addsAndRunsDataLength = await Patch.readVcdiffUintFromFile(fp);
          const instructionsAndSizesLength = await Patch.readVcdiffUintFromFile(fp);
          const copyAddressesLength = await Patch.readVcdiffUintFromFile(fp);

          if (winIndicator & VcdiffWinIndicator.ADLER32) {
            (await fp.readNext(4)).readUInt32BE(); // TODO(cemmer): handle
          }

          let targetWindowOffset = 0;

          let addsAndRunsOffset = 0;
          const addsAndRunsData = await fp.readNext(addsAndRunsDataLength);
          if (deltaEncodingIndicator & VcdiffDeltaIndicator.DATACOMP) {
            // TODO(cemmer)
          }

          let instructionsAndSizeOffset = 0;
          const instructionsAndSizesData = await fp.readNext(instructionsAndSizesLength);
          if (deltaEncodingIndicator & VcdiffDeltaIndicator.INSTCOMP) {
            // TODO(cemmer)
          }

          const copyAddressesData = await fp.readNext(copyAddressesLength);
          if (deltaEncodingIndicator & VcdiffDeltaIndicator.ADDRCOMP) {
            // TODO(cemmer)
          }

          while (instructionsAndSizeOffset < instructionsAndSizesData.length) {
            const instructionCodeIdx = instructionsAndSizesData
              .readUint8(instructionsAndSizeOffset);
            instructionsAndSizeOffset += 1;

            for (let i = 0; i <= 1; i += 1) {
              const instruction = VcdiffPatch.VCDIFF_DEFAULT_CODE_TABLE[instructionCodeIdx][i];
              if (instruction.type === VcdiffInstruction.NOOP) {
                continue;
              }

              let { size } = instruction;
              if (!size) {
                [size, instructionsAndSizeOffset] = Patch
                  .readVcdiffUintFromBuffer(instructionsAndSizesData, instructionsAndSizeOffset);
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
                const i = 0;
              }
            }
          }

          targetWindowPosition += deltaEncodingTargetWindowSize;
        }

        await targetFile.close();

        return callback(tempFile);
      });

      await fp.close();

      return result;
    });
  }
}
