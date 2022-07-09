/* eslint-disable no-console */

import figlet from 'figlet';

export default class Logger {
  static readonly stream = process.stdout;

  static out = (message: unknown = '') => Logger.stream.write(`${message}\n`);

  // TODO(cemmer): color?
  static error = this.out;

  static header() {
    this.out(figlet.textSync('IGIR', {
      font: 'Big Money-se',
    }).trim());
    this.out();
  }
}
