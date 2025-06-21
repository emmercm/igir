import { PassThrough } from 'node:stream';

import Logger from '../../src/console/logger.js';
import { LogLevel, LogLevelValue } from '../../src/console/logLevel.js';

class LoggerSpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly spy: Promise<string>;

  private readonly logger: Logger;

  constructor(logLevel: LogLevelValue) {
    this.stream = new PassThrough();
    this.spy = new Promise((resolve) => {
      const buffers: Uint8Array[] = [];
      this.stream.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });
      this.stream.on('end', () => {
        resolve(Buffer.concat(buffers).toString());
      });
    });

    this.logger = new Logger(logLevel, this.stream);
  }

  getLogger(): Logger {
    return this.logger;
  }

  async getOutput(): Promise<string> {
    this.stream.end();
    return this.spy;
  }
}

function getLevelsAbove(logLevel: LogLevelValue): LogLevelValue[] {
  return Object.values(LogLevel).filter((ll) => ll > logLevel);
}

function getLogLevelsAtOrBelow(logLevel: LogLevelValue): LogLevelValue[] {
  return Object.values(LogLevel).filter((ll) => ll <= logLevel);
}

describe('setLogLevel_getLogLevel', () => {
  const logLevels = Object.values(LogLevel);
  test.each(logLevels)('should reflect: %s', (logLevel) => {
    const logger = new Logger(LogLevel.TRACE, new PassThrough());
    logger.setLogLevel(logLevel);
    expect(logger.getLogLevel()).toEqual(logLevel);
  });
});

describe('newLine', () => {
  test.each(getLevelsAbove(LogLevel.ALWAYS))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().newLine();
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.ALWAYS))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().newLine();
    await expect(spy.getOutput()).resolves.toEqual('\n');
  });
});

describe('trace', () => {
  test.each(getLevelsAbove(LogLevel.TRACE))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().trace('trace message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.TRACE))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().trace('trace message');
    await expect(spy.getOutput()).resolves.toContain('trace message');
  });
});

describe('debug', () => {
  test.each(getLevelsAbove(LogLevel.DEBUG))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().debug('debug message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.DEBUG))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().debug('debug message');
    await expect(spy.getOutput()).resolves.toContain('debug message');
  });
});

describe('info', () => {
  test.each(getLevelsAbove(LogLevel.INFO))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().info('info message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.INFO))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().info('info message');
    await expect(spy.getOutput()).resolves.toContain('info message');
  });
});

describe('warn', () => {
  test.each(getLevelsAbove(LogLevel.WARN))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().warn('warn message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.WARN))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().warn('warn message');
    await expect(spy.getOutput()).resolves.toContain('warn message');
  });
});

describe('error', () => {
  test.each(getLevelsAbove(LogLevel.ERROR))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().error('error message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.ERROR))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().error('error message');
    await expect(spy.getOutput()).resolves.toContain('error message');
  });
});

describe('printHeader', () => {
  test.each(getLevelsAbove(LogLevel.ALWAYS))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().printHeader();
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.ALWAYS))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().printHeader();
    await expect(spy.getOutput()).resolves.not.toEqual('');
  });
});
