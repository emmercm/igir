import EndOfLifeChecker from '../../src/modules/endOfLifeChecker.js';

function range(start: number, end: number): number[] {
  return [...Array.from({ length: end - start + 1 }).keys()].map((val) => val + start);
}
const versions = range(4, Number.parseInt(process.versions.node.split('.', 1)[0]) + 2).map(
  (major) => `v${major}.${major}.0`,
);

describe('should not throw', () => {
  test.each(versions)('with an old date: %s', (version) => {
    expect.assertions(1);
    const date = new Date(1999, 9, 9);
    expect(() => {
      new EndOfLifeChecker().check(version, date);
    }).not.toThrow();
  });

  test.each(versions)('with a far future date: %s', (version) => {
    expect.assertions(1);
    const date = new Date(2100, 1, 1);
    expect(() => {
      new EndOfLifeChecker().check(version, date);
    }).not.toThrow();
  });
});
