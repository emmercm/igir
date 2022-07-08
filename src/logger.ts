/* eslint-disable no-console */

import figlet from 'figlet';

export default class Logger {
  static header() {
    console.log(figlet.textSync('IGIR', {
      font: 'Big Money-se',
    }));
  }
}
