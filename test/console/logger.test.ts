import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../../src/console/logger.js';
import type { LogLevelValue } from '../../src/console/logLevel.js';
import { LogLevel } from '../../src/console/logLevel.js';
import Temp from '../../src/globals/temp.js';
import FsPoly from '../../src/polyfill/fsPoly.js';

if (!(await FsPoly.exists(Temp.getTempDir()))) {
  await FsPoly.mkdir(Temp.getTempDir(), { recursive: true });
}

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
    return await this.spy;
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

describe('canPrint', () => {
  it('should return false for levels strictly below logger level', () => {
    const logger = new Logger(LogLevel.WARN, new PassThrough());
    expect(logger.canPrint(LogLevel.TRACE)).toEqual(false);
    expect(logger.canPrint(LogLevel.DEBUG)).toEqual(false);
    expect(logger.canPrint(LogLevel.INFO)).toEqual(false);
  });

  it('should return true for the logger level and levels above', () => {
    const logger = new Logger(LogLevel.WARN, new PassThrough());
    expect(logger.canPrint(LogLevel.WARN)).toEqual(true);
    expect(logger.canPrint(LogLevel.ERROR)).toEqual(true);
    expect(logger.canPrint(LogLevel.ALWAYS)).toEqual(true);
  });
});

describe('setLogFile', () => {
  it('should write messages to the log file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().setLogFile(tempFile);
      spy.getLogger().info('test message');
      const contents = (await readFile(tempFile)).toString();
      expect(contents).toContain('test message');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should write messages below the stream log level to the file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.WARN);
      spy.getLogger().setLogFile(tempFile);
      spy.getLogger().info('below level message');
      await expect(spy.getOutput()).resolves.toEqual('');
      const contents = (await readFile(tempFile)).toString();
      expect(contents).toContain('below level message');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should strip ANSI codes from file output', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().setLogFile(tempFile);
      spy.getLogger().info('ansi test message');
      const contents = (await readFile(tempFile)).toString();
      expect(contents).not.toMatch(/\x1B\[/); // no ANSI escape sequences
      expect(contents).toContain('ansi test message');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should not write empty messages to the file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.ALWAYS);
      spy.getLogger().setLogFile(tempFile);
      spy.getLogger().newLine();
      const contents = (await readFile(tempFile)).toString();
      expect(contents).toEqual('');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should include timestamp and level prefix in file output', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().setLogFile(tempFile);
      spy.getLogger().info('timestamped message');
      const contents = (await readFile(tempFile)).toString();
      // File output uses TRACE-level formatting (always includes timestamp)
      expect(contents).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
      expect(contents).toContain('INFO:');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
  });

  it('should close the previous file handle when called again', async () => {
    const tempFile1 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger1'));
    const tempFile2 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger2'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().setLogFile(tempFile1);
      spy.getLogger().info('first file message');
      spy.getLogger().setLogFile(tempFile2);
      spy.getLogger().info('second file message');
      const contents1 = (await readFile(tempFile1)).toString();
      const contents2 = (await readFile(tempFile2)).toString();
      expect(contents1).toContain('first file message');
      expect(contents1).not.toContain('second file message');
      expect(contents2).toContain('second file message');
      expect(contents2).not.toContain('first file message');
    } finally {
      await FsPoly.rm(tempFile1, { force: true });
      await FsPoly.rm(tempFile2, { force: true });
    }
  });

  it('should append to an existing log file', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy1 = new LoggerSpy(LogLevel.INFO);
      spy1.getLogger().setLogFile(tempFile);
      spy1.getLogger().info('first message');

      const spy2 = new LoggerSpy(LogLevel.INFO);
      spy2.getLogger().setLogFile(tempFile);
      spy2.getLogger().info('second message');

      const contents = (await readFile(tempFile)).toString();
      expect(contents).toContain('first message');
      expect(contents).toContain('second message');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
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

describe('printLine', () => {
  it('should return true when the message is printed to the stream', () => {
    const spy = new LoggerSpy(LogLevel.INFO);
    expect(spy.getLogger().printLine(LogLevel.INFO, 'message')).toEqual(true);
  });

  it('should return false when the log level is below the logger level', async () => {
    const spy = new LoggerSpy(LogLevel.WARN);
    expect(spy.getLogger().printLine(LogLevel.INFO, 'message')).toEqual(false);
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  it('should include prefix in stream output when logger is at TRACE level', async () => {
    const spy = new LoggerSpy(LogLevel.TRACE);
    spy.getLogger().printLine(LogLevel.TRACE, 'trace message', 'MyPrefix');
    await expect(spy.getOutput()).resolves.toContain('MyPrefix');
  });

  it('should not include prefix in stream output when logger is above TRACE level', async () => {
    const spy = new LoggerSpy(LogLevel.INFO);
    spy.getLogger().printLine(LogLevel.INFO, 'info message', 'MyPrefix');
    await expect(spy.getOutput()).resolves.not.toContain('MyPrefix');
  });

  it('should write to the log file with prefix regardless of stream log level', async () => {
    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().setLogFile(tempFile);
      spy.getLogger().printLine(LogLevel.INFO, 'prefixed message', 'FilePrefix');
      const contents = (await readFile(tempFile)).toString();
      expect(contents).toContain('FilePrefix');
    } finally {
      await FsPoly.rm(tempFile, { force: true });
    }
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
