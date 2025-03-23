import { PassThrough } from 'node:stream';

import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import EndOfLifeChecker from '../../src/modules/endOfLifeChecker.js';

function range(start: number, end: number): number[] {
  return [...Array.from({ length: end - start + 1 }).keys()].map((val) => val + start);
}
const versions = range(4, 20 + 5).map((major) => `v${major}.${major}.0`);

const logger = new Logger(LogLevel.ALWAYS, new PassThrough());

describe('should not throw', () => {
  test.each(versions)('with an old date: %s', (version) => {
    expect.assertions(1);
    const date = new Date(1999, 9, 9);
    expect(() => new EndOfLifeChecker(logger).check(version, date)).not.toThrow();
  });

  test.each(versions)('with a far future date: %s', (version) => {
    expect.assertions(1);
    const date = new Date(2100, 1, 1);
    expect(() => new EndOfLifeChecker(logger).check(version, date)).not.toThrow();
  });
});
