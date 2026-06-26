import type { LogLevelValue } from '../../src/console/logLevel.js';
import { LogLevel } from '../../src/console/logLevel.js';
import LoggerSpy from './loggerSpy.js';

function getLevelsAbove(logLevel: LogLevelValue): LogLevelValue[] {
  return Object.values(LogLevel).filter((ll) => ll > logLevel);
}

function getLogLevelsAtOrBelow(logLevel: LogLevelValue): LogLevelValue[] {
  return Object.values(LogLevel).filter((ll) => ll <= logLevel);
}

describe('trace', () => {
  test.each(getLevelsAbove(LogLevel.TRACE))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').trace('trace message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.TRACE))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').trace('trace message');
    await expect(spy.getOutput()).resolves.toContain('trace message');
  });

  it('should include the prefix at TRACE level', async () => {
    const spy = new LoggerSpy(LogLevel.TRACE);
    spy.getLogger().child('MyPrefix').trace('trace message');
    await expect(spy.getOutput()).resolves.toContain('MyPrefix');
  });
});

describe('debug', () => {
  test.each(getLevelsAbove(LogLevel.DEBUG))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').debug('debug message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.DEBUG))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').debug('debug message');
    await expect(spy.getOutput()).resolves.toContain('debug message');
  });
});

describe('info', () => {
  test.each(getLevelsAbove(LogLevel.INFO))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').info('info message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.INFO))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').info('info message');
    await expect(spy.getOutput()).resolves.toContain('info message');
  });
});

describe('warn', () => {
  test.each(getLevelsAbove(LogLevel.WARN))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').warn('warn message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.WARN))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').warn('warn message');
    await expect(spy.getOutput()).resolves.toContain('warn message');
  });
});

describe('error', () => {
  test.each(getLevelsAbove(LogLevel.ERROR))('should not write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').error('error message');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  test.each(getLogLevelsAtOrBelow(LogLevel.ERROR))('should write: %s', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().child('MyPrefix').error('error message');
    await expect(spy.getOutput()).resolves.toContain('error message');
  });
});
