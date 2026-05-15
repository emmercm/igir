import terminalSize from 'terminal-size';

export default {
  consoleWidth(): number {
    return process.stdout.isTTY ? terminalSize().columns : 65_536;
  },
};
