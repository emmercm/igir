import { PassThrough } from 'stream';
import stripAnsi from 'strip-ansi';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';
import { ProgressBarSymbol } from '../../src/console/progressBar.js';
import ProgressBarCLI from '../../src/console/progressBarCLI.js';

class ProgressBarCLISpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly outputLines: string[] = [];

  private readonly logger: Logger;

  constructor(logLevel = LogLevel.ALWAYS) {
    this.stream = new PassThrough();
    this.stream.on('data', (line) => {
      if (line.toString() === '\n') {
        return;
      }
      this.outputLines.push(stripAnsi(line.toString()));
    });

    this.logger = new Logger(logLevel, this.stream);
  }

  getLogger(): Logger {
    return this.logger;
  }

  getLineCount(): number {
    return this.outputLines.length;
  }

  getLastLine(): string {
    return this.outputLines[this.outputLines.length - 1];
  }

  getLogLine(): string {
    return this.outputLines
      .filter((line) => line.match(/^[A-Z]+.+/) !== null)[0];
  }
}

ProgressBarCLI.setFPS(Number.MAX_SAFE_INTEGER);

describe('reset', () => {
  it('should change the value and total', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);

    await progressBar.increment();
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 1/100`));

    await progressBar.reset(20);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 0/20`));

    ProgressBarCLI.stop();
  });
});

describe('setSymbol', () => {
  it('should change the symbol to empty', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));

    await progressBar.setSymbol('');
    expect(spy.getLastLine()).toMatch(/^name/);

    ProgressBarCLI.stop();
  });

  it('should change the symbol to non-empty', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));

    await progressBar.setSymbol('✗');
    expect(spy.getLastLine()).toMatch(/^✗ +name/);

    ProgressBarCLI.stop();
  });
});

describe('increment', () => {
  it('should increment once each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);

    await progressBar.increment();
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 1/100`));

    await progressBar.increment();
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 2/100`));

    ProgressBarCLI.stop();
  });
});

describe('update', () => {
  it('should update the value each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE), 100);
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.update(8);
    expect(spy.getLineCount()).toEqual(2);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 8/100`));

    await progressBar.update(32);
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* 32/100`));

    ProgressBarCLI.stop();
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

    ProgressBarCLI.stop();
  });

  it('should update the symbol and message', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.done('done message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLastLine()).toMatch(new RegExp(`${stripAnsi(ProgressBarSymbol.DONE)} +name .* done message$`));

    ProgressBarCLI.stop();
  });
});

describe('logDebug', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logDebug('debug message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/DEBUG:.*debug message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logDebug('debug message');
    expect(spy.getLineCount()).toEqual(1);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logInfo', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logInfo('info message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/INFO:.*info message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logInfo('info message');
    expect(spy.getLineCount()).toEqual(1);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logWarn', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logWarn('warn message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/WARN:.*warn message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logWarn('warn message');
    expect(spy.getLineCount()).toEqual(1);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logError', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logError('error message');
    expect(spy.getLineCount()).toEqual(3);
    expect(spy.getLogLine()).toMatch(/ERROR:.*error message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    await progressBar.logError('error message');
    expect(spy.getLineCount()).toEqual(1);
    expect(spy.getLogLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('delete', () => {
  it('should delete the single bar', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR + 1);
    const progressBar = await ProgressBarCLI.new(spy.getLogger(), 'name', stripAnsi(ProgressBarSymbol.DONE));
    expect(spy.getLineCount()).toEqual(1);

    progressBar.delete();
    expect(spy.getLineCount()).toEqual(1);

    ProgressBarCLI.stop();
  });
});
