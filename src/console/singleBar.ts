import chalk from 'chalk';
import isUnicodeSupported from 'is-unicode-supported';
import { linearRegression, linearRegressionLine } from 'simple-statistics';
import stripAnsi from 'strip-ansi';

import TimePoly from '../polyfill/timePoly.js';
import Logger from './logger.js';
import { LogLevel, LogLevelValue } from './logLevel.js';
import MultiBar from './multiBar.js';
import ProgressBar, { FormatOptions, ProgressBarSymbol } from './progressBar.js';

export interface SingleBarOptions {
  indentSize?: number;
  showProgressSpinner?: boolean;
  symbol?: string;
  name?: string;
  showProgressNewline?: boolean;
  showCompletedCount?: boolean;
  completed?: number;
  inProgress?: number;
  total?: number;
  finishedMessage?: string;
}

const CHALK_SPINNER = chalk.hex('BB9AF7');
const CHALK_PROGRESS_COMPLETE = chalk.blue;
const CHALK_PROGRESS_IN_PROGRESS = chalk.dim;
const CHALK_PROGRESS_INCOMPLETE = chalk.grey;
const CHALK_ETA = chalk.cyan;

const UNICODE_SUPPORTED = isUnicodeSupported();
const BAR_COMPLETE_CHAR = UNICODE_SUPPORTED ? '▬' : '▬';
const BAR_IN_PROGRESS_CHAR = UNICODE_SUPPORTED ? '▬' : '▬';
const BAR_INCOMPLETE_CHAR = UNICODE_SUPPORTED ? '▬' : '▬';

const DEFAULT_ETA = '-:--:--';

/**
 * TODO(cemmer)
 */
export default class SingleBar extends ProgressBar {
  private static readonly BAR_SIZE = 20;

  private readonly multiBar: MultiBar;
  private logger: Logger;

  private readonly indentSize: number;
  private readonly showProgressSpinner?: boolean;
  private symbol?: string;
  private name?: string;
  private readonly showProgressNewline: boolean;
  private readonly showCompletedCount: boolean;
  private completed: number;
  private inProgress: number;
  private total: number;
  private finishedMessage?: string;

  private lastOutput?: string;
  private valueTimeBuffer: number[][] = [];
  private lastEtaCalculatedTime = 0;
  private lastEtaCalculated = 0;
  private lastEtaFormatTime = 0;
  private lastEtaFormatted = DEFAULT_ETA;

  constructor(multiBar: MultiBar, logger: Logger, options?: SingleBarOptions) {
    super();
    this.multiBar = multiBar;
    this.logger = logger;

    this.indentSize = options?.indentSize ?? 0;
    this.showProgressSpinner = options?.showProgressSpinner;
    this.symbol = options?.symbol;
    this.name = options?.name;
    this.showProgressNewline = options?.showProgressNewline ?? false;
    this.showCompletedCount = options?.showCompletedCount ?? false;
    this.completed = options?.completed ?? 0;
    this.inProgress = options?.inProgress ?? 0;
    this.total = options?.total ?? 0;
    this.finishedMessage = options?.finishedMessage;
  }

  /**
   * TODO(cemmer)
   */
  addChildBar(options: SingleBarOptions): ProgressBar {
    return this.multiBar.addSingleBar(this.logger, {
      ...options,
      indentSize: this.indentSize + 4,
      showProgressNewline: true,
    });
  }

  getIndentSize(): number {
    return this.indentSize;
  }

  getSymbol(): string | undefined {
    return this.symbol;
  }

  setSymbol(symbol: string): void {
    if (this.symbol === symbol) {
      return;
    }
    this.symbol = symbol;
    this.multiBar.clearAndRender();
  }

  getName(): string | undefined {
    return this.name;
  }

  setName(name: string): void {
    if (this.name === name) {
      return;
    }
    this.name = name;
    this.multiBar.clearAndRender();
  }

