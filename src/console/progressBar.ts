import chalk from 'chalk';

import LogLevel from './logLevel.js';

/**
 * @see https://www.toptal.com/designers/htmlarrows/symbols/
 * @see https://www.htmlsymbols.xyz/
 * @see https://www.fileformat.info/info/unicode/font/lucida_console/grid.htm (win32)
 */
export const ProgressBarSymbol = {
  WAITING: chalk.grey(process.platform === 'win32' ? '…' : '⋯'),
  PROCESSING: chalk.cyan(process.platform === 'win32' ? '¤' : '⚙'),
  // Files
  DOWNLOADING: chalk.bold('↓'),
  SEARCHING: chalk.magenta(process.platform === 'win32' ? '○' : '↻'),
  HASHING: chalk.magenta('#'),
  INDEXING: chalk.magenta('#'),
  // DATs & candidates
  MERGE_SPLIT: chalk.cyan('↔'),
  GENERATING: chalk.cyan('Σ'),
  FILTERING: chalk.cyan('∆'),
  VALIDATING: chalk.cyan(process.platform === 'win32' ? '?' : '≟'),
  WRITING: chalk.yellow(process.platform === 'win32' ? '»' : '✎'),
  RECYCLING: chalk.blue(process.platform === 'win32' ? '≠' : '♻'),
  DELETING: chalk.red(process.platform === 'win32' ? 'X' : '✕'),
  DONE: chalk.green(process.platform === 'win32' ? '√' : '✓'),
};

/**
 * ProgressBar represents a single progress bar (of potentially many) to present completion
 * information about an operation.
 */
export default abstract class ProgressBar {
  abstract reset(total: number): Promise<void>;

  abstract setName(name: string): Promise<void>;

  abstract setSymbol(symbol: string): Promise<void>;

  abstract addWaitingMessage(waitingMessage: string): void;

  abstract removeWaitingMessage(waitingMessage: string): void;

  abstract incrementTotal(increment: number): Promise<void>;

  abstract incrementProgress(): Promise<void>;

  abstract incrementDone(message?: string): Promise<void>;

  abstract update(current: number, message?: string): Promise<void>;

  abstract done(finishedMessage?: string): Promise<void>;

  /**
   * Call the `done()` method with a completion message that indicates how many items were
   * processed.
   */
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

  abstract log(logLevel: LogLevel, message: string): void;

  /**
   * Log a TRACE message.
   */
  logTrace(message: string): void {
    return this.log(LogLevel.TRACE, message);
  }

  /**
   * Log a DEBUG message.
   */
  logDebug(message: string): void {
    return this.log(LogLevel.DEBUG, message);
  }

  /**
   * Log an INFO message.
   */
  logInfo(message: string): void {
    return this.log(LogLevel.INFO, message);
  }

  /**
   * Log a WARN message.
   */
  logWarn(message: string): void {
    return this.log(LogLevel.WARN, message);
  }

  /**
   * Log an ERROR message.
   */
  logError(message: string): void {
    return this.log(LogLevel.ERROR, message);
  }

  abstract freeze(): Promise<void>;

  abstract delete(): void;
}
