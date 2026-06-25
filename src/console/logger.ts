import fs from 'node:fs';

import chalk from 'chalk';
import stripAnsi from 'strip-ansi';
import terminalLink from 'terminal-link';

import Package from '../globals/package.js';
import DateUtil from '../utils/dateUtil.js';
import type { LogLevelValue } from './logLevel.js';
import { LogLevel, LogLevelInverted } from './logLevel.js';
import PrefixedLogger from './prefixedLogger.js';
import type Terminal from './terminal.js';
import { terminal } from './terminal.js';

/**
 * {@link Logger} owns log-message semantics: it formats and filters messages by {@link LogLevel},
 * tees them to an optional log file, and coordinates the blank-line spacing around frozen
 * progress-bar snapshots. It writes finished lines to the output via {@link Terminal}.
 */
export default class Logger {
  private readonly terminal: Terminal;

  private logLevel: LogLevelValue = LogLevel.TRACE;
  private logFileHandle: number | undefined;
  private lastPrintedFrozen = false;

  constructor(terminal: Terminal) {
    this.terminal = terminal;

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

  /**
   * Create a {@link PrefixedLogger} that prepends every message it logs with the given prefix.
   */
  child(prefix: string): PrefixedLogger {
    return new PrefixedLogger(this, prefix);
  }

  /**
   * Open (or replace) a file that every message is additionally written to, regardless of log level.
   */
  openLogFile(logFile: string): void {
    if (this.logFileHandle !== undefined) {
      fs.closeSync(this.logFileHandle);
    }
    this.logFileHandle = fs.openSync(logFile, 'a');
  }

  /**
   * Print a frozen progress-bar snapshot (always, as a permanent line above the live region). The
   * line is marked as frozen so that consecutive snapshots stay visually adjacent and a following
   * non-frozen log line is separated from it by a blank line.
   */
  printFrozenBar(message: unknown = '', prefix?: string): boolean {
    return this.write(LogLevel.ALWAYS, message, prefix, true);
  }

  private write(
    logLevel: LogLevelValue,
    message: unknown,
    prefix?: string,
    frozen = false,
  ): boolean {
    const willPrint = this.logLevel <= logLevel;
    if (!willPrint && this.logFileHandle === undefined) {
      // The message is filtered out and there's no log file to tee it to, so skip the string work.
      return false;
    }

    let messageString = String(message);

    // Keep consecutive frozen progress-bar snapshots visually adjacent, and separate a frozen
    // snapshot from a following non-frozen log line with a blank line.
    if (this.lastPrintedFrozen) {
      if (frozen) {
        messageString = messageString.replace(/^\n+/, '');
      } else {
        messageString = `\n${messageString}`;
      }
    }

    if (willPrint) {
      this.lastPrintedFrozen = frozen;
    }

    if (this.logFileHandle !== undefined) {
      const formattedMessage = stripAnsi(
        Logger.formatMessage(LogLevel.TRACE, logLevel, messageString, prefix),
      );
      if (formattedMessage.trim()) {
        fs.writeSync(this.logFileHandle, `${formattedMessage}\n`);
      }
    }

    if (!willPrint) {
      return false;
    }

    this.terminal.writeLine(Logger.formatMessage(this.logLevel, logLevel, messageString, prefix));
    return true;
  }

  /**
   * Print a newline.
   */
  newLine(): void {
    this.write(LogLevel.ALWAYS, '');
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
      currentLogLevel <= LogLevel.TRACE ? `[${DateUtil.format('HH:mm:ss.SSS')}] ` : '';
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

  trace = (message: unknown = '', prefix?: string): void => {
    this.write(LogLevel.TRACE, message, prefix);
  };

  debug = (message: unknown = '', prefix?: string): void => {
    this.write(LogLevel.DEBUG, message, prefix);
  };

  info = (message: unknown = '', prefix?: string): void => {
    this.write(LogLevel.INFO, message, prefix);
  };

  warn = (message: unknown = '', prefix?: string): void => {
    this.write(LogLevel.WARN, message, prefix);
  };

  error = (message: unknown = '', prefix?: string): void => {
    this.write(LogLevel.ERROR, message, prefix);
  };

  notice = (message: unknown = '', prefix?: string): void => {
    this.write(LogLevel.NOTICE, message, prefix);
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

    this.write(LogLevel.ALWAYS, `${logoSplit.join('\n')}\n`);
  }

  /**
   * Print a colorized yargs help string.
   */
  colorizeYargs(help: string): void {
    this.write(
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

/**
 * The application-wide {@link Logger}. Import this to log from anywhere without threading a logger
 * through constructors. Configured (log level, log file) at startup in the entry point.
 */
export const logger = new Logger(terminal);
