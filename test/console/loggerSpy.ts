import stream from 'node:stream';

import Logger from '../../src/console/logger.js';
import type { LogLevelValue } from '../../src/console/logLevel.js';
import Terminal from '../../src/console/terminal.js';

/**
 * A test helper that wraps a {@link Logger} writing to an in-memory stream and captures everything
 * written to it.
 */
export default class LoggerSpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly spy: Promise<string>;

  private readonly logger: Logger;

  constructor(logLevel: LogLevelValue) {
    this.stream = new stream.PassThrough();
    this.spy = new Promise((resolve) => {
      const buffers: Uint8Array[] = [];
      this.stream.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });
      this.stream.on('end', () => {
        resolve(Buffer.concat(buffers).toString());
      });
    });

    this.logger = new Logger(new Terminal(this.stream));
    this.logger.setLogLevel(logLevel);
  }

  getLogger(): Logger {
    return this.logger;
  }

  async getOutput(): Promise<string> {
    this.stream.end();
    return await this.spy;
  }
}
