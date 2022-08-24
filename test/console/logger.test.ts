import { PassThrough } from 'stream';

import Logger, { LogLevel } from '../../src/console/logger.js';

class LoggerSpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly logger: Logger;

  private readonly spy: Promise<string>;

  constructor(logLevel: LogLevel) {
    this.stream = new PassThrough();
    this.logger = new Logger(logLevel, this.stream);
    this.spy = new Promise((resolve) => {
      const buffers: Uint8Array[] = [];
      this.stream.on('data', (chunk) => {
        buffers.push(chunk);
      });
      this.stream.on('end', () => {
        resolve(Buffer.concat(buffers).toString());
      });
    });
  }

  getLogger(): Logger {
    return this.logger;
  }

  getOutput(): Promise<string> {
    this.stream.end();
    return this.spy;
  }
}

describe('newLine', () => {
  const shouldNotPrint = Object.keys(LogLevel)
    .map((logLevel) => LogLevel[logLevel as keyof typeof LogLevel])
    .filter((logLevel) => logLevel >= LogLevel.OFF);
  test.each(shouldNotPrint)('should not write', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().newLine();
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  const shouldPrint = Object.keys(LogLevel)
    .map((logLevel) => LogLevel[logLevel as keyof typeof LogLevel])
    .filter((logLevel) => logLevel < LogLevel.OFF);
  test.each(shouldPrint)('should write', async (logLevel) => {
    const spy = new LoggerSpy(logLevel);
    spy.getLogger().newLine();
    await expect(spy.getOutput()).resolves.toEqual('\n');
  });
});

describe('debug', () => {
  // TODO(cemmer)
});
