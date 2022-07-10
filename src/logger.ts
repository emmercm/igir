/* eslint-disable no-console */

import figlet from 'figlet';

export default class Logger {
  static readonly stream = process.stdout;

  static out = (message: unknown = '') => Logger.stream.write(`${message}\n`);

  // TODO(cemmer): color?
  static error = this.out;

  static header() {
    const logo = figlet.textSync('IGIR', {
      font: 'Big Money-se',
    }).trim();

    const logoSplit = logo.split('\n');
    const midLine = Math.ceil(logoSplit.length / 2);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine] = `${logoSplit[midLine].padEnd(maxLineLen, ' ')}   ROM collection manager`;

    this.out(`${logoSplit.join('\n')}\n\n`);
  }
}
