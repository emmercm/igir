import DATStatus from '../../src/types/datStatus.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';

// NOTE(cemmer): the majority of tests would expect to be here are covered in
//  statusGenerator.test.ts instead in order to increase coverage

function givenDAT(): DAT {
  return new DAT(new Header({
    name: 'dat name',
    date: '20220828',
  }), [
    new Game({
      name: 'game with multiple ROMs and no releases',
      rom: [
        new ROM('one.rom', 0, '00000001'),
        new ROM('two.rom', 0, '00000002'),
      ],
    }),
    new Game({
      name: 'bios with one ROM and one release',
      bios: 'yes',
      release: [
        new Release('USA', 'USA', 'EN'),
      ],
      rom: new ROM('three.rom', 0, '00000003'),
    }),
    new Game({
      name: 'game with one ROM and multiple releases',
      release: [
        new Release('USA', 'USA', 'EN'),
        new Release('EUR', 'EUR', 'EN'),
        new Release('JPN', 'JPN', 'JA'),
      ],
      rom: new ROM('four.rom', 0, '00000004'),
    }),
  ]);
}

it('getDATName', () => {
  const dat = givenDAT();
  const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
  const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
  expect(datStatus.getDATName()).toEqual('dat name');
});
