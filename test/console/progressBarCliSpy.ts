import { PassThrough } from 'node:stream';

import stripAnsi from 'strip-ansi';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';

export default class ProgressBarCLISpy {
  private readonly stream: NodeJS.WritableStream;

  private readonly outputLines: string[] = [];

  private readonly logger: Logger;

  constructor(logLevel = LogLevel.ALWAYS) {
    this.stream = new PassThrough();
    this.stream.on('data', (line: Buffer) => {
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
    return this.outputLines.at(-1) ?? '';
  }

  getLogLine(): string | undefined {
    return this.outputLines.find((line) => line.match(/^[A-Z]+:.+/) !== null);
  }
}
