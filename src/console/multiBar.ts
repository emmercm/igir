import tty from 'node:tty';

import stripAnsi from 'strip-ansi';

import Timer from '../async/timer.js';
import type Logger from './logger.js';
import type { LogLevelValue } from './logLevel.js';
import { LogLevel } from './logLevel.js';
import type { SingleBarOptions } from './singleBar.js';
import SingleBar from './singleBar.js';

const exitHandler = (): void => {
  MultiBar.stop();
};
process.once('exit', exitHandler);
process.once('SIGINT', exitHandler);
process.once('SIGTERM', exitHandler);

/**
 * A wrapper for multiple {@link SingleBar}s. Should be treated as a singleton.
 */
export default class MultiBar {
  private static readonly RENDER_MIN_FPS = 4;
  private static readonly OUTPUT_PADDING = ' ';

  private static readonly multiBars: MultiBar[] = [];
  private static readonly logQueue: [LogLevelValue, string, string | undefined][] = [];
  private static lastPrintedLog?: [LogLevelValue, string, string | undefined];

  private readonly singleBars: SingleBar[] = [];
  private renderTimer?: Timer;
  private lastOutput = '';
  private stopped = false;
  private readonly sigwinchHandler?: () => void;

  private readonly logger: Logger;
  private readonly terminal: tty.WriteStream | NodeJS.WritableStream;
  private terminalColumns = 65_536;
  private terminalRows = 65_536;

  private constructor(logger: Logger) {
    this.logger = logger;
    this.terminal = logger.getStream() ?? process.stdout;

    // Disable the cursor
    if (this.terminal instanceof tty.WriteStream) {
      this.terminal.write('\x1B[?25l');
    }

    // Set a maximum size for the MultiBar based on terminal size
    if (this.terminal instanceof tty.WriteStream) {
      this.sigwinchHandler = (): void => {
        if (!(this.terminal instanceof tty.WriteStream)) {
          return;
        }
        this.terminalColumns = this.terminal.columns;
        this.terminalRows = this.terminal.rows;
        this.clearAndRender();
      };
      process.on('SIGWINCH', this.sigwinchHandler);
      this.sigwinchHandler();
    }
  }

  /**
   * Create a new {@link MultiBar} instance.
   */
  static create(logger: Logger): MultiBar {
    const multiBar = new MultiBar(logger);
    this.multiBars.push(multiBar);
    return multiBar;
  }

  /**
   * Returns true if there are any active MultiBars.
   */
  static isActive(): boolean {
    return this.multiBars.length > 0;
  }

  /**
   * Add a new {@link SingleBar} to the {@link MultiBar}.
   */
  addSingleBar(options?: SingleBarOptions, parentSingleBar?: SingleBar): SingleBar {
    const singleBar = new SingleBar(this, options);

    const parentSingleBarIndex = parentSingleBar
      ? this.singleBars.indexOf(parentSingleBar)
      : undefined;
    const insertionIndex =
      parentSingleBarIndex === undefined
        ? undefined
        : this.singleBars.findIndex(
            (singleBar, idx) => idx > parentSingleBarIndex && singleBar.getIndentSize() === 0,
          );

    if (insertionIndex === undefined || insertionIndex === -1) {
      this.singleBars.push(singleBar);
    } else {
      this.singleBars.splice(insertionIndex, 0, singleBar);
    }

    return singleBar;
  }

  /**
   * Log the {@link SingleBar}'s last output and remove it.
   */
  freezeSingleBar(singleBar: SingleBar): void {
    const idx = this.singleBars.indexOf(singleBar);
    if (idx === -1) {
      return;
    }

    // Render one last time, then log the output
    this.clearAndRender();
    const lastOutput = singleBar.getLastOutput();
    if (lastOutput !== undefined) {
      this.log(
        LogLevel.ALWAYS,
        `${singleBar.getIndentSize() === 0 ? '\n' : ''}${MultiBar.OUTPUT_PADDING}${lastOutput}`,
      );
    }

    // Remove the single bar
    this.singleBars.splice(idx, 1);
  }

  /**
   * Remove a {@link SingleBar}.
   */
  removeSingleBar(singleBar: SingleBar): void {
    const idx = this.singleBars.indexOf(singleBar);
    if (idx === -1) {
      return;
    }

    this.singleBars.splice(idx, 1);
  }

  /**
   * Queue a log message to be printed to the terminal.
   */
  static log(logLevel: LogLevelValue, message: string): void {
    this.multiBars.at(0)?.log(logLevel, message);
  }

  /**
   * Queue a log message to be printed to the terminal.
   */
  log(logLevel: LogLevelValue, message: string, prefix?: string): void {
    // Find the last log line that would have been printed immediately before this message
    const lastPrintedLog =
      MultiBar.logQueue.findLast(([logLevel]) => this.logger.canPrint(logLevel)) ??
      MultiBar.lastPrintedLog;

    const isFrozenPattern = new RegExp(`^\n*${MultiBar.OUTPUT_PADDING}`);
    const lastPrintedLogIsFrozen =
      lastPrintedLog !== undefined && isFrozenPattern.test(lastPrintedLog[1]);
    const thisMessageIsFrozen = isFrozenPattern.test(message);

    if (lastPrintedLogIsFrozen) {
      if (thisMessageIsFrozen) {
        // Print frozen progress bars next to each other
        message = message.replace(/^\n+/, '');
      } else {
        // Otherwise, add a newline after the previous frozen progress bar
        message = `\n${message}`;
      }
    }

    MultiBar.logQueue.push([logLevel, message, prefix]);
  }

