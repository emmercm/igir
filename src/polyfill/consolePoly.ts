import terminalSize from 'term-size';

export default class ConsolePoly {
  static consoleWidth(): number {
    return process.stdout.isTTY ? terminalSize().columns : Math.floor(Number.MAX_SAFE_INTEGER / 2);
  }
}
