import chalk from 'chalk';
import figlet from 'figlet';

import Constants from '../constants.js';
import ProgressBarCLI from './progressBarCLI.js';

export enum LogLevel {
  DEBUG,
  INFO,
  WARN,
  ERROR,
  OFF,
}

export default class Logger {
  private logLevel: LogLevel;

  private readonly stream: NodeJS.WritableStream;

  constructor(logLevel: LogLevel = LogLevel.WARN, stream: NodeJS.WritableStream = process.stdout) {
    this.logLevel = logLevel;
    this.stream = stream;
  }

  getLogLevel(): LogLevel {
    return this.logLevel;
  }

  setLogLevel(logLevel: LogLevel) {
    this.logLevel = logLevel;
  }

  getStream(): NodeJS.WritableStream {
    return this.stream;
  }

  private readonly print = (message: unknown = '') => {
    if (this.logLevel < LogLevel.OFF) {
      this.stream.write(`${message}\n`);
    }
  };

  newLine() {
    this.print();
  }

  static debugFormatter = (message: string): string => message.trim()
    .split('\n')
    .map((m) => chalk.magenta('DEBUG: ') + m)
    .join('\n');

  debug = (message: unknown = '') => {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.print(Logger.debugFormatter(String(message).toString()));
    }
  };

  static infoFormatter = (message: string): string => message.trim()
    .split('\n')
    .map((m) => chalk.cyan('INFO: ') + m)
    .join('\n');

  info = (message: unknown = '') => {
    if (this.logLevel <= LogLevel.INFO) {
      this.print(Logger.infoFormatter(String(message).toString()));
    }
  };

  static warnFormatter = (message: string): string => message.trim()
    .replace(/^warn.*: /i, '')
    .split('\n')
    .map((m) => chalk.yellow('WARN: ') + m)
    .join('\n');

  warn = (message: unknown = '') => {
    if (this.logLevel <= LogLevel.WARN) {
      this.print(Logger.warnFormatter(String(message).toString()));
    }
  };

  static errorFormatter = (message: string) => message.trim()
    .replace(/^err.*: /i, '')
    .split('\n')
    .map((m) => chalk.red('ERROR: ') + m)
    .join('\n');

  error = (message: unknown = '') => {
    if (this.logLevel <= LogLevel.ERROR) {
      this.print(Logger.errorFormatter(String(message).toString()));
    }
  };

  printHeader() {
    const logo = figlet.textSync(Constants.COMMAND_NAME.toUpperCase(), {
      font: 'Big Money-se',
    }).trimEnd();

    const logoSplit = logo.split('\n');
    const midLine = Math.min(Math.ceil(logoSplit.length / 2), logoSplit.length - 1);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine] = `${logoSplit[midLine].padEnd(maxLineLen, ' ')}   ROM collection manager`;

    this.print(`${logoSplit.join('\n')}\n\n`);
  }

  colorizeYargs(help: string) {
    this.print(
      help
        .replace(/^(Usage:.+)/, chalk.bold('$1'))

        .replace(/(\[commands\.*\])/g, chalk.magenta('$1'))
        .replace(new RegExp(`(${Constants.COMMAND_NAME}) (( ?[a-z])+)`, 'g'), `$1 ${chalk.magenta('$2')}`)

        .replace(/(\[options\.*\])/g, chalk.cyan('$1'))
        .replace(/([^a-zA-Z0-9-])(-[a-zA-Z0-9]+)/g, `$1${chalk.cyanBright('$2')}`)
        .replace(/(--[a-zA-Z0-9-]+(\n\s+)?[a-zA-Z0-9-]+)/g, chalk.cyan('$1'))

        .replace(/(\[(array|boolean|count|number|string)\])/g, chalk.grey('$1'))
        .replace(/(\[default:[^\]]+\]+)/g, chalk.green('$1'))
        .replace(/(\[required\])/g, chalk.red('$1'))

        .replace(new RegExp(` (${Constants.COMMAND_NAME}) `, 'g'), ` ${chalk.blueBright('$1')} `),
    );
  }

  addProgressBar(name: string, symbol: string, initialTotal = 0): ProgressBarCLI {
    return new ProgressBarCLI(this, name, symbol, initialTotal);
  }
}
