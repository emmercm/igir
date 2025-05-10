import { PassThrough } from 'node:stream';

import stripAnsi from 'strip-ansi';

import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import MultiBar from '../../src/console/multiBar.js';
import { SingleBarOptions } from '../../src/console/singleBar.js';

const LOGGER = new Logger(LogLevel.ALWAYS, new PassThrough());

describe('setSymbol', () => {});

describe('setName', () => {});

describe('resetProgress', () => {});

describe('incrementCompleted', () => {});

describe('setCompleted', () => {});

describe('incrementInProgress', () => {});

describe('setInProgress', () => {});

describe('incrementTotal', () => {});

describe('setTotal', () => {});

describe('finish', () => {});

describe('setLoggerPrefix', () => {});

describe('log', () => {});

describe('freeze', () => {});

describe('delete', () => {});

describe('format', () => {
  test.each([
    [{}, '··································· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100'],
    [
      { symbol: '@' },
      '@ ································· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100',
    ],
    [
      { symbol: '@', name: 'name' },
      '@ name ···························· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100',
    ],
    [
      { name: 'name' },
      'name ······························ | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100',
    ],
    [{ name: 'name', finishedMessage: 'done' }, 'name ······························ | done'],
  ] satisfies [SingleBarOptions, string][])('should: %s', (options, expected) => {
    const singleBar = LOGGER.addProgressBar(options);
    expect(stripAnsi(singleBar.format(Number.MAX_SAFE_INTEGER))).toEqual(expected);
    MultiBar.stop();
  });
});
