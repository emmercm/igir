import tty from 'node:tty';

import stripAnsi from 'strip-ansi';

import Timer from '../timer.js';
import Logger from './logger.js';
import SingleBar, { SingleBarOptions } from './singleBar.js';

export interface MultiBarOptions {
  writable: tty.WriteStream | NodeJS.WritableStream;
}

/**
 * A wrapper for multiple {@link SingleBar}s. Should be treated as a singleton.
 */
export default class MultiBar {
  private static readonly RENDER_MIN_FPS = 5;
  private static readonly OUTPUT_PADDING = ' ';

  private static readonly multiBars: MultiBar[] = [];
  private static readonly logQueue: string[] = [];
  private static lastPrintedLog?: string;

  private readonly singleBars: SingleBar[] = [];
  private renderTimer?: Timer;
  private lastOutput = '';
  private stopped = false;

  private readonly terminal: tty.WriteStream | NodeJS.WritableStream;
  private terminalColumns = 65_536;
  private terminalRows = 65_536;

  private constructor(options?: MultiBarOptions) {
    this.terminal = options?.writable ?? process.stdout;

    // Disable the cursor
    if (this.terminal instanceof tty.WriteStream) {
      this.terminal.write('\x1B[?25l');
    }

    process.once('exit', () => {
      this.stop();
    });
    process.once('SIGINT', () => {
      this.stop();
    });
    process.once('SIGTERM', () => {
      this.stop();
    });

    // Set a maximum size for the MultiBar based on terminal size
    if (this.terminal instanceof tty.WriteStream) {
      const onResize = (): void => {
        if (!(this.terminal instanceof tty.WriteStream)) {
          return;
        }
        this.terminalColumns = this.terminal.columns;
        this.terminalRows = this.terminal.rows;
        this.clearAndRender();
      };
      process.on('SIGWINCH', onResize);
      onResize();
    }
  }

  /**
   * Create a new {@link MultiBar} instance.
   */
  static create(options?: MultiBarOptions): MultiBar {
    const multiBar = new MultiBar(options);
    this.multiBars.push(multiBar);
    return multiBar;
  }

  /**
   * Add a new {@link SingleBar} to the {@link MultiBar}.
   */
  addSingleBar(logger: Logger, options?: SingleBarOptions, parentSingleBar?: SingleBar): SingleBar {
    const singleBar = new SingleBar(this, logger, options);

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
  static log(message: string): void {
    const lastPrintedLog =
      MultiBar.logQueue.length > 0 ? MultiBar.logQueue.at(-1) : MultiBar.lastPrintedLog;

    const isFrozenPattern = new RegExp(`^\n*${MultiBar.OUTPUT_PADDING}`);
    const lastPrintedLogIsFrozen =
      lastPrintedLog !== undefined && isFrozenPattern.test(lastPrintedLog);
    const thisMessageIsFrozen = isFrozenPattern.test(message);

    if (lastPrintedLogIsFrozen) {
      if (thisMessageIsFrozen) {
        // Print frozen progress bars next to each other
        message = message.replace(/^\n+/, '');
      } else {
        // Otherwise, add a newline after the previous frozen progress bar
        MultiBar.logQueue.push('\n');
      }
    }

    MultiBar.logQueue.push(`${message}\n`);
  }

  /**
   * Queue a log message to be printed to the terminal.
   */
  log(message: string): void {
    MultiBar.log(message);
  }

  /**
   * Clear the last output and render the progress bars.
   */
  private clearAndRender(): void {
    if (this.stopped) {
      return;
    }

    if (!(this.terminal instanceof tty.WriteStream)) {
      return;
    }

    this.renderTimer?.cancel();

    // Clear the terminal
    // TODO(cemmer): some kind of line diffing algorithm so not every line has to be repainted
    let rows = 0;
    for (const char of this.lastOutput) {
      if (char === '\n') {
        rows += 1;
      }
    }
    if (rows > 0) {
      this.terminal.moveCursor(0, -rows);
      this.terminal.cursorTo(0, undefined);
      this.terminal.clearScreenDown();
    }

    // Write out all queued logs
    let log = MultiBar.logQueue.shift();
    while (log !== undefined) {
      MultiBar.lastPrintedLog = log;
      this.terminal.write(log);
      log = MultiBar.logQueue.shift();
    }

    // Write the progress bars
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
    const output = `${outputLines.join('\n')}\n`;
    this.terminal.write(output);
    this.lastOutput = output;

    this.renderTimer = Timer.setTimeout(
      () => {
        this.clearAndRender();
      },
      Math.max(1000 / MultiBar.RENDER_MIN_FPS),
    );
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

    // Freeze (and delete) any lingering progress bars
    const singleBarsCopy = [...this.singleBars];
    singleBarsCopy.forEach((progressBar) => {
      progressBar.freeze();
    });

    // Restore the cursor
    if (this.terminal instanceof tty.WriteStream) {
      this.terminal.write('\x1B[?25h');
    }

    this.stopped = true;
  }
}
