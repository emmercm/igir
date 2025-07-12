import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import DriveSemaphore from '../../../src/async/driveSemaphore.js';
import Logger from '../../../src/console/logger.js';
import { LogLevel } from '../../../src/console/logLevel.js';
import Temp from '../../../src/globals/temp.js';
import ROMTrimProcessor from '../../../src/modules/roms/romTrimProcessor.js';
import FsPoly from '../../../src/polyfill/fsPoly.js';
import type File from '../../../src/types/files/file.js';
import FileCache from '../../../src/types/files/fileCache.js';
import { ChecksumBitmask } from '../../../src/types/files/fileChecksums.js';
import FileFactory from '../../../src/types/files/fileFactory.js';
import FileSignature from '../../../src/types/files/fileSignature.js';
import type { OptionsProps } from '../../../src/types/options.js';
import Options from '../../../src/types/options.js';
import ProgressBarFake from '../../console/progressBarFake.js';

const LOGGER = new Logger(LogLevel.NEVER, new PassThrough());

if (!(await FsPoly.exists(Temp.getTempDir()))) {
  await FsPoly.mkdir(Temp.getTempDir(), { recursive: true });
}

async function processFile(
  optionsProps: OptionsProps,
  fileSignature: FileSignature,
  size: number,
  paddingByte: number,
): Promise<File> {
  const options = new Options(optionsProps);
  const fileFactory = new FileFactory(new FileCache(), LOGGER);

  const trimmedContents = Buffer.alloc(size, paddingByte);
  fileSignature.getSignaturePieces().forEach((signaturePiece) => {
    signaturePiece.value.copy(trimmedContents, signaturePiece.offset);
  });
  const tempTrimmedFilePath = await FsPoly.mktemp(
    path.join(Temp.getTempDir(), `trimmed${fileSignature.getExtension()}`),
  );
  try {
    await FsPoly.writeFile(tempTrimmedFilePath, trimmedContents);
    const tempTrimmedFile = await fileFactory.fileFrom(tempTrimmedFilePath, ChecksumBitmask.CRC32);

    const processedFiles = await new ROMTrimProcessor(
      options,
      new ProgressBarFake(),
      fileFactory,
      new DriveSemaphore(os.cpus().length),
    ).process([tempTrimmedFile]);

    expect(processedFiles).toHaveLength(1);
    return processedFiles[0];
  } finally {
    await FsPoly.rm(tempTrimmedFilePath, { force: true });
  }
}

describe.each(
  FileSignature.SIGNATURES.filter((signature) => !signature.canBeTrimmed()).slice(0, 5),
)('not known trimmable signature: %s', (fileSignature) => {
  describe.each([0x00, 0xff])('padding byte: %s', (paddingByte) => {
    describe.each([10, 11, 12, 13].map((pow) => Math.pow(2, pow)))('size: %s', (size) => {
      it('should not return paddings with default options', async () => {
        const processedFile = await processFile(
          { dat: [os.devNull] },
          fileSignature,
          size * 0.75,
          paddingByte,
        );
        expect(processedFile.getPaddings()).toHaveLength(0);
      });

      it('should return paddings when detection forced', async () => {
        const processedFile = await processFile(
          {
            dat: [os.devNull],
            trimmedGlob: '**/*',
          },
          fileSignature,
          size * 0.75,
          paddingByte,
        );
        expect(processedFile.getPaddings()).toHaveLength(2);
      });
    });
  });
});

describe.each(FileSignature.SIGNATURES.filter((signature) => signature.canBeTrimmed()))(
  'known trimmable signature: %s',
  (fileSignature) => {
    describe.each([0x00, 0xff])('padding byte: %s', (paddingByte) => {
      describe.each([10, 11, 12, 13].map((pow) => Math.pow(2, pow)))('size: %s', (size) => {
        it('should not process any files when no DATs provided', async () => {
          const processedFile = await processFile({}, fileSignature, size * 0.75, paddingByte);
          expect(processedFile.getPaddings()).toHaveLength(0);
        });

        it('should not return any paddings if the file is not trimmed', async () => {
          const processedFile = await processFile(
            { dat: [os.devNull] },
            fileSignature,
            size,
            paddingByte,
          );
          expect(processedFile.getPaddings()).toHaveLength(0);
        });

        it('should return paddings if the file is trimmed', async () => {
          const processedFile = await processFile(
            { dat: [os.devNull] },
            fileSignature,
            size * 0.75,
            paddingByte,
          );
          expect(processedFile.getPaddings()).toHaveLength(2);
        });
      });
    });
  },
);
