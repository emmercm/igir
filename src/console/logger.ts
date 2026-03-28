import fs from 'node:fs';
import type tty from 'node:tty';

import chalk from 'chalk';
import moment from 'moment';
import stripAnsi from 'strip-ansi';
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

  private logFileHandle: number | undefined;

  constructor(logLevel: LogLevelValue, stream: tty.WriteStream | NodeJS.WritableStream) {
    this.logLevel = logLevel;
    this.stream = stream;

    process.once('exit', () => {
      if (this.logFileHandle !== undefined) {
        fs.closeSync(this.logFileHandle);
      }
    });
  }

  getLogLevel(): LogLevelValue {
    return this.logLevel;
  }

  /**
   * Can the logger print a message at the specified LogLevel?
   */
  canPrint(logLevel: LogLevelValue): boolean {
    return this.logLevel <= logLevel;
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
   * Print a message (with an ending newline) at the specified LogLevel.
   */
  printLine(logLevel: LogLevelValue, message: unknown = '', prefix?: string): boolean {
    if (this.logFileHandle !== undefined) {
      const formattedMessage = stripAnsi(
        Logger.formatMessage(LogLevel.TRACE, logLevel, String(message), prefix),
      );
      if (formattedMessage.trim()) {
        fs.writeSync(this.logFileHandle, `${stripAnsi(formattedMessage)}\n`);
      }
    }

    if (this.logLevel > logLevel) {
      return false;
    }

    this.stream.write(`${this.formatMessage(logLevel, String(message), prefix)}\n`);
    return true;
  }

  /**
   * Print a newline.
   */
  newLine(): void {
    this.printLine(LogLevel.ALWAYS);
  }

  private formatMessage(messageLogLevel: LogLevelValue, message: string, prefix?: string): string {
    return Logger.formatMessage(this.logLevel, messageLogLevel, message, prefix);
  }

  private static formatMessage(
    currentLogLevel: LogLevelValue,
    messageLogLevel: LogLevelValue,
    message: string,
    prefix?: string,
  ): string {
    // Don't format "ALWAYS" or "NEVER"
    if (messageLogLevel >= LogLevel.ALWAYS) {
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
    const chalkFunc = chalkFuncs[messageLogLevel];

    const loggerTime =
      currentLogLevel <= LogLevel.TRACE ? `[${moment().format('HH:mm:ss.SSS')}] ` : '';
    const levelPrefix = `${chalkFunc(LogLevelInverted[messageLogLevel])}: `;
    const loggerPrefix =
      currentLogLevel <= LogLevel.TRACE && prefix ? chalk.dim(`${prefix}: `) : '';

    return message
      .replace(/Error: /, '') // strip `new Error()` prefix
      .replace(/(\r?\n)(\r?\n)+/, '$1')
      .split('\n')
      .map((m) => (m.trim() ? loggerTime + levelPrefix + loggerPrefix + m : m))
      .join('\n');
  }

  trace = (message: unknown = ''): void => {
    this.printLine(LogLevel.TRACE, message);
  };

  debug = (message: unknown = ''): void => {
    this.printLine(LogLevel.DEBUG, message);
  };

  info = (message: unknown = ''): void => {
    this.printLine(LogLevel.INFO, message);
  };

  warn = (message: unknown = ''): void => {
    this.printLine(LogLevel.WARN, message);
  };

  error = (message: unknown = ''): void => {
    this.printLine(LogLevel.ERROR, message);
  };

  notice = (message: unknown = ''): void => {
    this.printLine(LogLevel.NOTICE, message);
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

    this.printLine(LogLevel.ALWAYS, `${logoSplit.join('\n')}\n`);
  }

  /**
   * Print a colorized yargs help string.
   */
  colorizeYargs(help: string): void {
    this.printLine(
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
}
