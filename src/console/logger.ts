import tty from 'node:tty';

import chalk from 'chalk';
import moment from 'moment';

import Package from '../globals/package.js';
import { LogLevel, LogLevelInverted, LogLevelValue } from './logLevel.js';
import MultiBar from './multiBar.js';
import ProgressBar from './progressBar.js';
import { SingleBarOptions } from './singleBar.js';

/**
 * {@link Logger} is a class that deals with the formatting and outputting log messages to a stream.
 */
export default class Logger {
  private logLevel: LogLevelValue;

  private readonly stream: tty.WriteStream | NodeJS.WritableStream;
  private readonly multiBar: MultiBar;
  private readonly loggerPrefix?: string;

  constructor(
    logLevel: LogLevelValue = LogLevel.WARN,
    stream: tty.WriteStream | NodeJS.WritableStream = process.stdout,
    multiBar?: MultiBar,
    loggerPrefix?: string,
  ) {
    this.logLevel = logLevel;
    this.stream = stream;
    this.multiBar = multiBar ?? MultiBar.create({ writable: stream });
    this.loggerPrefix = loggerPrefix;
  }

  getLogLevel(): LogLevelValue {
    return this.logLevel;
  }

  setLogLevel(logLevel: LogLevelValue): void {
    this.logLevel = logLevel;
  }

  getStream(): NodeJS.WritableStream | undefined {
    return this.stream;
  }

  private readonly print = (logLevel: LogLevelValue, message: unknown = ''): void => {
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
   * Format a log message for a given {@link LogLevelValue}.
   */
  formatMessage(logLevel: LogLevelValue, message: string): string {
    // Don't format "ALWAYS" or "NEVER"
    if (logLevel >= LogLevel.ALWAYS) {
      return message;
    }

    const chalkFuncs = {
      [LogLevel.ALWAYS]: (msg): string => msg,
      [LogLevel.TRACE]: chalk.grey,
      [LogLevel.DEBUG]: chalk.magenta,
      [LogLevel.INFO]: chalk.cyan,
      [LogLevel.WARN]: chalk.yellow,
      [LogLevel.ERROR]: chalk.red,
      [LogLevel.NOTICE]: chalk.underline,
      [LogLevel.NEVER]: (msg): string => msg,
    } satisfies Record<LogLevelValue, (message: string) => string>;
    const chalkFunc = chalkFuncs[logLevel];

    const loggerTime =
      this.logLevel <= LogLevel.TRACE ? `[${moment().format('HH:mm:ss.SSS')}] ` : '';
    const levelPrefix = `${chalkFunc(LogLevelInverted[logLevel])}: `;
    const loggerPrefix =
      this.logLevel <= LogLevel.TRACE && this.loggerPrefix ? `${this.loggerPrefix}: ` : '';

    return message
      .replace(/Error: /, '') // strip `new Error()` prefix
      .replace(/(\r?\n)(\r?\n)+/, '$1')
      .split('\n')
      .map((m) => (m.trim() ? loggerTime + levelPrefix + loggerPrefix + m : m))
      .join('\n');
  }

  trace = (message: unknown = ''): void => {
    this.print(LogLevel.TRACE, message);
  };

  debug = (message: unknown = ''): void => {
    this.print(LogLevel.DEBUG, message);
  };

  info = (message: unknown = ''): void => {
    this.print(LogLevel.INFO, message);
  };

  warn = (message: unknown = ''): void => {
    this.print(LogLevel.WARN, message);
  };

  error = (message: unknown = ''): void => {
    this.print(LogLevel.ERROR, message);
  };

  notice = (message: unknown = ''): void => {
    this.print(LogLevel.NOTICE, message);
  };

  /**
   * Print the CLI header.
   */
  printHeader(): void {
    const logo = `
   @@@@@@   @@@@@@     @@@@@@    @@@@@@@@
 @@      @@  @@      @@      @@         @@
 @@      @@  @@      @@      @@         @@
   @@@@@@   @@         @@@@@@   @@@@@@@@@
          @@@     @@@@        @@@
     @@   @@        @@   @@   @@       @@
     @@   @@        @@   @@   @@       @@
     @@   @@@@@@@@@@@@   @@   @@       @@`.replace(/^[\r\n]+/, '');

    const logoSplit = logo.split('\n');
    const midLine = Math.min(Math.ceil(logoSplit.length / 2), logoSplit.length - 1);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine - 2] =
      `${logoSplit[midLine - 2].padEnd(maxLineLen, ' ')}   ROM collection manager`;
    logoSplit[midLine - 1] =
      `${logoSplit[midLine - 1].padEnd(maxLineLen, ' ')}   ${Package.HOMEPAGE}`;
    logoSplit[midLine + 1] =
      `${logoSplit[midLine + 1].padEnd(maxLineLen, ' ')}   v${Package.VERSION}`;

    this.print(LogLevel.ALWAYS, `${logoSplit.join('\n')}\n`);
  }

  /**
   * Print a colorized yargs help string.
   */
  colorizeYargs(help: string): void {
    this.print(
      LogLevel.ALWAYS,
      help
        .replace(/^(Usage:.+)/, chalk.bold('$1'))

        .replaceAll(/(\[commands\.*\])/g, chalk.magenta('$1'))
        .replaceAll(
          new RegExp(`(${Package.NAME}) (( ?[a-z0-9])+)`, 'g'),
          `$1 ${chalk.magenta('$2')}`,
        )

        .replaceAll(/(\[options\.*\])/g, chalk.cyan('$1'))
        .replaceAll(
          /([^a-zA-Z0-9-])(-[a-zA-Z0-9]([a-zA-Z0-9]|\n[ \t]*)*)/g,
          `$1${chalk.cyanBright('$2')}`,
        )
        .replaceAll(
          /(--[a-zA-Z0-9][a-zA-Z0-9-]+(\n[ \t]+)?[a-zA-Z0-9-]+) ((?:[^ -])[^"][^ \n]*|"(?:[^"\\]|\\.)*")/g,
          `$1 ${chalk.underline('$3')}`,
        )
        .replaceAll(/(--[a-zA-Z0-9][a-zA-Z0-9-]+(\n[ \t]+)?[a-zA-Z0-9-]+)/g, chalk.cyan('$1'))
        .replaceAll(/(<[a-zA-Z]+>)/g, chalk.blue('$1'))

        .replaceAll(/(\[(array|boolean|count|number|string)\])/g, chalk.grey('$1'))
        .replaceAll(/(\[default: ([^[\]]+(\[[^\]]+\])?)*\])/g, chalk.green('$1'))
        .replaceAll(/(\[required\])/g, chalk.red('$1'))

        .replaceAll(/(\{[a-zA-Z]+\})/g, chalk.yellow('$1'))

        .replaceAll(new RegExp(` (${Package.NAME}) `, 'g'), ` ${chalk.blueBright('$1')} `),
    );
  }

  /**
   * Create a {@link ProgressBar} with a reference to this {@link Logger}.
   */
  addProgressBar(options?: SingleBarOptions): ProgressBar {
    return this.multiBar.addSingleBar(this, options);
  }

  /**
   * Return a copy of this Logger with a new string prefix.
   */
  withLoggerPrefix(prefix: string): Logger {
    return new Logger(this.logLevel, this.stream, this.multiBar, prefix);
  }
}