  /**
   * Clear the last output and render the progress bars.
   */
  clearAndRender(): void {
    if (this.stopped) {
      return;
    }

    this.renderTimer?.cancel();
    this.renderTimer = Timer.setTimeout(
      () => {
        this.clearAndRender();
      },
      Math.max(1000 / MultiBar.RENDER_MIN_FPS, 1),
    );

    const outputLines = this.singleBars
      .flatMap((singleBar) => {
        const lines = singleBar
          .format()
          .split('\n')
          .filter((line) => line !== '');
        if (singleBar.getIndentSize() === 0) {
          return ['', ...lines];
        }
        return lines;
      })
      .slice(0, this.terminalRows - 1)
      .map((line) => {
        const stripChars = stripAnsi(line).length - this.terminalColumns + 10;
        if (stripChars <= 0) {
          return `${MultiBar.OUTPUT_PADDING}${line}`;
        }
        return `${MultiBar.OUTPUT_PADDING}${line.slice(0, line.length - stripChars)}…`;
      });
    const output = outputLines.join('\n');

    if (output === this.lastOutput && MultiBar.logQueue.length === 0) {
      // Nothing new to render
      return;
    }

    // Clear the entire progress bar area before printing logs
    let screenCleared = false;
    if (this.terminal instanceof tty.WriteStream && MultiBar.logQueue.length > 0) {
      const rowsToMoveUp = this.lastOutput.split('\n').length - 1;
      if (rowsToMoveUp > 0) {
        this.terminal.moveCursor(0, -rowsToMoveUp);
        this.terminal.cursorTo(0);
        this.terminal.clearScreenDown();
        screenCleared = true;
      }
    }

    // Write out all queued logs
    let log = MultiBar.logQueue.shift();
    while (log !== undefined) {
      if (this.logger.printLine(log[0], log[1], log[2])) {
        MultiBar.lastPrintedLog = log;
      }
      log = MultiBar.logQueue.shift();
    }

    if (this.terminal instanceof tty.WriteStream) {
      if (screenCleared) {
        // Screen was cleared for logs; write the full output
        this.terminal.write(output);
      } else {
        // Partial repaint: find the first changed line, move up to it, then overwrite in-place
        const lastLines = this.lastOutput.split('\n');
        const newLines = output.split('\n');

        let firstChangedRow = 0;
        while (
          firstChangedRow < lastLines.length - 1 &&
          firstChangedRow < newLines.length - 1 &&
          lastLines[firstChangedRow] === newLines[firstChangedRow]
        ) {
          firstChangedRow++;
        }

        const rowsToMoveUp = lastLines.length - 1 - firstChangedRow;
        if (rowsToMoveUp > 0) {
          this.terminal.moveCursor(0, -rowsToMoveUp);
          this.terminal.cursorTo(0);
        }

        const newLineCount = newLines.length - 1;
        const lastLineCount = lastLines.length - 1;

        for (let i = firstChangedRow; i < newLineCount; i++) {
          this.terminal.cursorTo(0);
          this.terminal.write(newLines[i]);
          this.terminal.clearLine(1); // erase leftover chars if the new line is shorter
          this.terminal.write('\n');
        }

        // Cursor is now at row newLineCount; ensure column 0
        this.terminal.cursorTo(0);

        // Erase any extra lines from the old output by clearing them in-place, then stepping back up
        const extraOldLines = Math.max(0, lastLineCount - newLineCount);
        for (let i = 0; i < extraOldLines; i++) {
          this.terminal.clearLine(0);
          if (i < extraOldLines - 1) {
            this.terminal.moveCursor(0, 1);
          }
        }
        if (extraOldLines > 1) {
          this.terminal.moveCursor(0, -(extraOldLines - 1));
        }
      }
    }
    this.lastOutput = output;
  }

  /**
   * Stop the {@link MultiBar} and all of its {@link SingleBar}s.
   */
  static stop(): void {
    let multiBar = this.multiBars.shift();
    while (multiBar !== undefined) {
      multiBar.stop();
      multiBar = this.multiBars.shift();
    }
  }

  /**
   * Stop the {@link MultiBar} and all of its {@link SingleBar}s.
   */
  private stop(): void {
    if (this.stopped) {
      return;
    }

    // One last render
    this.clearAndRender();
    this.renderTimer?.cancel();

    // Freeze (and delete) any lingering progress bars
    const singleBarsCopy = [...this.singleBars];
    singleBarsCopy.forEach((progressBar) => {
      progressBar.freeze();
    });

    // Remove the SIGWINCH listener
    if (this.sigwinchHandler !== undefined) {
      process.off('SIGWINCH', this.sigwinchHandler);
    }

    // Restore the cursor
    if (this.terminal instanceof tty.WriteStream) {
      this.terminal.write('\x1B[?25h');
    }

    this.stopped = true;
  }
}