  getShowProgressSpinner(): boolean {
    return this.showProgressSpinner ?? false;
  }

  /**
   * TODO(cemmer)
   */
  resetProgress(): void {
    this.completed = 0;
    this.inProgress = 0;
    this.valueTimeBuffer = [];
  }

  /**
   * TODO(cemmer)
   */
  incrementCompleted(increment = 1): void {
    this.completed += increment;
    this.inProgress = Math.max(this.inProgress - increment, 0);
  }

  /**
   * TODO(cemmer)
   */
  setCompleted(completed: number): void {
    this.completed = completed;
  }

  /**
   * TODO(cemmer)
   */
  incrementInProgress(increment = 1): void {
    this.inProgress += increment;
  }

  setInProgress(inProgress: number): void {
    this.inProgress = inProgress;
  }

  /**
   * TODO(cemmer)
   */
  incrementTotal(increment = 1): void {
    this.total += increment;
  }

  setTotal(total: number): void {
    this.total = total;
  }

  /**
   * TODO(cemmer)
   */
  finish(finishedMessage?: string): void {
    this.setSymbol(ProgressBarSymbol.DONE);

    if (this.total > 0) {
      this.setCompleted(this.total);
    } else {
      this.setCompleted(1);
    }
    this.setInProgress(0);

    this.finishedMessage = finishedMessage;

    this.multiBar.clearAndRender();
  }

  setLoggerPrefix(prefix: string): void {
    this.logger = this.logger.withLoggerPrefix(prefix);
  }

  /**
   * TODO(cemmer)
   */
  log(logLevel: LogLevelValue, message: string): void {
    if (this.logger.getLogLevel() > logLevel && this.logger.getLogLevel() !== LogLevel.ALWAYS) {
      return;
    }

    this.multiBar.log(this.logger.formatMessage(logLevel, message));
  }

  /**
   * TODO(cemmer)
   */
  freeze(): void {
    this.multiBar.freezeSingleBar(this);
  }

  /**
   * TODO(cemmer)
   */
  delete(): void {
    this.multiBar.removeSingleBar(this);
  }

  /**
   * TODO(cemmer)
   */
  format(options: FormatOptions): string {
    this.lastOutput = `${this.getSymbolAndName(options)} ${this.getProgress()}`;
    return this.lastOutput;
  }

  private getSymbolAndName(options: FormatOptions): string {
    let output = ' '.repeat(this.indentSize);
    let extraPadding = 0;

    if (this.showProgressSpinner) {
      output += `${this.multiBar.getProgressBarSpinner()} `;
    } else if (this.symbol) {
      output += `${this.symbol} `;
    } else {
      extraPadding += 2;
    }

    // TODO(cemmer): why is one '·' always rendered? is it because of the minimum length?
    // TODO(cemmer): extend the '·' for processing DATs across the screen?
    if (this.name) {
      const nameStripped = stripAnsi(this.name);
      const padding =
        Math.max(extraPadding, 0) +
        Math.max(options.maxNameLength - this.indentSize - nameStripped.length, 0);
      const maxLengthWithAnsi =
        nameStripped.length + padding + (this.name.length - nameStripped.length);
      // TODO(cemmer): dim the dots
      output += `${this.name} ${'·'.repeat(padding)}`.slice(0, maxLengthWithAnsi);
    }

    //const namePadded = `${name} ${'·'.repeat(SingleBarFormatted.MAX_NAME_LENGTH)}`.trim();
    //const symbolAndName = `${symbol} ${namePadded}`;
    //const excessLength =
    //  stripAnsi(symbolAndName).trimStart().length - SingleBarFormatted.MAX_NAME_LENGTH;
    //const nameTrimmed = namePadded.slice(0, namePadded.length - Math.max(excessLength, 0));
    //return `${symbol} ${nameTrimmed}`.trimStart();

    return output;
  }

