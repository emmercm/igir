import chalk from 'chalk';
import isUnicodeSupported from 'is-unicode-supported';
import { linearRegression, linearRegressionLine } from 'simple-statistics';

import TimePoly from '../polyfill/timePoly.js';
import Logger from './logger.js';
import { LogLevel, LogLevelValue } from './logLevel.js';
import MultiBar from './multiBar.js';
import ProgressBar, { ColoredSymbol, ProgressBarSymbol } from './progressBar.js';

export interface SingleBarOptions {
  displayDelay?: number;
  indentSize?: number;
  symbol?: ColoredSymbol;
  name?: string;
  showProgressNewline?: boolean;
  progressBarSizeMultiplier?: number;
  progressFormatter?: (progress: number) => string;
  completed?: number;
  inProgress?: number;
  total?: number;
  finishedMessage?: string;
}

const CHALK_PROGRESS_COMPLETE_DEFAULT = chalk.reset;
const CHALK_PROGRESS_IN_PROGRESS = chalk.dim;
const CHALK_PROGRESS_INCOMPLETE = chalk.grey;

const UNICODE_SUPPORTED = isUnicodeSupported();
const BAR_COMPLETE_CHAR = UNICODE_SUPPORTED ? '■' : '▬';
const BAR_IN_PROGRESS_CHAR = UNICODE_SUPPORTED ? '■' : '▬';
const BAR_INCOMPLETE_CHAR = UNICODE_SUPPORTED ? '■' : '▬';

const DEFAULT_ETA = '--:--:--';

const clamp = (val: number | undefined, min: number, max: number): number =>
  Math.min(Math.max(val ?? 0, min), max);

/**
 * TODO(cemmer)
 */
export default class SingleBar extends ProgressBar {
  private static readonly BAR_SIZE = 30;

  private readonly multiBar: MultiBar;
  private logger: Logger;

  private displayDelay?: number;
  private displayCreated?: number;

  private readonly indentSize: number;
  private symbol?: ColoredSymbol;
  private name?: string;
  private readonly showProgressNewline: boolean;
  private readonly progressBarSizeMultiplier: number;
  private readonly progressFormatter: (progress: number) => string;
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

