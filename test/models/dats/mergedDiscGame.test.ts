import Game from '../../../src/models/dats/game.js';
import MergedDiscGame from '../../../src/models/dats/mergedDiscGame.js';
import ROM from '../../../src/models/dats/rom.js';

const discOne = new Game({
  name: 'Game (Disc 1)',
  roms: [
    new ROM({ name: 'Game (Disc 1).cue', size: 97, crc32: '11111111' }),
    new ROM({ name: 'Game (Disc 1).bin', size: 100, crc32: '22222222' }),
  ],
});
const discTwo = new Game({
  name: 'Game (Disc 2)',
  roms: [
    new ROM({ name: 'Game (Disc 2).cue', size: 97, crc32: '33333333' }),
    new ROM({ name: 'Game (Disc 2).bin', size: 200, crc32: '44444444' }),
  ],
});

describe('getSubGames', () => {
  it('should return the sub-games it was constructed with', () => {
    const merged = new MergedDiscGame({ name: 'Game', subGames: [discOne, discTwo] });
    expect(merged.getSubGames()).toEqual([discOne, discTwo]);
  });
});

describe('getRoms', () => {
  it('should return the flattened sub-game ROM instances', () => {
    const merged = new MergedDiscGame({ name: 'Game', subGames: [discOne, discTwo] });
    expect(merged.getRoms()).toEqual([...discOne.getRoms(), ...discTwo.getRoms()]);
  });

  it('should seed the inherited roms field so an object spread sees the flattened ROMs', () => {
    const merged = new MergedDiscGame({ name: 'Game', subGames: [discOne, discTwo] });
    // An object spread (e.g. `new Game({ ...game })`) reads the raw `roms` field, not getRoms().
    // The constructor must seed `super` from the sub-games for that spread to carry every ROM.
    const spreadGame = new Game({ ...merged });
    expect(spreadGame.getRoms()).toEqual([...discOne.getRoms(), ...discTwo.getRoms()]);
  });
});

describe('withProps', () => {
  it('should return a MergedDiscGame that preserves sub-games and applies the new props', () => {
    const merged = new MergedDiscGame({ name: 'Game', subGames: [discOne, discTwo] });
    const reWrapped = merged.withProps({ cloneOf: 'Parent' });
    expect(reWrapped).toBeInstanceOf(MergedDiscGame);
    expect(reWrapped.getSubGames()).toEqual([discOne, discTwo]);
    expect(reWrapped.getCloneOf()).toEqual('Parent');
    expect(reWrapped.getRoms()).toEqual([...discOne.getRoms(), ...discTwo.getRoms()]);
  });
});
