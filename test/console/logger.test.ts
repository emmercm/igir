import { PassThrough } from 'stream';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';

class LoggerSpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly spy: Promise<string>;

  private readonly logger: Logger;

  constructor(logLevel: LogLevel) {
    this.stream = new PassThrough();
    this.spy = new Promise((resolve) => {
      const buffers: Uint8Array[] = [];
      this.stream.on('data', (chunk) => {
        buffers.push(chunk);
      });
      this.stream.on('end', () => {
        resolve(Buffer.concat(buffers).toString());
      });
    });

    this.logger = new Logger(logLevel, this.stream);
    expect(this.logger.getStream()).toEqual(this.stream);
  }

  getLogger(): Logger {
    return this.logger;
  }

  async getOutput(): Promise<string> {
    this.stream.end();
    return this.spy;
  }
}

function testLogLevelsAbove(
  logLevel: LogLevel,
): (name: string, fn: (arg0: LogLevel) => void) => void {
  const logLevels = Object.keys(LogLevel)
    .map((ll) => LogLevel[ll as keyof typeof LogLevel])
    .filter((ll) => ll > logLevel);
  return test.each(logLevels);
}

function testLogLevelsAtOrBelow(
  logLevel: LogLevel,
): (name: string, fn: (arg0: LogLevel) => void) => void {
  const logLevels = Object.keys(LogLevel)
    .map((ll) => LogLevel[ll as keyof typeof LogLevel])
    .filter((ll) => ll <= logLevel);
  return test.each(logLevels);
}

describe('setLogLevel_getLogLevel', () => {
  const logLevels = Object.keys(LogLevel).map((ll) => LogLevel[ll as keyof typeof LogLevel]);
  test.each(logLevels)('should reflect: %s', (logLevel) => {
    const logger = new Logger(-1, new PassThrough());
    expect(logger.getLogLevel()).not.toEqual(logLevel);

    logger.setLogLevel(logLevel);
    expect(logger.getLogLevel()).toEqual(logLevel);
  });
});

describe('newLine', () => {
  testLogLevelsAbove(LogLevel.NEVER - 1)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().newLine();
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.NEVER - 1)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().newLine();
    await expect(spy.getOutput()).resolves.toEqual('\n');
  });
});

describe('trace', () => {
  testLogLevelsAbove(LogLevel.TRACE)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().trace('trace message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.TRACE)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().trace('trace message');
    await expect(spy.getOutput()).resolves.toContain('trace message');
  });
});

describe('debug', () => {
  testLogLevelsAbove(LogLevel.DEBUG)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().debug('debug message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.DEBUG)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().debug('debug message');
    await expect(spy.getOutput()).resolves.toContain('debug message');
  });
});

describe('info', () => {
  testLogLevelsAbove(LogLevel.INFO)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().info('info message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.INFO)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().info('info message');
    await expect(spy.getOutput()).resolves.toContain('info message');
  });
});

describe('warn', () => {
  testLogLevelsAbove(LogLevel.WARN)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().warn('warn message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.WARN)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().warn('warn message');
    await expect(spy.getOutput()).resolves.toContain('warn message');
  });
});

describe('error', () => {
  testLogLevelsAbove(LogLevel.ERROR)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().error('error message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.ERROR)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().error('error message');
    await expect(spy.getOutput()).resolves.toContain('error message');
  });
});

describe('printHeader', () => {
  testLogLevelsAbove(LogLevel.NEVER - 1)('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().printHeader();
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  testLogLevelsAtOrBelow(LogLevel.NEVER - 1)('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().printHeader();
    await expect(spy.getOutput()).resolves.not.toEqual('');
  });
});
