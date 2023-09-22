import stripAnsi from 'strip-ansi';

import LogLevel from '../../src/console/logLevel.js';
import { ProgressBarSymbol } from '../../src/console/progressBar.js';
import ProgressBarCLI from '../../src/console/progressBarCli.js';
import SingleBarFormatted from '../../src/console/singleBarFormatted.js';
import ProgressBarCLISpy from './progressBarCliSpy.js';

describe('reset', () => {
  it('should change the value and total', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);

    await progressBar.incrementDone();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 1/100`));

    await progressBar.reset(20);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 0/20`));

    await ProgressBarCLI.stop();
  });
});

describe('setSymbol', () => {
  it('should change the symbol to empty', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));

    await progressBar.setSymbol('');
    expect(spy.getLastLine()).toMatch(/^name/);

    await ProgressBarCLI.stop();
  });

  test.each(
    Object.keys(ProgressBarSymbol),
  )('should change the symbol to non-empty; %s', async (symbol) => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));

    await progressBar.setSymbol(symbol);
    expect(spy.getLastLine()).toMatch(new RegExp(`^${symbol} +name`));

    await ProgressBarCLI.stop();
  });
});

describe('incrementProgress', () => {
  it('should increment once each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_INCOMPLETE_CHAR}+ \\| 0/100`));

    await progressBar.incrementProgress();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 0/100`));

    await progressBar.incrementProgress();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 0/100`));

    await ProgressBarCLI.stop();
  });

  it('should work with incrementDone', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_INCOMPLETE_CHAR}+ \\| 0/100`));

    await progressBar.incrementProgress();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 0/100`));

    await progressBar.incrementDone();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| [^${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}].* \\| 1/100`));

    await progressBar.incrementProgress();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 1/100`));

    await ProgressBarCLI.stop();
  });
});

describe('incrementDone', () => {
  it('should increment once each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);

    await progressBar.incrementDone();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 1/100`));

    await progressBar.incrementDone();
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 2/100`));

    await ProgressBarCLI.stop();
  });
});

describe('update', () => {
  it('should update the value each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.update(8);
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 8/100`));

    await progressBar.update(32);
    await progressBar.render(true);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 32/100`));

    await ProgressBarCLI.stop();
  });
});

describe('done', () => {
  it('should update the symbol', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.done();
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name`));

    await ProgressBarCLI.stop();
  });

  it('should update the symbol and message', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.done('done message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* done message$`));

    await ProgressBarCLI.stop();
  });
});

describe('logDebug', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logDebug('debug message');
    await progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/DEBUG:.*debug message/);

    await ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logDebug('debug message');
    await progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    await ProgressBarCLI.stop();
  });
});

describe('logInfo', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logInfo('info message');
    await progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/INFO:.*info message/);

    await ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logInfo('info message');
    await progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    await ProgressBarCLI.stop();
  });
});

describe('logWarn', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logWarn('warn message');
    await progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/WARN:.*warn message/);

    await ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logWarn('warn message');
    await progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    await ProgressBarCLI.stop();
  });
});

describe('logError', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logError('error message');
    await progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/ERROR:.*error message/);

    await ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logError('error message');
    await progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    await ProgressBarCLI.stop();
  });
});

describe('freeze', () => {
  it('should freeze the single bar', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), '', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.freeze();
    expect(spy.getLineCount()).toEqual(3); // one final render, and then a log of the render

    await ProgressBarCLI.stop();
  });
});

describe('delete', () => {
  it('should delete the single bar', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), '', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.delete();
    expect(spy.getLineCount()).toEqual(1);

    await ProgressBarCLI.stop();
  });
});
