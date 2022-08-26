import chalk from 'chalk';
import figlet from 'figlet';

import Constants from '../constants.js';
import LogLevel from './logLevel.js';
import ProgressBarCLI from './progressBarCLI.js';

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

  private readonly print = (logLevel: LogLevel, message: unknown = '') => {
    if (this.logLevel <= logLevel) {
      this.stream.write(`${message}\n`);
    }
  };

  newLine() {
    this.print(LogLevel.ON);
  }

  static formatter(logLevel: LogLevel, message: string): string {
    const chalkFuncs: { [key: number]: (message: string) => string } = {
      [LogLevel.DEBUG]: chalk.magenta,
      [LogLevel.INFO]: chalk.cyan,
      [LogLevel.WARN]: chalk.yellow,
      [LogLevel.ERROR]: chalk.red,
    };
    const chalkFunc = chalkFuncs[logLevel];

    return message.trim()
      .split('\n')
      .map((m) => chalkFunc(`${LogLevel[logLevel]}: `) + m)
      .join('\n');
  }

  static debugFormatter = (message: string): string => this.formatter(LogLevel.DEBUG, message);

  debug = (message: unknown = '') => {
    this.print(LogLevel.DEBUG, Logger.debugFormatter(String(message).toString()));
  };

  static infoFormatter = (message: string): string => this.formatter(LogLevel.INFO, message);

  info = (message: unknown = '') => {
    this.print(LogLevel.INFO, Logger.infoFormatter(String(message).toString()));
  };

  static warnFormatter = (message: string): string => this.formatter(LogLevel.WARN, message);

  warn = (message: unknown = '') => {
    this.print(LogLevel.WARN, Logger.warnFormatter(String(message).toString()));
  };

  static errorFormatter = (message: string) => this.formatter(LogLevel.ERROR, message);

  error = (message: unknown = '') => {
    this.print(LogLevel.ERROR, Logger.errorFormatter(String(message).toString()));
  };

  printHeader() {
    const logo = figlet.textSync(Constants.COMMAND_NAME.toUpperCase(), {
      font: 'Big Money-se',
    }).trimEnd();

    const logoSplit = logo.split('\n');
    const midLine = Math.min(Math.ceil(logoSplit.length / 2), logoSplit.length - 1);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine] = `${logoSplit[midLine].padEnd(maxLineLen, ' ')}   ROM collection manager`;

    this.print(LogLevel.ON, `${logoSplit.join('\n')}\n\n`);
  }

  colorizeYargs(help: string) {
    this.print(
      LogLevel.ON,
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
