import terminalSize from 'terminal-size';

export default {
  consoleWidth: (): number => (process.stdout.isTTY ? terminalSize().columns : 65_536),
};
