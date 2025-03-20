import stripAnsi from 'strip-ansi';

import { LogLevel } from '../../src/console/logLevel.js';
import { ProgressBarSymbol } from '../../src/console/progressBar.js';
import ProgressBarCLI from '../../src/console/progressBarCli.js';
import SingleBarFormatted from '../../src/console/singleBarFormatted.js';
import ProgressBarCLISpy from './progressBarCliSpy.js';

describe('reset', () => {
  it('should change the value and total', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
      100,
    );

    progressBar.incrementDone();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 1/100`),
    );

    progressBar.reset(20);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 0/20`),
    );

    ProgressBarCLI.stop();
  });
});

describe('setSymbol', () => {
  it('should change the symbol to empty', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );

    progressBar.setSymbol('');
    expect(spy.getLastLine()).toMatch(/^name/);

    ProgressBarCLI.stop();
  });

  test.each(Object.keys(ProgressBarSymbol))(
    'should change the symbol to non-empty; %s',
    (symbol) => {
      const spy = new ProgressBarCLISpy();
      const progressBar = ProgressBarCLI.new(spy.getLogger(), 'name', 'DEFAULT');

      progressBar.setSymbol(symbol);
      expect(spy.getLastLine()).toMatch(new RegExp(`^${symbol} +name`));

      ProgressBarCLI.stop();
    },
  );
});

describe('incrementProgress', () => {
  it('should increment once each time', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
      100,
    );
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_INCOMPLETE_CHAR}+ \\| 0/100`,
      ),
    );

    progressBar.incrementProgress();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 0/100`,
      ),
    );

    progressBar.incrementProgress();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 0/100`,
      ),
    );

    ProgressBarCLI.stop();
  });

  it('should work with incrementDone', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
      100,
    );
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_INCOMPLETE_CHAR}+ \\| 0/100`,
      ),
    );

    progressBar.incrementProgress();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 0/100`,
      ),
    );

    progressBar.incrementDone();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| [^${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}].* \\| 1/100`,
      ),
    );

    progressBar.incrementProgress();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(
        `${stripAnsi(ProgressBarSymbol.DONE)} +name .* \\| ${SingleBarFormatted.BAR_IN_PROGRESS_CHAR}.* \\| 1/100`,
      ),
    );

    ProgressBarCLI.stop();
  });
});

describe('incrementDone', () => {
  it('should increment once each time', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
      100,
    );

    progressBar.incrementDone();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 1/100`),
    );

    progressBar.incrementDone();
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 2/100`),
    );

    ProgressBarCLI.stop();
  });
});

describe('update', () => {
  it('should update the value each time', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
      100,
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.update(8);
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 8/100`),
    );

    progressBar.update(32);
    progressBar.render(true);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 32/100`),
    );

    ProgressBarCLI.stop();
  });
});

describe('done', () => {
  it('should update the symbol', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.WAITING),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.done();
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name`));

    ProgressBarCLI.stop();
  });

  it('should update the symbol and message', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.WAITING),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.done('done message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLastLine()).toMatch(
      new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* done message$`),
    );

    ProgressBarCLI.stop();
  });
});

describe('logDebug', () => {
  it('should log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logDebug('debug message');
    progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/DEBUG:.*debug message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logDebug('debug message');
    progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logInfo', () => {
  it('should log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logInfo('info message');
    progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/INFO:.*info message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logInfo('info message');
    progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logWarn', () => {
  it('should log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logWarn('warn message');
    progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/WARN:.*warn message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logWarn('warn message');
    progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logError', () => {
  it('should log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logError('error message');
    progressBar.render(true);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/ERROR:.*error message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', () => {
    const spy = new ProgressBarCLISpy(LogLevel.NOTICE);
    const progressBar = ProgressBarCLI.new(
      spy.getLogger(),
      'name',
      stripAnsi(ProgressBarSymbol.DONE),
    );
    expect(spy.getLineCount()).toEqual(1);

    progressBar.logError('error message');
    progressBar.render(true);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('freeze', () => {
  it('should freeze the single bar', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(spy.getLogger(), '', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.freeze();
    expect(spy.getLineCount()).toEqual(3); // one final render, and then a log of the render

    ProgressBarCLI.stop();
  });
});

describe('delete', () => {
  it('should delete the single bar', () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = ProgressBarCLI.new(spy.getLogger(), '', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.delete();
    expect(spy.getLineCount()).toEqual(1);

    ProgressBarCLI.stop();
  });
});
