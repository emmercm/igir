import fs from 'node:fs';
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

describe('setLogFile', () => {
  it('should write formatted messages to the file', async () => {
    const logFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger.log'));

    try {
      const logger = new Logger(LogLevel.INFO, new PassThrough());
      logger.setLogFile(logFile);

      logger.info('hello from logger');

      expect(await fs.promises.readFile(logFile, 'utf8')).toContain('hello from logger');
    } finally {
      await FsPoly.rm(logFile, { force: true });
    }
  });

  it('should write to the file even when the stream log level suppresses the message', async () => {
    const logFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger.log'));

    try {
      const spy = new LoggerSpy(LogLevel.NEVER);
      spy.getLogger().setLogFile(logFile);

      spy.getLogger().info('suppressed from stream');

      await expect(spy.getOutput()).resolves.toEqual('');
      expect(await fs.promises.readFile(logFile, 'utf8')).toContain('suppressed from stream');
    } finally {
      await FsPoly.rm(logFile, { force: true });
    }
  });

  it('should write raw lines to the file', async () => {
    const logFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger.log'));

    try {
      const logger = new Logger(LogLevel.INFO, new PassThrough());
      logger.setLogFile(logFile);

      logger.printRawLine('raw line content');

      expect(await fs.promises.readFile(logFile, 'utf8')).toContain('raw line content');
    } finally {
      await FsPoly.rm(logFile, { force: true });
    }
  });

  it('should not write empty raw lines to the file', async () => {
    const logFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger.log'));

    try {
      const logger = new Logger(LogLevel.INFO, new PassThrough());
      logger.setLogFile(logFile);

      logger.printRawLine('');

      expect(await fs.promises.readFile(logFile, 'utf8')).toEqual('');
    } finally {
      await FsPoly.rm(logFile, { force: true });
    }
  });

  it('should append to existing file contents', async () => {
    const logFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger.log'));

    try {
      await FsPoly.writeFile(logFile, 'existing content\n');

      const logger = new Logger(LogLevel.INFO, new PassThrough());
      logger.setLogFile(logFile);
      logger.info('new content');

      const contents = await fs.promises.readFile(logFile, 'utf8');
      expect(contents).toContain('existing content');
      expect(contents).toContain('new content');
    } finally {
      await FsPoly.rm(logFile, { force: true });
    }
  });

  it('should close the previous file and write only to the new file when called again', async () => {
    const logFile1 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger1.log'));
    const logFile2 = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'logger2.log'));

    try {
      const logger = new Logger(LogLevel.INFO, new PassThrough());
      logger.setLogFile(logFile1);
      logger.info('first file');

      logger.setLogFile(logFile2);
      logger.info('second file');

      const contents1 = await fs.promises.readFile(logFile1, 'utf8');
      expect(contents1).toContain('first file');
      expect(contents1).not.toContain('second file');
      const contents2 = await fs.promises.readFile(logFile2, 'utf8');
      expect(contents2).toContain('second file');
      expect(contents2).not.toContain('first file');
    } finally {
      await FsPoly.rm(logFile1, { force: true });
      await FsPoly.rm(logFile2, { force: true });
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