    if (options?.displayDelay !== undefined) {
      this.displayDelay = options.displayDelay;
      this.displayCreated = TimePoly.hrtimeMillis();
    }
    this.indentSize = options?.indentSize ?? 0;
    this.symbol = options?.symbol;
    this.name = options?.name;
    this.showProgressNewline = options?.showProgressNewline ?? true;
    this.progressBarSizeMultiplier = options?.progressBarSizeMultiplier ?? 1;
    this.progressFormatter =
      options?.progressFormatter ?? ((progress: number): string => progress.toLocaleString());
    this.completed = options?.completed ?? 0;
    this.inProgress = options?.inProgress ?? 0;
    this.total = options?.total ?? 0;
    this.finishedMessage = options?.finishedMessage;
  }

  /**
   * TODO(cemmer)
   */
  addChildBar(options: SingleBarOptions): ProgressBar {
    return this.multiBar.addSingleBar(
      this.logger,
      {
        displayDelay: 2000,
        indentSize: this.indentSize + (this.symbol?.symbol ? 2 : 0),
        progressBarSizeMultiplier: this.progressBarSizeMultiplier / 2,
        showProgressNewline: false,
        ...options,
      },
      this,
    );
  }

  getIndentSize(): number {
    return this.indentSize;
  }

  setSymbol(symbol: ColoredSymbol): void {
    if (this.symbol === symbol) {
      return;
    }
    this.symbol = symbol;
  }

  setName(name: string): void {
    if (this.name === name) {
      return;
    }
    this.name = name;
  }

  /**
   * TODO(cemmer)
   */
  resetProgress(total: number): void {
    if (this.displayDelay !== undefined) {
      this.displayCreated = TimePoly.hrtimeMillis();
    }
    this.completed = 0;
    this.inProgress = 0;
    this.total = total;
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
  format(): string {
    if (
      this.displayDelay !== undefined &&
      (this.completed >= this.total ||
        TimePoly.hrtimeMillis(this.displayCreated) < this.displayDelay)
    ) {
      return '';
    }
    this.displayDelay = undefined;

    let output = ' '.repeat(this.indentSize);

    if (this.symbol?.symbol) {
      output += this.symbol.color(`${this.symbol.symbol} `);
    }

    if (this.finishedMessage) {
      output += `${this.name} ${this.finishedMessage}`;
      this.lastOutput = output;
      return this.lastOutput;
    }

    if (!this.showProgressNewline) {
      output += `${this.getBar()} `;
    }

    if (this.name) {
      output += `${this.name} `;
    }

    if (this.showProgressNewline) {
      output += `\n${' '.repeat(this.indentSize + (this.symbol?.symbol ? 2 : 0))}${this.getBar()} `;
    }

    this.lastOutput = output;
    return this.lastOutput;
  }

  private getBar(): string {
    let bar = '';
    // if (this.showProgressNewline) {
    //   bar += `\n${' '.repeat((this.symbol ? 2 : 0) + this.indentSize)}`;
    // }

    const symbolColor =
      (this.indentSize === 0 ? this.symbol?.color : undefined) ?? CHALK_PROGRESS_COMPLETE_DEFAULT;

    const barSize =
      Math.floor(SingleBar.BAR_SIZE * this.progressBarSizeMultiplier) -
      this.indentSize -
      (this.symbol?.symbol ? 2 : 0);

    const completeSize =
      this.total > 0 ? Math.floor(clamp(this.completed / this.total, 0, 1) * barSize) : 0;
    bar += symbolColor(BAR_COMPLETE_CHAR.repeat(Math.max(completeSize, 0)));
    const inProgressSize =
      this.total > 0
        ? Math.ceil((clamp(this.inProgress, 0, this.total) / this.total) * barSize)
        : 0;
    bar += CHALK_PROGRESS_IN_PROGRESS(BAR_IN_PROGRESS_CHAR.repeat(Math.max(inProgressSize, 0)));
    const incompleteSize = barSize - inProgressSize - completeSize;
    bar += CHALK_PROGRESS_INCOMPLETE(BAR_INCOMPLETE_CHAR.repeat(Math.max(incompleteSize, 0)));
    bar += ' ';

    const formattedCompleted = this.progressFormatter(this.completed);
    const formattedTotal = this.progressFormatter(this.total);
    const paddedCompleted = formattedCompleted.padStart(
      Math.max(formattedTotal.length, this.indentSize > 0 ? 8 : 0),
      ' ',
    );
    const paddedTotal = formattedTotal.padEnd(this.indentSize > 0 ? 8 : 0, ' ');
    bar += `${symbolColor(paddedCompleted)}/${CHALK_PROGRESS_IN_PROGRESS(paddedTotal)} `;

    if (this.completed > 0 || this.indentSize > 0) {
      bar += CHALK_PROGRESS_INCOMPLETE(`[${this.getEtaFormatted()}]`);
    }

    return bar.trim();
  }

  private getEtaFormatted(): string {
    if (this.completed === 0) {
      return DEFAULT_ETA;
    }

    const etaSeconds = this.calculateEta();

    // Throttle how often the ETA can visually change
    const elapsedMs = TimePoly.hrtimeMillis(this.lastEtaFormatTime);
    if (etaSeconds > 60 && elapsedMs < 5000) {
      return this.lastEtaFormatted;
    }
    this.lastEtaFormatTime = TimePoly.hrtimeMillis();

    if (Math.floor(etaSeconds) < 0) {
      this.lastEtaFormatted = DEFAULT_ETA;
      return this.lastEtaFormatted;
    }

    const hours = Math.floor(etaSeconds / 3600);
    const minutes = Math.floor((etaSeconds % 3600) / 60);
    const seconds = Math.ceil(etaSeconds) % 60;
    this.lastEtaFormatted = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return this.lastEtaFormatted;
  }

  private calculateEta(): number {
    // Throttle how often the ETA is calculated
    const elapsedMs = TimePoly.hrtimeMillis(this.lastEtaCalculatedTime);
    if (elapsedMs < 50) {
      return this.lastEtaCalculated;
    }
    this.lastEtaCalculatedTime = TimePoly.hrtimeMillis();

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

  getLastOutput(): string | undefined {
    return this.lastOutput;
  }
}
