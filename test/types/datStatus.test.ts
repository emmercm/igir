import DATStatus from '../../src/types/datStatus.js';
import DAT from '../../src/types/logiqx/dat.js';
import Game from '../../src/types/logiqx/game.js';
import Header from '../../src/types/logiqx/header.js';
import Parent from '../../src/types/logiqx/parent.js';
import Release from '../../src/types/logiqx/release.js';
import ROM from '../../src/types/logiqx/rom.js';
import Options from '../../src/types/options.js';
import ReleaseCandidate from '../../src/types/releaseCandidate.js';

function givenDAT(): DAT {
  return new DAT(new Header({
    name: 'dat name',
    date: '20220828',
  }), [
    new Game({
      name: 'game with multiple roms and no releases',
      rom: [
        new ROM('one.rom', '00000001'),
        new ROM('two.rom', '00000002'),
      ],
    }),
    new Game({
      name: 'bios with one rom and one release',
      bios: 'yes',
      release: [
        new Release('USA', 'USA', 'EN'),
      ],
      rom: new ROM('three.rom', '00000003'),
    }),
    new Game({
      name: 'game with one rom and multiple releases',
      release: [
        new Release('USA', 'USA', 'EN'),
        new Release('EUR', 'EUR', 'EN'),
        new Release('JPN', 'JPN', 'JA'),
      ],
      rom: new ROM('four.rom', '00000004'),
    }),
  ]);
}

it('getDATName', () => {
  const dat = givenDAT();
  const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
  const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
  expect(datStatus.getDATName()).toEqual('dat name (20220828)');
});

describe('toString', () => {
  it('should return status with no candidates', () => {
    const dat = givenDAT();
    const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
    const options = new Options();
    expect(datStatus.toString(options)).toEqual('0/3 games, 0/1 bioses, 0/2 retail releases found');
  });

  it('should return status where every parent only has a candidate for the first rom', () => {
    const dat = givenDAT();
    const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        const rom = game.getRoms()[0];
        parentsToReleaseCandidates.set(parent, [
          new ReleaseCandidate(
            game,
            game.getReleases()[0],
            [rom],
            [rom].map((gameRom) => gameRom.toFile()),
          ),
        ]);
      });
    });
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
    const options = new Options();
    expect(datStatus.toString(options)).toEqual('2/3 games, 1/1 bioses, 1/2 retail releases found');
  });

  it('should return status where every parent has a candidate for every rom', () => {
    const dat = givenDAT();
    const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        parentsToReleaseCandidates.set(parent, [
          new ReleaseCandidate(
            game,
            game.getReleases()[0],
            game.getRoms(),
            game.getRoms().map((gameRom) => gameRom.toFile()),
          ),
        ]);
      });
    });
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
    const options = new Options();
    expect(datStatus.toString(options)).toEqual('3/3 games, 1/1 bioses, 2/2 retail releases found');
  });
});

describe('toReport', () => {
  it('should return report with no candidates', () => {
    const dat = givenDAT();
    const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
    const options = new Options();
    expect(datStatus.toReport(options)).toEqual(`// dat name (20220828): 3 games, 3 parents defined
// You are missing 3 of 3 known dat name (20220828) items (games, bioses, retail releases)
bios with one rom and one release
game with multiple roms and no releases
game with one rom and multiple releases`);
  });

  it('should return report where every parent only has a candidate for the first rom', () => {
    const dat = givenDAT();
    const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        const rom = game.getRoms()[0];
        parentsToReleaseCandidates.set(parent, [
          new ReleaseCandidate(
            game,
            game.getReleases()[0],
            [rom],
            [rom].map((gameRom) => gameRom.toFile()),
          ),
        ]);
      });
    });
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
    const options = new Options();
    expect(datStatus.toReport(options)).toEqual(`// dat name (20220828): 3 games, 3 parents defined
// You are missing 1 of 3 known dat name (20220828) items (games, bioses, retail releases)
game with multiple roms and no releases`);
  });

  it('should return report where every parent has a candidate for every rom', () => {
    const dat = givenDAT();
    const parentsToReleaseCandidates = new Map<Parent, ReleaseCandidate[]>();
    dat.getParents().forEach((parent) => {
      parent.getGames().forEach((game) => {
        parentsToReleaseCandidates.set(parent, [
          new ReleaseCandidate(
            game,
            game.getReleases()[0],
            game.getRoms(),
            game.getRoms().map((gameRom) => gameRom.toFile()),
          ),
        ]);
      });
    });
    const datStatus = new DATStatus(dat, parentsToReleaseCandidates);
    const options = new Options();
    expect(datStatus.toReport(options)).toEqual(`// dat name (20220828): 3 games, 3 parents defined
// You are missing 0 of 3 known dat name (20220828) items (games, bioses, retail releases)`);
  });
});
