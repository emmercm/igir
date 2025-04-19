import DAT from '../../src/types/dats/dat.js';
import Game from '../../src/types/dats/game.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';
import Release from '../../src/types/dats/release.js';
import ROM from '../../src/types/dats/rom.js';
import DATStatus from '../../src/types/datStatus.js';

// NOTE(cemmer): the majority of tests would expect to be here are covered in
//  statusGenerator.test.ts instead in order to increase coverage

function givenDAT(): DAT {
  return new LogiqxDAT(
    new Header({
      name: 'dat name',
    }),
    [
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
  );
}

it('getDATName', () => {
  const dat = givenDAT();
  const datStatus = new DATStatus(dat, []);
  expect(datStatus.getDATName()).toEqual('dat name');
});
