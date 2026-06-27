import type { ChalkInstance } from 'chalk';
import chalk from 'chalk';
import isUnicodeSupported from 'is-unicode-supported';

import IntlUtil from '../utils/intlUtil.js';
import type { SingleBarOptions } from './singleBar.js';

/**
 * @see https://www.toptal.com/designers/htmlarrows/symbols/
 * @see https://www.htmlsymbols.xyz/
 * @see https://www.fileformat.info/info/unicode/font/lucida_console/grid.htm (win32)
 */
const IS_UNICODE_SUPPORTED = isUnicodeSupported();
export interface ColoredSymbol {
  symbol: string;
  color: ChalkInstance;
}
export const ProgressBarSymbol: Record<string, ColoredSymbol> = {
  NONE: { symbol: '', color: chalk.reset },
  WAITING: { symbol: IS_UNICODE_SUPPORTED ? '⋯' : '…', color: chalk.grey },
  DONE: { symbol: IS_UNICODE_SUPPORTED ? '✓' : '√', color: chalk.green },
  // Files
  FILE_SCANNING: { symbol: IS_UNICODE_SUPPORTED ? '↻' : '○', color: chalk.magenta },
  DAT_DOWNLOADING: { symbol: '↓', color: chalk.magenta },
  DAT_PARSING: { symbol: 'Σ', color: chalk.magenta },
  ROM_HASHING: { symbol: '#', color: chalk.magenta },
  ROM_HEADER_DETECTION: { symbol: '^', color: chalk.magenta },
  ROM_TRIMMING_DETECTION: { symbol: IS_UNICODE_SUPPORTED ? '⌵' : 'v', color: chalk.magenta },
  ROM_INDEXING: { symbol: '♦', color: chalk.magenta },
  PATCH_PARSING: { symbol: IS_UNICODE_SUPPORTED ? 'ℙ' : 'P', color: chalk.magenta },
  // Processing a single DAT
  DAT_GROUPING_SIMILAR: { symbol: '∩', color: chalk.cyan },
  DAT_MERGE_SPLIT: { symbol: '↔', color: chalk.cyan },
  DAT_FILTERING: { symbol: '∆', color: chalk.cyan },
  DAT_PREFERRING: { symbol: IS_UNICODE_SUPPORTED ? '⇅' : '↨', color: chalk.cyan },
  // Candidates generation
  CANDIDATE_GENERATING: { symbol: 'Σ', color: chalk.cyan },
  CANDIDATE_PATCHING: { symbol: IS_UNICODE_SUPPORTED ? 'ℙ' : 'P', color: chalk.cyan },
  CANDIDATE_EXTENSION_CORRECTION: { symbol: '.', color: chalk.cyan },
  CANDIDATE_HASHING: { symbol: '#', color: chalk.cyan },
  CANDIDATE_VALIDATING: { symbol: IS_UNICODE_SUPPORTED ? '≟' : '?', color: chalk.cyan },
  CANDIDATE_COMBINING: { symbol: IS_UNICODE_SUPPORTED ? '∪' : 'U', color: chalk.cyan },
  // Candidate writing
  TESTING: { symbol: IS_UNICODE_SUPPORTED ? '≟' : '?', color: chalk.yellow },
  WRITING: { symbol: IS_UNICODE_SUPPORTED ? '✎' : '»', color: chalk.yellow },
  RECYCLING: { symbol: IS_UNICODE_SUPPORTED ? '♻' : '»', color: chalk.blue },
  DELETING: { symbol: IS_UNICODE_SUPPORTED ? '✕' : 'X', color: chalk.red },
} as const;

export type ProgressCallback = (progress: number, total: number) => void;

/**
 * ProgressBar represents a single progress bar (of potentially many) to present completion
 * information about an operation.
 */
export default abstract class ProgressBar {
  abstract addChildBar(options: SingleBarOptions): ProgressBar;

  abstract setSymbol(symbol: ColoredSymbol): void;

  abstract getName(): string | undefined;

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
      `${IntlUtil.toLocaleString(count)} ${noun.trim()}${count === 1 ? '' : pluralSuffix} ${verb}`,
    );
  }

  abstract freeze(): void;

  abstract delete(): void;

  abstract format(): string;
}
