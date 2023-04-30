import terminalSize from 'term-size';

export default class ConsolePoly {
  static consoleWidth(): number {
    return process.stdout.isTTY ? terminalSize().columns : Number.MAX_SAFE_INTEGER;
  }
}
