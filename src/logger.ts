import chalk from 'chalk';
import figlet from 'figlet';

import Constants from './constants.js';

export default class Logger {
  static readonly stream = process.stdout;

  static print = (message: unknown = '') => {
    if (process.env.NODE_ENV !== 'test') {
      this.stream.write(`${message}\n`);
    }
  };

  static warnFormatter = (message: string): string => chalk.yellow('WARN: ') + message;

  static warn = (message: unknown = '') => this.print(this.warnFormatter(String(message).toString()));

  static errorFormatter = (message: string) => chalk.red('ERROR: ') + message;

  static error = (message: unknown = '') => this.print(this.errorFormatter(String(message).toString()));

  static header(text: string) {
    const logo = figlet.textSync(text.toUpperCase(), {
      font: 'Big Money-se',
    }).trimEnd();

    const logoSplit = logo.split('\n');
    const midLine = Math.ceil(logoSplit.length / 2);
    const maxLineLen = logoSplit.reduce((max, line) => Math.max(max, line.length), 0);
    logoSplit[midLine] = `${logoSplit[midLine].padEnd(maxLineLen, ' ')}   ROM collection manager`;

    this.print(`${logoSplit.join('\n')}\n\n`);
  }

  static colorizeYargs(help: string) {
    this.print(
      help
        .replace(/^(Usage:.+)/, chalk.bold('$1'))

        .replace(/(\[commands\.*\])/g, chalk.magenta('$1'))
        .replace(new RegExp(`(${Constants.COMMAND_NAME}) (( ?[a-z])+)`, 'g'), `$1 ${chalk.magenta('$2')}`)

        .replace(/(\[options\.*\])/g, chalk.cyan('$1'))
        .replace(/ (-[a-zA-Z0-9])/g, ` ${chalk.cyanBright('$1')}`)
        .replace(/(--[a-zA-Z0-9-]+(\n\s+)?[a-zA-Z0-9-]+)/g, chalk.cyan('$1'))

        .replace(/(\[(array|boolean|count|number|string)\])/g, chalk.grey('$1'))
        .replace(/(\[default:[^\]]+\]+)/g, chalk.green('$1'))
        .replace(/(\[required\])/g, chalk.red('$1'))

        .replace(new RegExp(` (${Constants.COMMAND_NAME}) `, 'g'), ` ${chalk.blueBright('$1')} `),
    );
  }
}
