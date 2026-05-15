import type DAT from '../../src/models/dats/dat.js';
import Game from '../../src/models/dats/game.js';
import Header from '../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../src/models/dats/logiqx/logiqxDat.js';
import Release from '../../src/models/dats/release.js';
import ROM from '../../src/models/dats/rom.js';
import DATStatus from '../../src/models/datStatus.js';
import Options from '../../src/models/options.js';

// NOTE(cemmer): the majority of tests would expect to be here are covered in
//  statusGenerator.test.ts instead in order to increase coverage

function givenDAT(): DAT {
  return new LogiqxDAT({
    header: new Header({
      name: 'dat name',
    }),
    games: [
      new Game({
        name: 'game with multiple ROMs and no releases',
        roms: [
          new ROM({ name: 'one.rom', size: 0, crc32: '00000001' }),
          new ROM({ name: 'two.rom', size: 0, crc32: '00000002' }),
        ],
      }),
      new Game({
        name: 'bios with one ROM and one release',
        isBios: 'yes',
        release: [new Release('USA', 'USA', 'EN')],
        roms: new ROM({ name: 'three.rom', size: 0, crc32: '00000003' }),
      }),
      new Game({
        name: 'game with one ROM and multiple releases',
        release: [
          new Release('USA', 'USA', 'EN'),
          new Release('EUR', 'EUR', 'EN'),
          new Release('JPN', 'JPN', 'JA'),
        ],
        roms: new ROM({ name: 'four.rom', size: 0, crc32: '00000004' }),
      }),
    ],
  });
}

it('getDATName', () => {
  const dat = givenDAT();
  const datStatus = new DATStatus(new Options(), dat, []);
  expect(datStatus.getDATName()).toEqual('dat name');
});
