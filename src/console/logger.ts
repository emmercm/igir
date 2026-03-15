import fs from 'node:fs';
import type tty from 'node:tty';

import chalk from 'chalk';
import moment from 'moment';
import terminalLink from 'terminal-link';

import Package from '../globals/package.js';
import type { LogLevelValue } from './logLevel.js';
import { LogLevel, LogLevelInverted } from './logLevel.js';

/**
 * {@link Logger} is a class that deals with the formatting and outputting log messages to a stream.
 */
export default class Logger {
  private logLevel: LogLevelValue;
  private readonly stream: tty.WriteStream | NodeJS.WritableStream;
  private readonly loggerPrefix?: string;

  private logFileHandle: number | undefined;

  constructor(
    logLevel: LogLevelValue,
    stream: tty.WriteStream | NodeJS.WritableStream,
    loggerPrefix?: string,
  ) {
    this.logLevel = logLevel;
    this.stream = stream;
    this.loggerPrefix = loggerPrefix;

    process.once('exit', () => {
      if (this.logFileHandle !== undefined) {
        fs.closeSync(this.logFileHandle);
      }
    });
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

  setLogFile(logFile: string): void {
    if (this.logFileHandle !== undefined) {
      fs.closeSync(this.logFileHandle);
    }
    this.logFileHandle = fs.openSync(logFile, 'a');
  }

  /**
   * Possibly format & print a log message at a given log level.
   */
  printFormattedLine(logLevel: LogLevelValue, message: unknown = ''): boolean {
    let formattedMessage: string | undefined;
    if (this.logFileHandle !== undefined) {
      formattedMessage = this.formatMessage(logLevel, String(message));
      fs.writeSync(this.logFileHandle, `${formattedMessage}\n`);
    }

    if (this.logLevel > logLevel) {
      return false;
    }

    formattedMessage ??= this.formatMessage(logLevel, String(message));
    this.stream.write(`${formattedMessage}\n`);
    return true;
  }

  /**
   * Print a log message without formatting.
   */
  printRaw(message: string): boolean {
    if (this.logFileHandle !== undefined && message) {
      fs.writeSync(this.logFileHandle, message);
    }

    if (this.logLevel === LogLevel.NEVER) {
      return false;
    }

    this.stream.write(message);
    return true;
  }

  /**
   * Print a newline.
   */
  newLine(): void {
    this.printRaw('\n');
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
      this.logLevel <= LogLevel.TRACE && this.loggerPrefix
        ? chalk.dim(`${this.loggerPrefix}: `)
        : '';

    return message
      .replace(/Error: /, '') // strip `new Error()` prefix
      .replace(/(\r?\n)(\r?\n)+/, '$1')
      .split('\n')
      .map((m) => (m.trim() ? loggerTime + levelPrefix + loggerPrefix + m : m))
      .join('\n');
  }

  trace = (message: unknown = ''): void => {
    this.printFormattedLine(LogLevel.TRACE, message);
  };

  debug = (message: unknown = ''): void => {
    this.printFormattedLine(LogLevel.DEBUG, message);
  };

  info = (message: unknown = ''): void => {
    this.printFormattedLine(LogLevel.INFO, message);
  };

  warn = (message: unknown = ''): void => {
    this.printFormattedLine(LogLevel.WARN, message);
  };

  error = (message: unknown = ''): void => {
    this.printFormattedLine(LogLevel.ERROR, message);
  };

  notice = (message: unknown = ''): void => {
    this.printFormattedLine(LogLevel.NOTICE, message);
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
      `${logoSplit[midLine - 1].padEnd(maxLineLen, ' ')}   ${terminalLink(Package.HOMEPAGE, Package.HOMEPAGE, { fallback: false })}`;

    let runtime = `Node.js v${process.versions.node}`;
    if (process.versions.bun) {
      runtime = `Bun v${process.versions.bun}`;
    }
    logoSplit[midLine + 1] =
      `${logoSplit[midLine + 1].padEnd(maxLineLen, ' ')}   v${Package.VERSION} ${chalk.dim(`(${runtime})`)}`;

    this.printRaw(`${logoSplit.join('\n')}\n`);
  }

  /**
   * Print a colorized yargs help string.
   */
  colorizeYargs(help: string): void {
    this.printFormattedLine(
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
   * Return a copy of this Logger with a new string prefix.
   */
  withLoggerPrefix(prefix: string): Logger {
    return new Logger(this.logLevel, this.stream, prefix);
  }
}
