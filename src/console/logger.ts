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

  setLogLevel(logLevel: LogLevel): void {
    this.logLevel = logLevel;
  }

  getStream(): NodeJS.WritableStream {
    return this.stream;
  }

  private readonly print = (logLevel: LogLevel, message: unknown = ''): void => {
    if (this.logLevel <= logLevel) {
      this.stream.write(`${Logger.formatMessage(logLevel, String(message).toString())}\n`);
    }
  };

  newLine(): void {
    this.print(LogLevel.ALWAYS);
  }

  static formatMessage(logLevel: LogLevel, message: string): string {
    // Don't format "ALWAYS" or "NEVER"
    if (logLevel >= LogLevel.ALWAYS) {
      return message;
    }

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

  debug = (message: unknown = ''): void => this.print(LogLevel.DEBUG, message);

  info = (message: unknown = ''): void => this.print(LogLevel.INFO, message);

  warn = (message: unknown = ''): void => this.print(LogLevel.WARN, message);

  error = (message: unknown = ''): void => this.print(LogLevel.ERROR, message);

  printHeader(): void {
    const logo = figlet.textSync(Constants.COMMAND_NAME.toUpperCase(), {
      font: 'Big Money-se',
    }).trimEnd();

    const logoSplit = logo.split('\n');
    const midLine = Math.min(Math.ceil(logoSplit.length / 2), logoSplit.length - 1);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine - 1] = `${logoSplit[midLine - 1].padEnd(maxLineLen, ' ')}   ROM collection manager`;
    logoSplit[midLine + 1] = `${logoSplit[midLine + 1].padEnd(maxLineLen, ' ')}   v${Constants.COMMAND_VERSION}`;

    this.print(LogLevel.ALWAYS, `${logoSplit.join('\n')}\n\n`);
  }

  colorizeYargs(help: string): void {
    this.print(
      LogLevel.ALWAYS,
      help
        .replace(/^(Usage:.+)/, chalk.bold('$1'))

        .replace(/(\[commands\.*\])/g, chalk.magenta('$1'))
        .replace(new RegExp(`(${Constants.COMMAND_NAME}) (( ?[a-z])+)`, 'g'), `$1 ${chalk.magenta('$2')}`)

        .replace(/(\[options\.*\])/g, chalk.cyan('$1'))
        .replace(/([^a-zA-Z0-9-])(-[a-zA-Z0-9]+)/g, `$1${chalk.cyanBright('$2')}`)
        .replace(/(--[a-zA-Z0-9-]+(\n[ \t]+)?[a-zA-Z0-9-]+)/g, chalk.cyan('$1'))

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
