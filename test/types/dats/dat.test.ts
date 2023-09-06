import Game from '../../../src/types/dats/game.js';
import ClrMamePro from '../../../src/types/dats/logiqx/clrMamePro.js';
import Header from '../../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../../src/types/dats/logiqx/logiqxDat.js';
import Machine from '../../../src/types/dats/machine.js';
import MameDAT from '../../../src/types/dats/mame/mameDat.js';

describe('getGames', () => {
  it('should always return a list for Logiqx DATs', () => {
    const game = new Game({ name: 'game name' });

    expect(new LogiqxDAT(new Header(), [game]).getGames()).toEqual([game]);
    expect(new LogiqxDAT(new Header(), game).getGames()).toEqual([game]);
    expect(new LogiqxDAT(new Header(), []).getGames()).toHaveLength(0);
  });

  it('should always return a list for MAME DATs', () => {
    const machine = new Machine({ name: 'machine name' });

    expect(new MameDAT([machine]).getGames()).toEqual([machine]);
    expect(new MameDAT(machine).getGames()).toEqual([machine]);
    expect(new MameDAT([]).getGames()).toHaveLength(0);
  });
});

describe('isHeadered', () => {
  it('should return false for clrmamepro header', () => {
    expect(new LogiqxDAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'header' }),
    }), []).isHeadered()).toEqual(false);
  });

  test.each([
    'Nintendo - Nintendo Entertainment System (Headered) (Parent-Clone)',
  ])('should return true for headered names: %s', (name) => {
    expect(new LogiqxDAT(new Header({ name }), []).isHeadered()).toEqual(true);
  });
});

describe('isHeaderless', () => {
  it('should return true for clrmamepro header', () => {
    expect(new LogiqxDAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'header' }),
    }), []).isHeaderless()).toEqual(true);
  });

  test.each([
    'Nintendo - Nintendo Entertainment System (Headerless) (Parent-Clone)',
  ])('should return true for headered names: %s', (name) => {
    expect(new LogiqxDAT(new Header({ name }), []).isHeaderless()).toEqual(true);
  });
});
