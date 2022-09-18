import path from 'path';

import HeaderProcessor from '../../src/modules/headerProcessor.js';
import ROMScanner from '../../src/modules/romScanner.js';
import File from '../../src/types/files/file.js';
import FileHeader from '../../src/types/files/fileHeader.js';
import ClrMamePro from '../../src/types/logiqx/clrMamePro.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';
import ProgressBarFake from '../console/progressBarFake.js';

async function buildGamesFromFiles(files: File[]): Promise<Game[]> {
  const games: Game[] = [];
  /* eslint-disable no-await-in-loop */
  for (let i = 0; i < files.length; i += 1) {
    const romFile = files[i];

    const name = path.basename(romFile.getExtractedFilePath());
    const rom = new ROM(name, await romFile.getCrc32());
    const game = new Game({
      name,
      rom: [rom],
    });

    games.push(game);
  }
  return games;
}

describe('dat has header name', () => {
  it('should do nothing if headered files don\'t match header name in dat', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/*{.lnx,.nes,.fds}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);
    const games = await buildGamesFromFiles(inputRomFiles);

    const dat = new DAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'No-Intro_A7800.xml' }),
    }), games);
    const processedRomFiles = await new HeaderProcessor(new Options(), new ProgressBarFake())
      .process(dat, inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      await expect(inputRomFiles[i].equals(processedRomFiles[i])).resolves.toEqual(true);
    }
  });

  test.each([
    'No-Intro_A7800.xml',
    'No-Intro_LNX.xml',
    'No-Intro_NES.xml',
    'No-Intro_FDS.xml',
  ])('should process headered files for name: %s', async (headerName) => {
    const fileHeader = FileHeader.getForName(headerName) as FileHeader;

    const inputRomFiles = await new ROMScanner(new Options({
      input: [`./test/fixtures/roms/headered/*${fileHeader.fileExtension}*`],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);
    const games = await buildGamesFromFiles(inputRomFiles);

    const dat = new DAT(new Header({
      clrMamePro: new ClrMamePro({ header: headerName }),
    }), games);
    const processedRomFiles = await new HeaderProcessor(new Options(), new ProgressBarFake())
      .process(dat, inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should have changed
      await expect(inputRomFiles[i].equals(processedRomFiles[i])).resolves.toEqual(false);
    }
  });
});

describe('extension has possible header', () => {
  it('should do nothing if extension not found', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/{,**/}*.rom'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);
    const games = await buildGamesFromFiles(inputRomFiles);

    const dat = new DAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'non-existent header' }),
    }), games);
    const processedRomFiles = await new HeaderProcessor(new Options(), new ProgressBarFake())
      .process(dat, inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      await expect(inputRomFiles[i].equals(processedRomFiles[i])).resolves.toEqual(true);
    }
  });

  it('should process headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/*{.a78,.lnx,.nes,.fds}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);
    const games = await buildGamesFromFiles(inputRomFiles);

    const dat = new DAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'non-existent header' }),
    }), games);
    const processedRomFiles = await new HeaderProcessor(new Options(), new ProgressBarFake())
      .process(dat, inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should have changed
      await expect(inputRomFiles[i].equals(processedRomFiles[i])).resolves.toEqual(false);
    }
  });
});

describe('should read file for header', () => {
  it('should do nothing with un-headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/!(headered){,/}*'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);
    const games = await buildGamesFromFiles(inputRomFiles);

    const dat = new DAT(new Header(), games);
    const processedRomFiles = await new HeaderProcessor(new Options({
      header: '**/*',
    }), new ProgressBarFake()).process(dat, inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      await expect(inputRomFiles[i].equals(processedRomFiles[i])).resolves.toEqual(true);
    }
  });

  it('should process headered files', async () => {
    const inputRomFiles = await new ROMScanner(new Options({
      input: ['./test/fixtures/roms/headered/!(*{.a78,.lnx,.nes,.fds}*)'],
    }), new ProgressBarFake()).scan();
    expect(inputRomFiles.length).toBeGreaterThan(0);
    const games = await buildGamesFromFiles(inputRomFiles);

    const dat = new DAT(new Header(), games);
    const processedRomFiles = await new HeaderProcessor(new Options({
      header: '**/*',
    }), new ProgressBarFake()).process(dat, inputRomFiles);

    expect(processedRomFiles).toHaveLength(inputRomFiles.length);
    /* eslint-disable no-await-in-loop */
    for (let i = 0; i < processedRomFiles.length; i += 1) {
      // CRC should have changed
      await expect(inputRomFiles[i].equals(processedRomFiles[i])).resolves.toEqual(false);
    }
  });
});