  private getProgress(): string {
    if (this.finishedMessage) {
      return this.finishedMessage;
    }

    let progress = this.getBar();
    // if (this.total === 0) {
    //   return progress;
    // }

    // if (this.showCompletedCount) {
    progress += ` ${CHALK_PROGRESS_COMPLETE(`${this.completed.toLocaleString()}/${this.total.toLocaleString()}`)}`;
    // } else {
    //   const percentage = this.total === 0 ? 0 : Math.floor((this.completed / this.total) * 100);
    //   progress += ` ${CHALK_PROGRESS_COMPLETE(`${String(percentage).padStart(2, ' ')}%`)}`;

    if (this.completed > 0) {
      const etaString = CHALK_ETA(this.getEtaFormatted());
      progress += ` ${etaString}`;
    }
    // }

    return progress;
  }

  private getBar(): string {
    let bar = '';
    // if (this.showProgressNewline) {
    //   bar += `\n${' '.repeat(this.indentSize * 2)}`;
    // }

    const clamp = (val: number | undefined, min: number, max: number): number =>
      Math.min(Math.max(val ?? 0, min), max);
    const completeSize = Math.floor(clamp(this.completed / this.total, 0, 1) * SingleBar.BAR_SIZE);
    bar += CHALK_PROGRESS_COMPLETE(BAR_COMPLETE_CHAR.repeat(Math.max(completeSize, 0)));

    const inProgressSize =
      this.total > 0
        ? Math.ceil((clamp(this.inProgress, 0, this.total) / this.total) * SingleBar.BAR_SIZE)
        : 0;
    bar += CHALK_PROGRESS_IN_PROGRESS(BAR_IN_PROGRESS_CHAR.repeat(Math.max(inProgressSize, 0)));

    const incompleteSize = SingleBar.BAR_SIZE - inProgressSize - completeSize;
    bar += CHALK_PROGRESS_INCOMPLETE(BAR_INCOMPLETE_CHAR.repeat(Math.max(incompleteSize, 0)));

    return bar;
  }

  private getEtaFormatted(): string {
    const etaSeconds = this.calculateEta();

    // Throttle how often the ETA can visually change
    const elapsedMs = TimePoly.hrtimeMillis(this.lastEtaFormatTime);
    if (etaSeconds > 60 && elapsedMs < 5000) {
      return this.lastEtaFormatted;
    }
    this.lastEtaFormatTime = TimePoly.hrtimeMillis();

    if (Math.floor(etaSeconds) <= 0) {
      this.lastEtaFormatted = DEFAULT_ETA;
      return this.lastEtaFormatted;
    }

    const hours = Math.floor(etaSeconds / 3600);
    const minutes = Math.floor((etaSeconds % 3600) / 60);
    const seconds = Math.ceil(etaSeconds) % 60;
    this.lastEtaFormatted = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return this.lastEtaFormatted;
  }

  private calculateEta(): number {
    // Throttle how often the ETA is calculated
    const elapsedMs = TimePoly.hrtimeMillis(this.lastEtaCalculatedTime);
    if (elapsedMs < 50) {
      return this.lastEtaCalculated;
    }
    this.lastEtaCalculatedTime = TimePoly.hrtimeMillis();

    const clamp = (val: number, min: number, max: number): number =>
      Math.min(Math.max(val, min), max);
    const MAX_BUFFER_SIZE = clamp(Math.floor(this.total / 10), 25, 50);

    this.valueTimeBuffer = [
      ...this.valueTimeBuffer.slice(1 - MAX_BUFFER_SIZE),
      [this.completed, Date.now()],
    ];

    const doneTime = linearRegressionLine(linearRegression(this.valueTimeBuffer))(this.total);
    if (Number.isNaN(doneTime)) {
      // Vertical line
      return -1;
    }
    const remaining = (doneTime - Date.now()) / 1000;
    if (!Number.isFinite(remaining)) {
      return -1;
    }
    this.lastEtaCalculated = Math.max(remaining, 0);
    return this.lastEtaCalculated;
  }
}
