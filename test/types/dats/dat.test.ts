import Game from '../../../src/types/dats/game.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import MameDAT from '../../../src/types/dats/mame/mameDat.js';

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
