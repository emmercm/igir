import cliProgress from 'cli-progress';
import stripAnsi from 'strip-ansi';

import ProgressBarPayload from '../../src/console/progressBarPayload.js';
import SingleBarFormatted from '../../src/console/singleBarFormatted.js';
import ProgressBarCLISpy from './progressBarCliSpy.js';

function testSingleBarFormatted(
  initialTotal: number,
  initialPayload: ProgressBarPayload,
  callback: (singleBarFormatted: SingleBarFormatted) => void,
): void {
  const spy = new ProgressBarCLISpy();
  const multiBar = new cliProgress.MultiBar({
    stream: spy.getLogger().getStream(),
    fps: Number.MAX_SAFE_INTEGER,
    noTTYOutput: true,
  });

  const singleBarFormatted = new SingleBarFormatted(multiBar, initialTotal, initialPayload);
  try {
    callback(singleBarFormatted);
  } finally {
    multiBar.stop();
  }
}

describe('getSingleBar', () => {
  it('should return a SingleBar', () => {
    testSingleBarFormatted(0, {}, (singleBarFormatted) => {
      expect(singleBarFormatted.getSingleBar()).toBeDefined();
    });
  });
});

describe('getLastOutput', () => {
  it('should be empty before render', () => {
    testSingleBarFormatted(0, {}, (singleBarFormatted) => {
      expect(singleBarFormatted.getLastOutput()).toEqual(undefined);
    });
  });

  it('should be non-empty after render', () => {
    testSingleBarFormatted(100, {}, (singleBarFormatted) => {
      singleBarFormatted.getSingleBar().render();

      expect(singleBarFormatted.getLastOutput()).toEqual(
        '··································· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 0/100',
      );
    });
  });
});

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
    [
      { name: 'name', waitingMessage: 'waiting' },
      'name ······························ | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100 | waiting',
    ],
    [{ name: 'name', finishedMessage: 'done' }, 'name ······························ | done'],
    [
      { name: 'name', finishedMessage: 'done', waitingMessage: 'waiting' },
      'name ······························ | done',
    ],
  ] satisfies [ProgressBarPayload, string][])('should: %s', (payload, expected) => {
    testSingleBarFormatted(100, {}, (singleBarFormatted) => {
      singleBarFormatted.getSingleBar().increment();
      singleBarFormatted.getSingleBar().update(payload);
      singleBarFormatted.getSingleBar().render();

      expect(stripAnsi(singleBarFormatted.getLastOutput() ?? '')).toEqual(expected);
    });
  });
});
