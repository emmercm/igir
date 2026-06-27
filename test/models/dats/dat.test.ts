import Game from '../../../src/models/dats/game.js';
import Header from '../../../src/models/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/models/dats/logiqx/logiqxDat.js';
import MameDAT from '../../../src/models/dats/mame/mameDat.js';

describe('getGames', () => {
  it('should always return a list for Logiqx DATs', () => {
    const game = new Game({ name: 'game name' });

    expect(new LogiqxDAT({ header: new Header(), games: [game] }).getGames()).toEqual([game]);
    expect(new LogiqxDAT({ header: new Header(), games: game }).getGames()).toEqual([game]);
    expect(new LogiqxDAT({ header: new Header() }).getGames()).toHaveLength(0);
  });

  it('should always return a list for MAME DATs', () => {
    const game = new Game({ name: 'machine name' });

    expect(new MameDAT({ machine: [game] }).getGames()).toEqual([game]);
    expect(new MameDAT({ machine: game }).getGames()).toEqual([game]);
    expect(new MameDAT({ machine: [] }).getGames()).toHaveLength(0);
  });
});

describe('isMame', () => {
  it('should be true for a Logiqx DAT built from machines', () => {
    const machine = new Game({ name: 'machine name' });
    expect(new LogiqxDAT({ header: new Header(), machine }).isMame()).toEqual(true);
  });

  it('should be false for a Logiqx DAT built from games', () => {
    const game = new Game({ name: 'game name' });
    expect(new LogiqxDAT({ header: new Header(), games: game }).isMame()).toEqual(false);
  });

  it('should be false for an empty Logiqx DAT', () => {
    expect(new LogiqxDAT({ header: new Header() }).isMame()).toEqual(false);
  });

  it('should stay true for a machine-based Logiqx DAT after withGames', () => {
    const machine = new Game({ name: 'machine name' });
    const dat = new LogiqxDAT({ header: new Header(), machine });
    expect(dat.withGames(dat.getGames()).isMame()).toEqual(true);
  });

  it('should stay false for a game-based Logiqx DAT after withGames', () => {
    const game = new Game({ name: 'game name' });
    const dat = new LogiqxDAT({ header: new Header(), games: game });
    expect(dat.withGames(dat.getGames()).isMame()).toEqual(false);
  });

  it('should be true for a MAME DAT', () => {
    expect(new MameDAT({ machine: new Game({ name: 'machine name' }) }).isMame()).toEqual(true);
  });
});
