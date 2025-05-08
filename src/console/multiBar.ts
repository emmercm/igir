import tty from 'node:tty';

import isUnicodeSupported from 'is-unicode-supported';
import stripAnsi from 'strip-ansi';

import Timer from '../timer.js';
import Logger from './logger.js';
import SingleBar, { SingleBarOptions } from './singleBar.js';

export interface MultiBarOptions {
  writable: tty.WriteStream | NodeJS.WritableStream;
}

const PROGRESS_BAR_FRAMES = isUnicodeSupported()
  ? ['-', '\\', '|', '/']
  : ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * TODO(cemmer)
 */
export default class MultiBar {
  private static readonly MIN_NAME_LENGTH = 20;
  private static readonly RENDER_MIN_FPS = 4;

  private static readonly multiBars: MultiBar[] = [];
  private static readonly logQueue: string[] = [];

  private readonly singleBars: SingleBar[] = [];
  private progressBarFrame = 0;
  private renderTimer?: Timer;
  private lastOutput = '';
  private stopped = false;

  private readonly terminal: tty.WriteStream | NodeJS.WritableStream;
  private terminalColumns = 65_536;
  private terminalRows = 65_536;

  /**
   * - Ability to have multiple sub bars, including:
   *  - The ability to insert them at an index
   *  - (the multi bar should probably be the renderer, sub-bars should be formatters)
   * - Detect terminal resizing, especially:
   *  - Getting smaller width and needing to chop
   *  - Getting taller height and allowing new previously hidden progress bars
   * Questions:
   * - How does cli-progress do logging?
   */

  private constructor(options?: MultiBarOptions) {
    this.terminal = options?.writable ?? process.stdout;

    // Disable the cursor
    if (this.terminal instanceof tty.WriteStream) {
      this.terminal.write('\x1B[?25l');
    }

    // Set a maximum size for the MultiBar based on terminal size
    if (this.terminal instanceof tty.WriteStream) {
      const onResize = (): void => {
        if (!(this.terminal instanceof tty.WriteStream)) {
          return;
        }
        this.terminalColumns = this.terminal.columns;
        this.terminalRows = this.terminal.rows;
      };
      process.on('SIGWINCH', onResize);
      onResize();
    }

    // TODO(cemmer): detect terminal resizes

    // TODO(cemmer): on exit cleanup such as restore cursor
    process.once('exit', () => {
      this.stop();
    });
    process.once('SIGINT', () => {
      this.stop();
    });
    process.once('SIGTERM', () => {
      this.stop();
    });
  }

  /**
   * TODO(cemmer)
   */
  static create(options?: MultiBarOptions): MultiBar {
    const multiBar = new MultiBar(options);
    this.multiBars.push(multiBar);
    return multiBar;
  }

  /**
   * TODO(cemmer)
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

    this.clear();
    if (insertionIndex === undefined) {
      this.singleBars.push(singleBar);
    } else {
      this.singleBars.splice(insertionIndex, 0, singleBar);
    }
    this.render();

    return singleBar;
  }

  /**
   * TODO(cemmer)
   */
  freezeSingleBar(singleBar: SingleBar): void {
    const idx = this.singleBars.indexOf(singleBar);
    if (idx === -1) {
      return;
    }

    // Move the SingleBar to the top of the list and render
    this.singleBars.splice(idx, 1);
    this.singleBars.splice(0, 0, singleBar);
    this.clearAndRender();

    // Finally remove the single bar
    this.singleBars.splice(0, 1);
  }

  /**
   * TODO(cemmer)
   */
  removeSingleBar(singleBar: SingleBar): void {
    const idx = this.singleBars.indexOf(singleBar);
    if (idx === -1) {
      return;
    }

    this.clear();
    this.singleBars.splice(idx, 1);
    this.render();
  }

  getProgressBarSpinner(): string {
    return PROGRESS_BAR_FRAMES[this.progressBarFrame];
  }

  /**
   * TODO(cemmer)
   */
  static log(message: string): void {
    this.logQueue.push(`${message}\n`);
  }

  /**
   * TODO(cemmer)
   */
  log(message: string): void {
    MultiBar.logQueue.push(`${message}\n`);
  }

  /**
   * TODO(cemmer)
   */
  clearAndRender(): void {
    if (this.stopped) {
      return;
    }

    this.clear();
    this.render();
  }

  private clear(): void {
    if (!(this.terminal instanceof tty.WriteStream)) {
      return;
    }

    let rows = 0;
    for (const char of this.lastOutput) {
      if (char === '\n') {
        rows += 1;
      }
    }
    if (rows === 0) {
      return;
    }

    this.terminal.moveCursor(0, -rows);
    this.terminal.cursorTo(0, undefined);
    this.terminal.clearScreenDown();
  }

  /**
   * TODO(cemmer)
   */
  private render(): void {
    this.renderTimer?.cancel();

    // Write out all queued logs
    let log = MultiBar.logQueue.shift();
    while (log !== undefined) {
      this.terminal.write(log);
      log = MultiBar.logQueue.shift();
    }

    let maxNameLength = MultiBar.MIN_NAME_LENGTH;
    for (const singleBar of this.singleBars) {
      maxNameLength = Math.max(
        maxNameLength,
        singleBar.getIndentSize() + stripAnsi(singleBar.getName() ?? '').length,
      );
    }

    const output = `${this.singleBars
      .flatMap((singleBar) =>
        singleBar
          .format({
            maxLength: this.terminalColumns - 5,
            maxNameLength,
          })
          .split('\n'),
      )
      .slice(0, this.terminalRows - 1)
      .join('\n')}\n`;
    this.terminal.write(output);
    this.lastOutput = output;

    // TODO(cemmer)
    // if (this.terminalRows - 1 < this.singleBars.length) {
    //   this.terminal.write('(MORE)');
    // }

    this.progressBarFrame += 1;
    if (this.progressBarFrame >= PROGRESS_BAR_FRAMES.length) {
      this.progressBarFrame = 0;
    }

    this.renderTimer = Timer.setTimeout(
      () => {
        this.clearAndRender();
      },
      Math.max(1000 / MultiBar.RENDER_MIN_FPS),
    );
  }

  /**
   * TODO(cemmer)
   */
  static stop(): void {
    let multiBar = this.multiBars.shift();
    while (multiBar !== undefined) {
      multiBar.stop();
      multiBar = this.multiBars.shift();
    }
  }

  /**
   * TODO(cemmer)
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

    // TODO(cemmer): Clear the last deleted, non-frozen progress bar?
    // ProgressBarCLI.multiBar?.log(' ');
    // this.multiBar?.update();

    // Restore the cursor
    if (this.terminal instanceof tty.WriteStream) {
      this.terminal.write('\x1B[?25h');
    }

    this.stopped = true;
  }
}
