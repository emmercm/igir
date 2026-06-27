import Timer from '../async/timer.js';
import { logger } from './logger.js';
import type { SingleBarOptions } from './singleBar.js';
import SingleBar from './singleBar.js';
import { LIVE_REGION_PADDING, terminal } from './terminal.js';

const exitHandler = (): void => {
  MultiBar.stop();
};
process.once('exit', exitHandler);
process.once('SIGINT', exitHandler);
process.once('SIGTERM', exitHandler);

/**
 * A wrapper for multiple {@link SingleBar}s. Should be treated as a singleton.
 *
 * {@link MultiBar} produces the live-region frame (the combined text of all of its bars) and hands
 * it to the {@link Terminal}, which owns the output stream and draws it. {@link MultiBar} never
 * writes to the terminal itself.
 */
export default class MultiBar {
  private static readonly RENDER_MIN_FPS = 5;

  private static readonly multiBars: MultiBar[] = [];

  private readonly singleBars: SingleBar[] = [];
  private renderTimer?: Timer;
  private stopped = false;

  private constructor() {
    // Instances are created via the static `create()` factory
  }

  /**
   * Create a new {@link MultiBar} instance.
   */
  static create(): MultiBar {
    const multiBar = new MultiBar();
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

    // Force a render so a new top-level bar appears immediately. This also starts the periodic
    // render loop; child bars are added under an already-rendered top-level bar and are picked up
    // by the next render tick.
    if (singleBar.getIndentSize() === 0) {
      this.clearAndRender();
    }

    return singleBar;
  }

  /**
   * Log the {@link SingleBar}'s last output and remove it from the live region.
   */
  freezeSingleBar(singleBar: SingleBar): void {
    const idx = this.singleBars.indexOf(singleBar);
    if (idx === -1) {
      return;
    }

    // Refresh just this bar's last output to capture its final state (e.g. a finish message)
    singleBar.format();
    const lastOutput = singleBar.getLastOutput();

    // Remove the bar so the live region no longer includes it
    this.singleBars.splice(idx, 1);

    // Emit the snapshot as a permanent line above the live region
    if (lastOutput !== undefined) {
      logger.printFrozenBar(
        `${singleBar.getIndentSize() === 0 ? '\n' : ''}${LIVE_REGION_PADDING}${lastOutput}`,
      );
    }

    // Redraw the live region without this bar. The Terminal dedupes an unchanged frame, so this is
    // a cheap no-op if the bar was never displayed.
    this.clearAndRender();
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
   * Recompute the combined live-region frame and hand it to the {@link Terminal} to draw.
   */
  clearAndRender(): void {
    if (this.stopped) {
      return;
    }

    this.renderTimer?.cancel();
    if (terminal.isInteractive()) {
      // Only keep re-rendering to advance ETAs/animation when there's a live region to draw.
      // On a non-TTY nothing is drawn, so running the (expensive) format() pipeline on a loop is
      // pure waste; explicit calls (setSymbol/setName/freeze) still render on demand.
      this.renderTimer = Timer.setTimeout(
        () => {
          this.clearAndRender();
        },
        Math.max(1000 / MultiBar.RENDER_MIN_FPS, 1),
      );
    }

    const rawOutput = this.singleBars
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
      .join('\n');

    // `format()` must run every render (above) to keep each bar's last output and display state
    // fresh. The Terminal dedupes unchanged frames, so we always hand off the latest one.
    terminal.setLiveRegion(rawOutput);
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
    for (const progressBar of singleBarsCopy) {
      progressBar.freeze();
    }

    this.renderTimer?.cancel();
    terminal.clearLiveRegion();
    this.stopped = true;
  }
}
