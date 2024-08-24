import chalk from 'chalk';

import LogLevel from './logLevel.js';

/**
 * @see https://www.toptal.com/designers/htmlarrows/symbols/
 * @see https://www.htmlsymbols.xyz/
 * @see https://www.fileformat.info/info/unicode/font/lucida_console/grid.htm (win32)
 */
export const ProgressBarSymbol = {
  NONE: '',
  WAITING: chalk.grey(process.platform === 'win32' ? '…' : '⋯'),
  DONE: chalk.green(process.platform === 'win32' ? '√' : '✓'),
  // Files
  FILE_SCANNING: chalk.magenta(process.platform === 'win32' ? '○' : '↻'),
  FILE_DOWNLOADING: chalk.magenta('↓'),
  DAT_PARSING: chalk.magenta('Σ'),
  ROM_HEADER_DETECTION: chalk.magenta('^'),
  FILE_HASHING: chalk.magenta('#'),
  FILE_INDEXING: chalk.magenta('#'),
  // Processing a single DAT
  GROUPING_SIMILAR: chalk.cyan('∩'),
  MERGE_SPLIT: chalk.cyan('↔'),
  // Candidates
  GENERATING: chalk.cyan('Σ'),
  FILTERING: chalk.cyan('∆'),
  EXTENSION_CORRECTION: chalk.cyan('.'),
  CANDIDATE_HASHING: chalk.cyan('#'),
  VALIDATING: chalk.cyan(process.platform === 'win32' ? '?' : '≟'),
  COMBINING_ALL: chalk.cyan(process.platform === 'win32' ? 'U' : '∪'),
  TESTING: chalk.yellow(process.platform === 'win32' ? '?' : '≟'),
  WRITING: chalk.yellow(process.platform === 'win32' ? '»' : '✎'),
  RECYCLING: chalk.blue(process.platform === 'win32' ? '»' : '♻'),
  DELETING: chalk.red(process.platform === 'win32' ? 'X' : '✕'),
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

  abstract setLoggerPrefix(prefix: string): void;

  abstract log(logLevel: LogLevel, message: string): void;

  /**
   * Log a TRACE message.
   *
   * This should be used to log internal actions that most users shouldn't care about, but could be
   * helpful in bug reports.
   */
  logTrace(message: string): void {
    return this.log(LogLevel.TRACE, message);
  }

  /**
   * Log a DEBUG message.
   *
   * This should be used to log actions that weren't taken (i.e. skipped writing a ROM because it
   * already exists, etc.).
   */
  logDebug(message: string): void {
    return this.log(LogLevel.DEBUG, message);
  }

  /**
   * Log an INFO message.
   *
   * This should be used to log actions that were taken (i.e. copying/moving ROMs, recycling files,
   * writing DATs, etc.).
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
