import chalk from 'chalk';
import figlet from 'figlet';

import Constants from '../constants.js';
import LogLevel from './logLevel.js';
import { Symbols } from './progressBar.js';
import ProgressBarCLI from './progressBarCLI.js';

export default class Logger {
  private logLevel: LogLevel;

  private readonly stream: NodeJS.WritableStream;

  private readonly loggerPrefix?: string;

  constructor(
    logLevel: LogLevel = LogLevel.WARN,
    stream: NodeJS.WritableStream = process.stdout,
    loggerPrefix?: string,
  ) {
    this.logLevel = logLevel;
    this.stream = stream;
    this.loggerPrefix = loggerPrefix;
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
      this.stream.write(`${this.formatMessage(logLevel, String(message).toString())}\n`);
    }
  };

  newLine(): void {
    this.print(LogLevel.ALWAYS);
  }

  formatMessage(logLevel: LogLevel, message: string): string {
    // Don't format "ALWAYS" or "NEVER"
    if (logLevel >= LogLevel.ALWAYS) {
      return message;
    }

    const chalkFuncs: { [key: number]: (message: string) => string } = {
      [LogLevel.TRACE]: chalk.grey,
      [LogLevel.DEBUG]: chalk.magenta,
      [LogLevel.INFO]: chalk.cyan,
      [LogLevel.WARN]: chalk.yellow,
      [LogLevel.ERROR]: chalk.red,
    };
    const chalkFunc = chalkFuncs[logLevel];

    const loggerPrefix = this.logLevel <= LogLevel.INFO && this.loggerPrefix ? `${this.loggerPrefix}: ` : '';

    return message.trim()
      .split('\n')
      .map((m) => chalkFunc(`${LogLevel[logLevel]}: `) + loggerPrefix + m)
      .join('\n');
  }

  trace = (message: unknown = ''): void => this.print(LogLevel.TRACE, message);

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

  async addProgressBar(
    name: string,
    symbol = Symbols.WAITING,
    initialTotal = 0,
  ): Promise<ProgressBarCLI> {
    return ProgressBarCLI.new(this, name, symbol, initialTotal);
  }

  withLoggerPrefix(prefix: string): Logger {
    return new Logger(this.logLevel, this.stream, prefix);
  }
}
