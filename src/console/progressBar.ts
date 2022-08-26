import chalk from 'chalk';

import LogLevel from './logLevel.js';

export const Symbols: { [key: string]: string } = {
  WAITING: chalk.grey('⋯'),
  SEARCHING: chalk.magenta('↻'),
  GENERATING: chalk.cyan('Σ'),
  PROCESSING: chalk.cyan('⚙'),
  FILTERING: chalk.cyan('∆'),
  WRITING: chalk.yellow('✎'),
  RECYCLING: chalk.blue('♻'),
  DONE: chalk.green('✓'),
};

export default abstract class ProgressBar {
  abstract reset(total: number): Promise<void>;

  abstract setSymbol(symbol: string): Promise<void>;

  abstract increment(): Promise<void>;

  abstract update(current: number): Promise<void>;

  abstract done(finishedMessage?: string): Promise<void>;

  async doneItems(count: number, noun: string, verb: string) {
    return this.done(`${count.toLocaleString()} ${noun}${count !== 1 ? 's' : ''} ${verb}`);
  }

  abstract log(logLevel: LogLevel, message: string): Promise<void>;

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

  abstract delete(): void;
}
