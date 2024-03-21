import { PassThrough } from 'node:stream';
import { WriteStream } from 'node:tty';

import chalk from 'chalk';
import figlet from 'figlet';
import moment from 'moment';

import Constants from '../constants.js';
import LogLevel from './logLevel.js';
import ProgressBar, { ProgressBarSymbol } from './progressBar.js';
import ProgressBarCLI from './progressBarCli.js';

/**
 * {@link Logger} is a class that deals with the formatting and outputting log messages to a stream.
 */
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

  /**
   * Determine if this {@link Logger}'s underlying stream is a TTY stream or not.
   */
  isTTY(): boolean {
    if (this.stream instanceof WriteStream) {
      return (this.stream satisfies WriteStream).isTTY;
    }
    if (this.stream instanceof PassThrough) {
      // Testing streams should be treated as TTY
      return true;
    }
    return false;
  }

  private readonly print = (logLevel: LogLevel, message: unknown = ''): void => {
    if (this.logLevel > logLevel) {
      return;
    }
    this.stream.write(`${this.formatMessage(logLevel, String(message).toString())}\n`);
  };

  /**
   * Print a newline.
   */
  newLine(): void {
    this.print(LogLevel.ALWAYS);
  }

  /**
   * Format a log message for a given {@link LogLevel}.
   */
  formatMessage(logLevel: LogLevel, message: string): string {
    // Don't format "ALWAYS" or "NEVER"
    if (logLevel >= LogLevel.ALWAYS) {
      return message;
    }

    const chalkFuncs = {
      [LogLevel.ALWAYS]: (msg) => msg,
      [LogLevel.TRACE]: chalk.grey,
      [LogLevel.DEBUG]: chalk.magenta,
      [LogLevel.INFO]: chalk.cyan,
      [LogLevel.WARN]: chalk.yellow,
      [LogLevel.ERROR]: chalk.red,
      [LogLevel.NOTICE]: chalk.underline,
      [LogLevel.NEVER]: (msg) => msg,
    } satisfies { [key in LogLevel]: (message: string) => string };
    const chalkFunc = chalkFuncs[logLevel];

    const loggerTime = this.logLevel <= LogLevel.TRACE ? `[${moment().format('HH:mm:ss.SSS')}] ` : '';
    const levelPrefix = `${chalkFunc(LogLevel[logLevel])}:${' '.repeat(Math.max(5 - LogLevel[logLevel].length, 0))} `;
    const loggerPrefix = this.logLevel <= LogLevel.TRACE && this.loggerPrefix ? `${this.loggerPrefix}: ` : '';

    return message
      .replace(/Error: /, '') // strip `new Error()` prefix
      .replace(/(\r?\n)(\r?\n)+/, '$1')
      .split('\n')
      .map((m) => (m.trim() ? loggerTime + levelPrefix + loggerPrefix + m : m))
      .join('\n');
  }

  trace = (message: unknown = ''): void => this.print(LogLevel.TRACE, message);

  debug = (message: unknown = ''): void => this.print(LogLevel.DEBUG, message);

  info = (message: unknown = ''): void => this.print(LogLevel.INFO, message);

  warn = (message: unknown = ''): void => this.print(LogLevel.WARN, message);

  error = (message: unknown = ''): void => this.print(LogLevel.ERROR, message);

  notice = (message: unknown = ''): void => this.print(LogLevel.NOTICE, message);

  /**
   * Print the CLI header.
   */
  printHeader(): void {
    const logo = figlet.textSync(Constants.COMMAND_NAME.toUpperCase(), {
      font: 'Big Money-se',
    }).trimEnd();

    const logoSplit = logo.split('\n');
    const midLine = Math.min(Math.ceil(logoSplit.length / 2), logoSplit.length - 1);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine - 2] = `${logoSplit[midLine - 1].padEnd(maxLineLen, ' ')}   ROM collection manager`;
    logoSplit[midLine - 1] = `${logoSplit[midLine - 1].padEnd(maxLineLen, ' ')}   ${Constants.HOMEPAGE}`;
    logoSplit[midLine + 1] = `${logoSplit[midLine + 1].padEnd(maxLineLen, ' ')}   v${Constants.COMMAND_VERSION}`;

    this.print(LogLevel.ALWAYS, `${logoSplit.join('\n')}\n\n`);
  }

  /**
   * Print a colorized yargs help string.
   */
  colorizeYargs(help: string): void {
    this.print(
      LogLevel.ALWAYS,
      help
        .replace(/^(Usage:.+)/, chalk.bold('$1'))

        .replace(/(\[commands\.*\])/g, chalk.magenta('$1'))
        .replace(new RegExp(`(${Constants.COMMAND_NAME}) (( ?[a-z0-9])+)`, 'g'), `$1 ${chalk.magenta('$2')}`)

        .replace(/(\[options\.*\])/g, chalk.cyan('$1'))
        .replace(/([^a-zA-Z0-9-])(-[a-zA-Z0-9]([a-zA-Z0-9]|\n[ \t]*)*)/g, `$1${chalk.cyanBright('$2')}`)
        .replace(/(--[a-zA-Z0-9][a-zA-Z0-9-]+(\n[ \t]+)?[a-zA-Z0-9-]+) ((?:[^ -])[^"][^ \n]*|"(?:[^"\\]|\\.)*")/g, `$1 ${chalk.underline('$3')}`)
        .replace(/(--[a-zA-Z0-9][a-zA-Z0-9-]+(\n[ \t]+)?[a-zA-Z0-9-]+)/g, chalk.cyan('$1'))
        .replace(/(<[a-zA-Z]+>)/g, chalk.blue('$1'))

        .replace(/(\[(array|boolean|count|number|string)\])/g, chalk.grey('$1'))
        .replace(/(\[default: ([^[\]]+(\[[^\]]+\])?)*\])/g, chalk.green('$1'))
        .replace(/(\[required\])/g, chalk.red('$1'))

        .replace(/(\{[a-zA-Z]+\})/g, chalk.yellow('$1'))

        .replace(new RegExp(` (${Constants.COMMAND_NAME}) `, 'g'), ` ${chalk.blueBright('$1')} `),
    );
  }

  /**
   * Create a {@link ProgressBar} with a reference to this {@link Logger}.
   */
  async addProgressBar(
    name: string,
    symbol = ProgressBarSymbol.WAITING,
    initialTotal = 0,
  ): Promise<ProgressBar> {
    return ProgressBarCLI.new(this, name, symbol, initialTotal);
  }

  /**
   * Return a copy of this Logger with a new string prefix.
   */
  withLoggerPrefix(prefix: string): Logger {
    return new Logger(this.logLevel, this.stream, prefix);
  }
}
