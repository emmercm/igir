import fs from 'node:fs';
import path from 'node:path';
import stream from 'node:stream';

import Logger from '../../src/console/logger.js';
import type { LogLevelValue } from '../../src/console/logLevel.js';
import { LogLevel } from '../../src/console/logLevel.js';
import Terminal from '../../src/console/terminal.js';
import Temp from '../../src/globals/temp.js';
import FsUtil from '../../src/utils/fsUtil.js';
import LoggerSpy from './loggerSpy.js';

if (!(await FsUtil.exists(Temp.getTempDir()))) {
  await FsUtil.mkdir(Temp.getTempDir(), { recursive: true });
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
    const logger = new Logger(new Terminal(new stream.PassThrough()));
    logger.setLogLevel(logLevel);
    expect(logger.getLogLevel()).toEqual(logLevel);
  });
});

describe('child', () => {
  it('should stamp the prefix on messages at TRACE level', async () => {
    const spy = new LoggerSpy(LogLevel.TRACE);
    spy.getLogger().child('ChildPrefix').trace('child message');
    const output = await spy.getOutput();
    expect(output).toContain('child message');
    expect(output).toContain('ChildPrefix');
  });
});

describe('setLogFile', () => {
  it('should write messages to the log file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().openLogFile(tempFile);
      spy.getLogger().info('test message');
      const contents = (await fs.promises.readFile(tempFile)).toString();
      expect(contents).toContain('test message');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should write messages below the stream log level to the file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.WARN);
      spy.getLogger().openLogFile(tempFile);
      spy.getLogger().info('below level message');
      await expect(spy.getOutput()).resolves.toEqual('');
      const contents = (await fs.promises.readFile(tempFile)).toString();
      expect(contents).toContain('below level message');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should strip ANSI codes from file output', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().openLogFile(tempFile);
      spy.getLogger().info('ansi test message');
      const contents = (await fs.promises.readFile(tempFile)).toString();
      expect(contents).not.toMatch(/\x1B\[/); // no ANSI escape sequences
      expect(contents).toContain('ansi test message');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should not write empty messages to the file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.ALWAYS);
      spy.getLogger().openLogFile(tempFile);
      spy.getLogger().newLine();
      const contents = (await fs.promises.readFile(tempFile)).toString();
      expect(contents).toEqual('');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should include timestamp and level prefix in file output', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().openLogFile(tempFile);
      spy.getLogger().info('timestamped message');
      const contents = (await fs.promises.readFile(tempFile)).toString();
      // File output uses TRACE-level formatting (always includes timestamp)
      expect(contents).toMatch(/\[\d{2}:\d{2}:\d{2}\.\d{3}\]/);
      expect(contents).toContain('INFO:');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
  });

  it('should close the previous file handle when called again', async () => {
    const tempFile1 = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger1'));
    const tempFile2 = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger2'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().openLogFile(tempFile1);
      spy.getLogger().info('first file message');
      spy.getLogger().openLogFile(tempFile2);
      spy.getLogger().info('second file message');
      const contents1 = (await fs.promises.readFile(tempFile1)).toString();
      const contents2 = (await fs.promises.readFile(tempFile2)).toString();
      expect(contents1).toContain('first file message');
      expect(contents1).not.toContain('second file message');
      expect(contents2).toContain('second file message');
      expect(contents2).not.toContain('first file message');
    } finally {
      await FsUtil.rm(tempFile1, { force: true });
      await FsUtil.rm(tempFile2, { force: true });
    }
  });

  it('should append to an existing log file', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy1 = new LoggerSpy(LogLevel.INFO);
      spy1.getLogger().openLogFile(tempFile);
      spy1.getLogger().info('first message');

      const spy2 = new LoggerSpy(LogLevel.INFO);
      spy2.getLogger().openLogFile(tempFile);
      spy2.getLogger().info('second message');

      const contents = (await fs.promises.readFile(tempFile)).toString();
      expect(contents).toContain('first message');
      expect(contents).toContain('second message');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
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

  it('should include the prefix in stream output at TRACE level', async () => {
    const spy = new LoggerSpy(LogLevel.TRACE);
    spy.getLogger().trace('trace message', 'MyPrefix');
    await expect(spy.getOutput()).resolves.toContain('MyPrefix');
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

  it('should not include the prefix in stream output above TRACE level', async () => {
    const spy = new LoggerSpy(LogLevel.INFO);
    spy.getLogger().info('info message', 'MyPrefix');
    await expect(spy.getOutput()).resolves.not.toContain('MyPrefix');
  });

  it('should write the prefix to the log file regardless of stream level', async () => {
    const tempFile = await FsUtil.mktemp(path.join(Temp.getTempDir(), 'logger'));
    try {
      const spy = new LoggerSpy(LogLevel.INFO);
      spy.getLogger().openLogFile(tempFile);
      spy.getLogger().info('prefixed message', 'FilePrefix');
      const contents = (await fs.promises.readFile(tempFile)).toString();
      expect(contents).toContain('FilePrefix');
    } finally {
      await FsUtil.rm(tempFile, { force: true });
    }
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

describe('printFrozenBar', () => {
  it('should keep consecutive frozen snapshots visually adjacent', async () => {
    const spy = new LoggerSpy(LogLevel.ALWAYS);
    spy.getLogger().printFrozenBar(' first bar');
    spy.getLogger().printFrozenBar('\n second bar');
    const output = await spy.getOutput();
    expect(output).toContain('first bar');
    expect(output).toContain('second bar');
    expect(output).not.toContain('\n\n');
  });

  it('should separate a following log line with a blank line', async () => {
    const spy = new LoggerSpy(LogLevel.INFO);
    spy.getLogger().printFrozenBar(' frozen bar');
    spy.getLogger().info('following message');
    const output = await spy.getOutput();
    expect(output).toContain('frozen bar');
    expect(output).toContain('following message');
    expect(output).toContain('\n\n');
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
