import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import Temp from '../../../src/globals/temp.js';
import type File from '../../../src/models/files/file.js';
import { ChecksumBitmask } from '../../../src/models/files/fileChecksums.js';
import FileSignature from '../../../src/models/files/fileSignature.js';
import type { OptionsProps } from '../../../src/models/options.js';
import Options from '../../../src/models/options.js';
import { TrimScanFiles, TrimScanFilesInverted } from '../../../src/models/options.js';
import ROMTrimProcessor from '../../../src/modules/roms/romTrimProcessor.js';
import FsUtil from '../../../src/utils/fsUtil.js';
import ProgressBarFake from '../../console/progressBarFake.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
}

async function processFile(
  optionsProps: OptionsProps,
  fileSignature: FileSignature,
  size: number,
  paddingByte: number,
): Promise<File> {
  const options = new Options({
    trimScanFiles: TrimScanFilesInverted[TrimScanFiles.AUTO].toLowerCase(),
    ...optionsProps,
  });
  const fileFactory = new FileFactory(new FileCache());

  const trimmedContents = Buffer.alloc(size, paddingByte);
  for (const signaturePiece of fileSignature.getSignaturePieces()) {
    if (signaturePiece.value === undefined) {
      throw new Error('only static header values are supported in this test fixture');
    }
    signaturePiece.value.copy(trimmedContents, signaturePiece.offset);
  }
  const tempTrimmedFilePath = await FsUtil.mktemp(
    path.join(Temp.getTempDir(), `trimmed${fileSignature.getExtension()}`),
  );
  try {
    await FsUtil.writeFile(tempTrimmedFilePath, trimmedContents);
    const tempTrimmedFile = await fileFactory.fileFrom(tempTrimmedFilePath, ChecksumBitmask.CRC32);

    const processedFiles = await new ROMTrimProcessor(
      options,
      new ProgressBarFake(),
      fileFactory,
      new MappableSemaphore(os.availableParallelism()),
    ).process([tempTrimmedFile]);

    expect(processedFiles).toHaveLength(1);
    return processedFiles[0];
  } finally {
    await FsUtil.rm(tempTrimmedFilePath, { force: true });
  }
}

describe.each(
  FileSignature.SIGNATURES.filter((signature) => !signature.canBeTrimmed())
    .filter((fileSignature) =>
      fileSignature
        .getSignaturePieces()
        .every((signaturePiece) => signaturePiece.value !== undefined),
    )
    .slice(0, 5)
    .map((fileSignature) => [fileSignature.getExtension(), fileSignature]),
)('not known trimmable signature: %s', (_, fileSignature) => {
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

      test.each(Object.values(TrimScanFilesInverted))(
        'should return paddings when detection forced: %s',
        async (trimScanFiles) => {
          const processedFile = await processFile(
            {
              dat: [os.devNull],
              trimmedGlob: '**/*',
              trimScanFiles: trimScanFiles.toLowerCase(),
            },
            fileSignature,
            size * 0.75,
            paddingByte,
          );
          expect(processedFile.getPaddings()).toHaveLength(2);
        },
      );

      it('should not return paddings with trim-scan-files=never', async () => {
        const processedFile = await processFile(
          { dat: [os.devNull], trimScanFiles: 'never' },
          fileSignature,
          size * 0.75,
          paddingByte,
        );
        expect(processedFile.getPaddings()).toHaveLength(0);
      });

      it('should return paddings with trim-scan-files=always', async () => {
        const processedFile = await processFile(
          { dat: [os.devNull], trimScanFiles: 'always' },
          fileSignature,
          size * 0.75,
          paddingByte,
        );
        expect(processedFile.getPaddings()).toHaveLength(2);
      });
    });
  });
});

describe.each(
  FileSignature.SIGNATURES.filter((signature) => signature.canBeTrimmed()).map((fileSignature) => [
    fileSignature.getExtension(),
    fileSignature,
  ]),
)('known trimmable signature: %s', (_, fileSignature) => {
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

      it('should not return paddings with trim-scan-files=never', async () => {
        const processedFile = await processFile(
          { dat: [os.devNull], trimScanFiles: 'never' },
          fileSignature,
          size * 0.75,
          paddingByte,
        );
        expect(processedFile.getPaddings()).toHaveLength(0);
      });
    });
  });
});
