import cliProgress from 'cli-progress';
import stripAnsi from 'strip-ansi';

import ProgressBarPayload from '../../src/console/progressBarPayload.js';
import SingleBarFormatted from '../../src/console/singleBarFormatted.js';
import ProgressBarCLISpy from './progressBarCLISpy.js';

function buildSingleBarFormatted(
  spy: ProgressBarCLISpy,
  initialTotal = 0,
  initialPayload: ProgressBarPayload = {},
): SingleBarFormatted {
  const multiBar = new cliProgress.MultiBar({
    stream: spy.getLogger().getStream(),
    fps: Number.MAX_SAFE_INTEGER,
    noTTYOutput: true,
  });
  return new SingleBarFormatted(multiBar, initialTotal, initialPayload);
}

describe('getSingleBar', () => {
  it('should return a SingleBar', () => {
    const spy = new ProgressBarCLISpy();
    const singleBarFormatted = buildSingleBarFormatted(spy);

    expect(singleBarFormatted.getSingleBar()).toBeDefined();
  });
});

describe('getLastOutput', () => {
  it('should be empty before render', () => {
    const spy = new ProgressBarCLISpy();
    const singleBarFormatted = buildSingleBarFormatted(spy);

    expect(singleBarFormatted.getLastOutput()).toEqual('');
  });

  it('should be non-empty after render', () => {
    const spy = new ProgressBarCLISpy();
    const singleBarFormatted = buildSingleBarFormatted(spy, 100);

    singleBarFormatted.getSingleBar().render();

    expect(singleBarFormatted.getLastOutput()).toEqual('| ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 0/100');
  });
});

describe('format', () => {
  test.each([
    [{}, '| ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100'],
    [{ symbol: '@' }, '@ | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100'],
    [{ symbol: '@', name: 'name' }, '@ name ························· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100'],
    [{ name: 'name' }, 'name ························· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100'],
    [{ name: 'name', waitingMessage: 'waiting' }, 'name ························· | ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ | 1/100 | waiting'],
    [{ name: 'name', finishedMessage: 'done' }, 'name ························· | done'],
    [{ name: 'name', finishedMessage: 'done', waitingMessage: 'waiting' }, 'name ························· | done'],
  ] satisfies [ProgressBarPayload, string][])('should: %s', (payload, expected) => {
    const spy = new ProgressBarCLISpy();
    const singleBarFormatted = buildSingleBarFormatted(spy, 100);

    singleBarFormatted.getSingleBar().increment();
    singleBarFormatted.getSingleBar().update(payload);
    singleBarFormatted.getSingleBar().render();

    expect(stripAnsi(singleBarFormatted.getLastOutput())).toEqual(expected);
  });
});
