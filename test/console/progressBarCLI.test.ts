import { PassThrough } from 'stream';
import stripAnsi from 'strip-ansi';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';
import ProgressBarCLI from '../../src/console/progressBarCLI.js';

class ProgressBarCLISpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly outputLines: string[] = [];

  private readonly logger: Logger;

  constructor(logLevel = LogLevel.DEBUG) {
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

  getFirstLine(): string {
    return this.outputLines[0];
  }

  getLastLine(): string {
    return this.outputLines[this.outputLines.length - 1];
  }
}

ProgressBarCLI.setFPS(Number.MAX_SAFE_INTEGER);

describe('reset', () => {
  it('should change the value and total', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓', 100);

    await progressBar.increment();
    expect(spy.getLastLine()).toMatch(/^✓ +name .* 1\/100/);

    await progressBar.reset(20);
    expect(spy.getLastLine()).toMatch(/^✓ +name .* 0\/20/);

    ProgressBarCLI.stop();
  });
});

describe('setSymbol', () => {
  it('should change the symbol to empty', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.setSymbol('');
    expect(spy.getLastLine()).toMatch(/^name/);

    ProgressBarCLI.stop();
  });

  it('should change the symbol to non-empty', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.setSymbol('✗');
    expect(spy.getLastLine()).toMatch(/^✗ +name/);

    ProgressBarCLI.stop();
  });
});

describe('increment', () => {
  it('should increment once each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓', 100);

    await progressBar.increment();
    expect(spy.getLastLine()).toMatch(/^✓ +name .* 1\/100/);

    await progressBar.increment();
    expect(spy.getLastLine()).toMatch(/^✓ +name .* 2\/100/);

    ProgressBarCLI.stop();
  });
});

describe('update', () => {
  it('should update the value each time', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓', 100);

    await progressBar.update(8);
    expect(spy.getLastLine()).toMatch(/^✓ +name .* 8\/100/);

    await progressBar.update(32);
    expect(spy.getLastLine()).toMatch(/^✓ +name .* 32\/100/);

    ProgressBarCLI.stop();
  });
});

describe('done', () => {
  it('should update the symbol', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.done();
    expect(spy.getLastLine()).toMatch(/^✓ +name/);

    ProgressBarCLI.stop();
  });

  it('should update the symbol and message', async () => {
    const spy = new ProgressBarCLISpy();
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.done('done message');
    expect(spy.getLastLine()).toMatch(/^✓ +name .* done message$/);

    ProgressBarCLI.stop();
  });
});

describe('logDebug', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logDebug('debug message');
    expect(spy.getFirstLine()).toMatch(/DEBUG:.*debug message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.DEBUG + 1);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logDebug('debug message');
    expect(spy.getFirstLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logInfo', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logInfo('info message');
    expect(spy.getFirstLine()).toMatch(/INFO:.*info message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.INFO + 1);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logInfo('info message');
    expect(spy.getFirstLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logWarn', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logWarn('warn message');
    expect(spy.getFirstLine()).toMatch(/WARN:.*warn message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.WARN + 1);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logWarn('warn message');
    expect(spy.getFirstLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('logError', () => {
  it('should log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logError('error message');
    expect(spy.getFirstLine()).toMatch(/ERROR:.*error message/);

    ProgressBarCLI.stop();
  });

  it('should not log at the matching log level', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR + 1);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.logError('error message');
    expect(spy.getFirstLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});

describe('delete', () => {
  it('should delete the single bar', async () => {
    const spy = new ProgressBarCLISpy(LogLevel.ERROR + 1);
    const progressBar = new ProgressBarCLI(spy.getLogger(), 'name', '✓');

    await progressBar.delete();
    expect(spy.getLastLine()).toBeUndefined();

    ProgressBarCLI.stop();
  });
});
