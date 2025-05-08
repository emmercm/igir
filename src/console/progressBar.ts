import chalk from 'chalk';
import isUnicodeSupported from 'is-unicode-supported';

import { LogLevel, LogLevelValue } from './logLevel.js';
import { SingleBarOptions } from './singleBar.js';

/**
 * @see https://www.toptal.com/designers/htmlarrows/symbols/
 * @see https://www.htmlsymbols.xyz/
 * @see https://www.fileformat.info/info/unicode/font/lucida_console/grid.htm (win32)
 */
const UNICODE_SUPPORTED = isUnicodeSupported();
export const ProgressBarSymbol = {
  NONE: '',
  WAITING: chalk.grey(UNICODE_SUPPORTED ? '⋯' : '…'),
  DONE: chalk.green(UNICODE_SUPPORTED ? '✓' : '√'),
  // Files
  FILE_SCANNING: chalk.magenta(UNICODE_SUPPORTED ? '↻' : '○'),
  DAT_DOWNLOADING: chalk.magenta('↓'),
  DAT_PARSING: chalk.magenta('Σ'),
  ROM_HASHING: chalk.magenta('#'),
  ROM_HEADER_DETECTION: chalk.magenta('^'),
  ROM_INDEXING: chalk.magenta('♦'),
  // Processing a single DAT
  DAT_GROUPING_SIMILAR: chalk.cyan('∩'),
  DAT_MERGE_SPLIT: chalk.cyan('↔'),
  DAT_FILTERING: chalk.cyan('∆'),
  DAT_PREFERRING: chalk.cyan(UNICODE_SUPPORTED ? '⇅' : '↨'),
  // Candidates
  CANDIDATE_GENERATING: chalk.cyan('Σ'),
  CANDIDATE_EXTENSION_CORRECTION: chalk.cyan('.'),
  CANDIDATE_HASHING: chalk.yellow('#'),
  CANDIDATE_VALIDATING: chalk.cyan(UNICODE_SUPPORTED ? '≟' : '?'),
  CANDIDATE_COMBINING: chalk.cyan(UNICODE_SUPPORTED ? '∪' : 'U'),
  TESTING: chalk.yellow(UNICODE_SUPPORTED ? '≟' : '?'),
  WRITING: chalk.yellow(UNICODE_SUPPORTED ? '✎' : '»'),
  RECYCLING: chalk.blue(UNICODE_SUPPORTED ? '♻' : '»'),
  DELETING: chalk.red(UNICODE_SUPPORTED ? '✕' : 'X'),
};

export type ProgressCallback = (progress: number, total: number) => void;

export interface FormatOptions {
  maxLength: number;
  maxNameLength: number;
}

/**
 * ProgressBar represents a single progress bar (of potentially many) to present completion
 * information about an operation.
 */
export default abstract class ProgressBar {
  abstract addChildBar(options: SingleBarOptions): ProgressBar;

  abstract setSymbol(symbol: string): void;

  abstract setName(name: string): void;

  abstract resetProgress(total: number): void;

  abstract incrementCompleted(increment?: number): void;

  abstract setCompleted(current: number): void;

  abstract incrementInProgress(increment?: number): void;

  abstract setInProgress(inProgress: number): void;

  abstract incrementTotal(increment?: number): void;

  abstract setTotal(total: number): void;

  abstract finish(finishedMessage?: string): void;

  /**
   * Call the `done()` method with a completion message that indicates how many items were
   * processed.
   */
  finishWithItems(count: number, noun: string, verb: string): void {
    let pluralSuffix = 's';
    if (noun.toLowerCase().endsWith('ch') || noun.toLowerCase().endsWith('s')) {
      pluralSuffix = 'es';
    }

    this.finish(
      `${count.toLocaleString()} ${noun.trim()}${count === 1 ? '' : pluralSuffix} ${verb}`,
    );
  }

  abstract setLoggerPrefix(prefix: string): void;

  abstract log(logLevel: LogLevelValue, message: string): void;

  /**
   * Log a TRACE message.
   *
   * This should be used to log internal actions that most users shouldn't care about, but could be
   * helpful in bug reports.
   */
  logTrace(message: string): void {
    this.log(LogLevel.TRACE, message);
  }

  /**
   * Log a DEBUG message.
   *
   * This should be used to log actions that weren't taken (i.e. skipped writing a ROM because it
   * already exists, etc.).
   */
  logDebug(message: string): void {
    this.log(LogLevel.DEBUG, message);
  }

  /**
   * Log an INFO message.
   *
   * This should be used to log actions that were taken (i.e. copying/moving ROMs, recycling files,
   * writing DATs, etc.).
   */
  logInfo(message: string): void {
    this.log(LogLevel.INFO, message);
  }

  /**
   * Log a WARN message.
   */
  logWarn(message: string): void {
    this.log(LogLevel.WARN, message);
  }

  /**
   * Log an ERROR message.
   */
  logError(message: string): void {
    this.log(LogLevel.ERROR, message);
  }

  abstract freeze(): void;

  abstract delete(): void;

  abstract format(options: FormatOptions): string;
}
