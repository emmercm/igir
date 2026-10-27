import os from 'node:os';
import path from 'node:path';

import MappableSemaphore from '../../../src/async/mappableSemaphore.js';
import FileCache from '../../../src/cache/fileCache.js';
import FileFactory from '../../../src/factories/fileFactory.js';
import type File from '../../../src/models/files/file.js';
import FileSignature from '../../../src/models/files/fileSignature.js';
import type ROMHeader from '../../../src/models/files/romHeader.js';
import Options from '../../../src/models/options.js';
import ROMScanner from '../../../src/modules/roms/romScanner.js';
import ProgressBarFake from '../../console/progressBarFake.js';

async function scan(input: string[], inputExclude: string[] = []): Promise<File[]> {
  return await new ROMScanner(
    new Options({ input, inputExclude }),
    new ProgressBarFake(),
    new FileFactory(new FileCache()),
    new MappableSemaphore(os.availableParallelism()),
  ).scan();
}

describe('getROMHeaderExtensions', () => {
  it('should return every headered extension', () => {
    expect(FileSignature.getROMHeaderExtensions()).toEqual([
      '.a78',
      '.fds',
      '.lnx',
      '.nes',
      '.smc',
    ]);
  });
});

describe('romHeaderFromFilename', () => {
  test.each([
    ['rom.a78', 128, '.a78'],
    ['rom.lnx', 64, '.lyx'],
    ['rom.lyx', 64, '.lyx'],
    ['rom.nes', 16, '.nes'],
    ['rom.fds', 16, '.fds'],
    ['rom.smc', 512, '.sfc'],
    ['rom.sfc', 512, '.sfc'],
    ['rom.zip.fds', 16, '.fds'],
  ])('should get a ROM header for: %s', (filePath, dataOffsetBytes, headerlessFileExtension) => {
    const romHeader = FileSignature.romHeaderFromFilename(filePath);
    expect([romHeader?.getDataOffsetBytes(), romHeader?.getHeaderlessFileExtension()]).toEqual([
      dataOffsetBytes,
      headerlessFileExtension,
    ]);
  });

  test.each(['', ' '.repeat(3), '.nes', 'rom.zip', 'rom.nes.zip'])(
    'should not get a ROM header for: %s',
    (filePath) => {
      expect(FileSignature.romHeaderFromFilename(filePath)).toBeUndefined();
    },
  );
});

describe('getROMHeader', () => {
  it('should get a ROM header for headered files', async () => {
    const headeredRoms = await scan([path.join('test', 'fixtures', 'roms', 'headered')]);

    const results = await Promise.all(
      headeredRoms.map(
        async (headeredRom): Promise<[string, string | undefined, ROMHeader | undefined]> => {
          const signature = FileSignature.signatureFromBuffer(
            await headeredRom.readFirstBytes(FileSignature.MAX_HEADER_LENGTH_BYTES),
          );
          return [
            path.basename(headeredRom.getExtractedFilePath()),
            signature?.getName(),
            signature?.getROMHeader(),
          ];
        },
      ),
    );
    expect(results.toSorted((a, b) => a[0].localeCompare(b[0]))).toEqual([
      ['allpads.nes', 'nes_2', FileSignature.romHeaderFromFilename('rom.nes')],
      [
        'color_test.nintendoentertainmentsystem',
        'nes_ines',
        FileSignature.romHeaderFromFilename('rom.nes'),
      ],
      ['diagnostic_test_cartridge.a78', 'a78', FileSignature.romHeaderFromFilename('rom.a78')],
      ['fds_joypad_test.fds', 'fds', FileSignature.romHeaderFromFilename('rom.fds')],
      ['LCDTestROM.lnx', 'lnx', FileSignature.romHeaderFromFilename('rom.lnx')],
      ['speed_test_v51.smc', 'smc', FileSignature.romHeaderFromFilename('rom.smc')],
    ]);
  });

  it('should not get a ROM header for non-headered files', async () => {
    const roms = await scan(
      [path.join('test', 'fixtures', 'roms', '!(headered){,/}*')],
      [path.join('test', 'fixtures', 'roms', 'chd'), path.join('test', 'fixtures', 'roms', 'nkit')],
    );
    expect(roms.length).toBeGreaterThan(0);

    for (const rom of roms) {
      const signature = FileSignature.signatureFromBuffer(
        await rom.readFirstBytes(FileSignature.MAX_HEADER_LENGTH_BYTES),
      );
      expect(signature?.getROMHeader()).toBeUndefined();
    }
  });

  it.each(['smc_gd3_1', 'smc_gd3_2'])(
    'should get the SMC ROM header for Game Doctor signature: %s',
    (signatureName) => {
      expect(FileSignature.signatureFromName(signatureName)?.getROMHeader()).toBe(
        FileSignature.romHeaderFromFilename('rom.smc'),
      );
    },
  );
});
