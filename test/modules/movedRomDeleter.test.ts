import MovedROMDeleter from '../../src/modules/movedRomDeleter.js';
import ROMScanner from '../../src/modules/romScanner.js';
import fsPoly from '../../src/polyfill/fsPoly.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

it('should do nothing if no ROMs moved', async () => {
  const romFiles = await new ROMScanner(new Options({
    input: ['./test/fixtures/roms'],
  }), new ProgressBarFake()).scan();
  expect(romFiles.length).toBeGreaterThan(0);

  await new MovedROMDeleter(new ProgressBarFake()).delete(romFiles, [], new Map());

  const exists = Promise.all(romFiles.map(async (romFile) => fsPoly.exists(romFile.getFilePath())));
  expect(exists).not.toContain(false);
});

// TODO(cemmer): more meaningful tests
