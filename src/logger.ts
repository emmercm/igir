/* eslint-disable no-console */

import chalk from 'chalk';
import figlet from 'figlet';

export default class Logger {
  static readonly stream = process.stdout;

  static out = (message: unknown = '') => Logger.stream.write(`${message}\n`);

  static warnFormatter = (message: string): string => chalk.yellow('WARN: ') + message;

  static warn = (message: unknown = '') => Logger.warnFormatter(String(message).toString());

  static errorFormatter = (message: string) => chalk.red('ERROR: ') + message;

  static error = (message: unknown = '') => Logger.errorFormatter(String(message).toString());

  static header() {
    const logo = figlet.textSync('IGIR', {
      font: 'Big Money-se',
    }).trimEnd();

    const logoSplit = logo.split('\n');
    const midLine = Math.ceil(logoSplit.length / 2);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine] = `${logoSplit[midLine].padEnd(maxLineLen, ' ')}   ROM collection manager`;

    this.out(`${logoSplit.join('\n')}\n\n`);
  }
}
