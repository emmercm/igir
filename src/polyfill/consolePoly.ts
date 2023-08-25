import terminalSize from 'term-size';

export default class ConsolePoly {
  static consoleWidth(): number {
    return process.stdout.isTTY ? terminalSize().columns : 4_294_967_295;
  }
}
