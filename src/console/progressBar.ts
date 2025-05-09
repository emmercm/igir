import chalk, { ChalkInstance } from 'chalk';
import isUnicodeSupported from 'is-unicode-supported';

import { LogLevel, LogLevelValue } from './logLevel.js';
import { SingleBarOptions } from './singleBar.js';

/**
 * @see https://www.toptal.com/designers/htmlarrows/symbols/
 * @see https://www.htmlsymbols.xyz/
 * @see https://www.fileformat.info/info/unicode/font/lucida_console/grid.htm (win32)
 */
const UNICODE_SUPPORTED = isUnicodeSupported();
export interface ColoredSymbol {
  symbol: string;
  color: ChalkInstance;
}
export const ProgressBarSymbol: Record<string, ColoredSymbol> = {
  NONE: { symbol: '', color: chalk.reset },
  WAITING: { symbol: UNICODE_SUPPORTED ? '⋯' : '…', color: chalk.grey },
  DONE: { symbol: UNICODE_SUPPORTED ? '✓' : '√', color: chalk.green },
  // Files
  FILE_SCANNING: { symbol: UNICODE_SUPPORTED ? '↻' : '○', color: chalk.magenta },
  DAT_DOWNLOADING: { symbol: '↓', color: chalk.magenta },
  DAT_PARSING: { symbol: 'Σ', color: chalk.magenta },
  ROM_HASHING: { symbol: '#', color: chalk.magenta },
  ROM_HEADER_DETECTION: { symbol: '^', color: chalk.magenta },
  ROM_INDEXING: { symbol: '♦', color: chalk.magenta },
  // Processing a single DAT
  DAT_GROUPING_SIMILAR: { symbol: '∩', color: chalk.cyan },
  DAT_MERGE_SPLIT: { symbol: '↔', color: chalk.cyan },
  DAT_FILTERING: { symbol: '∆', color: chalk.cyan },
  DAT_PREFERRING: { symbol: UNICODE_SUPPORTED ? '⇅' : '↨', color: chalk.cyan },
  // Candidates
  CANDIDATE_GENERATING: { symbol: 'Σ', color: chalk.cyan },
  CANDIDATE_EXTENSION_CORRECTION: { symbol: '.', color: chalk.cyan },
  CANDIDATE_HASHING: { symbol: '#', color: chalk.yellow },
  CANDIDATE_VALIDATING: { symbol: UNICODE_SUPPORTED ? '≟' : '?', color: chalk.cyan },
  CANDIDATE_COMBINING: { symbol: UNICODE_SUPPORTED ? '∪' : 'U', color: chalk.cyan },
  TESTING: { symbol: UNICODE_SUPPORTED ? '≟' : '?', color: chalk.yellow },
  WRITING: { symbol: UNICODE_SUPPORTED ? '✎' : '»', color: chalk.yellow },
  RECYCLING: { symbol: UNICODE_SUPPORTED ? '♻' : '»', color: chalk.blue },
  DELETING: { symbol: UNICODE_SUPPORTED ? '✕' : 'X', color: chalk.red },
};

export type ProgressCallback = (progress: number, total: number) => void;

/**
 * ProgressBar represents a single progress bar (of potentially many) to present completion
 * information about an operation.
 */
export default abstract class ProgressBar {
  abstract addChildBar(options: SingleBarOptions): ProgressBar;

  abstract setSymbol(symbol: ColoredSymbol): void;

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

  abstract format(): string;
}
