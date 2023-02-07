import chalk from 'chalk';

import LogLevel from './logLevel.js';

/**
 * @see https://www.toptal.com/designers/htmlarrows/symbols/
 * @see https://www.htmlsymbols.xyz/
 * @see https://github.com/mochajs/mocha/pull/641/files (win32)
 */
export const ProgressBarSymbol: { [key: string]: string } = {
  WAITING: chalk.grey(process.platform === 'win32' ? '…' : '⋯'),
  SEARCHING: chalk.magenta(process.platform === 'win32' ? '҉' : '↻'),
  HASHING: chalk.magenta('#'),
  GENERATING: chalk.cyan('Σ'),
  PROCESSING: chalk.cyan(process.platform === 'win32' ? '¤' : '⚙'),
  FILTERING: chalk.cyan('∆'),
  WRITING: chalk.yellow(process.platform === 'win32' ? '»' : '✎'),
  RECYCLING: chalk.blue(process.platform === 'win32' ? '≠' : '♻'),
  DONE: chalk.green(process.platform === 'win32' ? '√' : '✓'),
};

export default abstract class ProgressBar {
  abstract reset(total: number): Promise<void>;

  abstract setSymbol(symbol: string): Promise<void>;

  abstract addWaitingMessage(waitingMessage: string): void;

  abstract removeWaitingMessage(waitingMessage: string): void;

  abstract increment(message?: string): Promise<void>;

  abstract update(current: number, message?: string): Promise<void>;

  abstract done(finishedMessage?: string): Promise<void>;

  async doneItems(count: number, noun: string, verb: string): Promise<void> {
    let pluralSuffix = 's';
    if (noun.toLowerCase().endsWith('ch')
      || noun.toLowerCase().endsWith('s')
    ) {
      pluralSuffix = 'es';
    }

    return this.done(`${count.toLocaleString()} ${noun.trim()}${count !== 1 ? pluralSuffix : ''} ${verb}`);
  }

  abstract withLoggerPrefix(prefix: string): ProgressBar;

  abstract log(logLevel: LogLevel, message: string): Promise<void>;

  async logTrace(message: string): Promise<void> {
    return this.log(LogLevel.TRACE, message);
  }

  async logDebug(message: string): Promise<void> {
    return this.log(LogLevel.DEBUG, message);
  }

  async logInfo(message: string): Promise<void> {
    return this.log(LogLevel.INFO, message);
  }

  async logWarn(message: string): Promise<void> {
    return this.log(LogLevel.WARN, message);
  }

  async logError(message: string): Promise<void> {
    return this.log(LogLevel.ERROR, message);
  }

  abstract freeze(): Promise<void>;

  abstract delete(): void;
}
