import ClrMamePro from '../../../src/types/logiqx/clrMamePro.js';
import DAT from '../../../src/types/logiqx/dat.js';
import Game from '../../../src/types/logiqx/game.js';
import Header from '../../../src/types/logiqx/header.js';

describe('getGames', () => {
  it('should always return a list', () => {
    const game = new Game({ name: 'game name' });

    expect(new DAT(new Header(), [game]).getGames()).toEqual([game]);
    expect(new DAT(new Header(), game).getGames()).toEqual([game]);
    expect(new DAT(new Header(), []).getGames()).toHaveLength(0);
  });
});

describe('isHeadered', () => {
  it('should return false for clrmamepro header', () => {
    expect(new DAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'header' }),
    }), []).isHeadered()).toEqual(false);
  });

  test.each([
    'Nintendo - Nintendo Entertainment System (Headered) (Parent-Clone)',
  ])('should return true for headered names: %s', (name) => {
    expect(new DAT(new Header({ name }), []).isHeadered()).toEqual(true);
  });
});

describe('isHeaderless', () => {
  it('should return true for clrmamepro header', () => {
    expect(new DAT(new Header({
      clrMamePro: new ClrMamePro({ header: 'header' }),
    }), []).isHeaderless()).toEqual(true);
  });

  test.each([
    'Nintendo - Nintendo Entertainment System (Headerless) (Parent-Clone)',
  ])('should return true for headered names: %s', (name) => {
    expect(new DAT(new Header({ name }), []).isHeaderless()).toEqual(true);
  });
});
