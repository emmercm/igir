import { PassThrough } from 'node:stream';

import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar } from 'cli-progress';
import wrapAnsi from 'wrap-ansi';

import ConsolePoly from '../polyfill/consolePoly.js';
import Logger from './logger.js';
import LogLevel from './logLevel.js';
import ProgressBar, { ProgressBarSymbol } from './progressBar.js';
import ProgressBarPayload from './progressBarPayload.js';
import SingleBarFormatted from './singleBarFormatted.js';

/**
 * A {@link ProgressBar} that is intended to print to a TTY CLI.
 */
export default class ProgressBarCLI extends ProgressBar {
  private static readonly RENDER_MUTEX = new Mutex();

  private static readonly FPS = 4;

  private static multiBar?: MultiBar;

  private static progressBars: ProgressBarCLI[] = [];

  private static lastRedraw: [number, number] = [0, 0];

  private static logQueue: string[] = [];

  private readonly logger: Logger;

  private readonly payload: ProgressBarPayload;

  private readonly singleBarFormatted?: SingleBarFormatted;

  private waitingMessageTimeout?: NodeJS.Timeout;

  private waitingMessages: string[] = [];

  private constructor(
    logger: Logger,
    payload: ProgressBarPayload,
    singleBarFormatted?: SingleBarFormatted,
  ) {
    super();
    this.logger = logger;
    this.payload = payload;
    this.singleBarFormatted = singleBarFormatted;
    if (singleBarFormatted) {
      ProgressBarCLI.progressBars = [...ProgressBarCLI.progressBars, this];
    }
  }

  /**
   * Create a new {@link ProgressBarCLI}, and initialize the {@link MultiBar} if it hasn't been yet.
   */
  static async new(
    logger: Logger,
    name: string,
    symbol: string,
    initialTotal = 0,
  ): Promise<ProgressBarCLI> {
    if (!ProgressBarCLI.multiBar) {
      ProgressBarCLI.multiBar = new cliProgress.MultiBar({
        stream: logger.getLogLevel() < LogLevel.NEVER ? logger.getStream() : new PassThrough(),
        barsize: 25,
        fps: 1 / 60, // limit the automatic redraws
        forceRedraw: true,
        emptyOnZero: true,
        hideCursor: true,
      }, cliProgress.Presets.shades_grey);
    }

    const initialPayload: ProgressBarPayload = {
      symbol,
      name,
      inProgress: 0,
    };

    if (!logger.isTTY()) {
      // Only create progress bars for TTY consoles
      return new ProgressBarCLI(logger, initialPayload);
    }

    const singleBarFormatted = new SingleBarFormatted(
      ProgressBarCLI.multiBar,
      initialTotal,
      initialPayload,
    );
    const progressBarCLI = new ProgressBarCLI(logger, initialPayload, singleBarFormatted);
    await progressBarCLI.render(true);
    return progressBarCLI;
  }

  /**
   * Stop the {@link MultiBar} (and therefore everyProgressBar).
   */
  static async stop(): Promise<void> {
    this.multiBar?.stop();
    this.multiBar = undefined;
    // Forcing a render shouldn't be necessary

    // Freeze (and delete) any lingering progress bars
    const progressBarsCopy = ProgressBarCLI.progressBars.slice();
    await Promise.all(progressBarsCopy.map(async (progressBar) => progressBar.freeze()));
  }

  /**
   * Applications that are too synchronous or have a high concurrency (e.g. with async.js, p-limit,
   * p-map, etc.) keep cli-progress from redrawing with its setTimeout(), so it might be necessary
   * to force it. This function needs to be safe to be called concurrently because of the way
   * cli-progress clears previous output.
   * @see https://github.com/npkgz/cli-progress/issues/79
   */
  async render(force = false): Promise<void> {
    this.singleBarFormatted?.getSingleBar().update(this.payload);

    if (!force) {
      // Limit the frequency of redrawing
      const [elapsedSec, elapsedNano] = process.hrtime(ProgressBarCLI.lastRedraw);
      const elapsedMs = (elapsedSec * 1_000_000_000 + elapsedNano) / 1_000_000;
      if (elapsedMs < (1000 / ProgressBarCLI.FPS)) {
        return;
      }
    }

    try {
      await ProgressBarCLI.RENDER_MUTEX.runExclusive(() => {
        // Dequeue all log messages
        if (ProgressBarCLI.multiBar && ProgressBarCLI.logQueue.length) {
          const consoleWidth = ConsolePoly.consoleWidth();
          const logMessage = ProgressBarCLI.logQueue
            // Wrapping is broken: https://github.com/npkgz/cli-progress/issues/142
            .map((msg, msgIdx) => wrapAnsi(msg, consoleWidth)
              // ...and if we manually wrap lines, we also need to deal with overwriting existing
              //  progress bar output.
              .split('\n')
              .map((line, lineIdx) => {
                if (msgIdx === 0 && lineIdx === 0) {
                  // The very first line shouldn't need padding, the progress bar renderer should
                  //  be calling `process.stdout.clearLine()`.
                  return line;
                }
                return line.padEnd(consoleWidth, ' ');
              })
              .join('\n'))
            .join('\n');
          ProgressBarCLI.multiBar.log(`${logMessage}\n`);
          ProgressBarCLI.logQueue = [];
        }

        ProgressBarCLI.multiBar?.update();
        ProgressBarCLI.lastRedraw = process.hrtime();
        ProgressBarCLI.RENDER_MUTEX.cancel(); // cancel all waiting locks, we just redrew
      });
    } catch (e) {
      if (e !== E_CANCELED) {
        throw e;
      }
    }
  }

  /**
   * Reset the {@link ProgressBar}'s progress to zero and change its total.
   */
  async reset(total: number): Promise<void> {
    this.singleBarFormatted?.getSingleBar().setTotal(total);
    this.singleBarFormatted?.getSingleBar().update(0);
    this.payload.inProgress = 0;
    return this.render(true);
  }

  private async logPayload(): Promise<void> {
    if (this.singleBarFormatted) {
      return;
    }
    this.log(
      LogLevel.ALWAYS,
      `${this.payload.name}${this.payload.finishedMessage ? ` ... ${this.payload.finishedMessage}` : ''}`.trim(),
    );
    await this.render(true);
  }

  async setName(name: string): Promise<void> {
    this.payload.name = name;
    return this.render(true);
  }

  async setSymbol(symbol: string): Promise<void> {
    this.payload.symbol = symbol;
    return this.render(true);
  }

  /**
   * If progress hasn't been made by some timeout period, then show a waiting message to let the
   * user know that there is still something processing.
   */
  addWaitingMessage(waitingMessage: string): void {
    this.waitingMessages.push(waitingMessage);
    this.setWaitingMessageTimeout();
  }

  /**
   * Remove a waiting message to let the user know some processing has finished.
   */
  removeWaitingMessage(waitingMessage: string): void {
    this.waitingMessages = this.waitingMessages.filter((msg) => msg !== waitingMessage);

    if (this.payload.waitingMessage) {
      // Render immediately if the output could change
      this.setWaitingMessageTimeout(0);
    }
  }

  private setWaitingMessageTimeout(timeout = 10_000): void {
    clearTimeout(this.waitingMessageTimeout);

    this.waitingMessageTimeout = setTimeout(async () => {
      const total = this.singleBarFormatted?.getSingleBar().getTotal() ?? 0;
      if (total <= 1) {
        return;
      }

      [this.payload.waitingMessage] = this.waitingMessages;
      await this.render(true);
    }, timeout);
  }

  /**
   * Increment the total by some amount.
   */
  async incrementTotal(increment: number): Promise<void> {
    if (!this.singleBarFormatted) {
      return;
    }

    this.singleBarFormatted.getSingleBar().setTotal(
      this.singleBarFormatted.getSingleBar().getTotal() + increment,
    );
    await this.render();
  }

  /**
   * Increment the in-progress count by one.
   */
  async incrementProgress(): Promise<void> {
    this.payload.inProgress = Math.max(this.payload.inProgress ?? 0, 0) + 1;
    return this.render();
  }

  /**
   * Decrement the in-progress count by one, and increment the completed count by one.
   */
  async incrementDone(): Promise<void> {
    this.payload.inProgress = Math.max((this.payload.inProgress ?? 0) - 1, 0);
    this.singleBarFormatted?.getSingleBar().increment();
    return this.render();
  }

  /**
   * Set the completed count.
   */
  async update(current: number): Promise<void> {
    this.singleBarFormatted?.getSingleBar().update(current);
    return this.render();
  }

  /**
   * Set the completed count to the total, and render any completion message.
   */
  async done(finishedMessage?: string): Promise<void> {
    await this.setSymbol(ProgressBarSymbol.DONE);

    const total = this.singleBarFormatted?.getSingleBar().getTotal() ?? 0;
    if (total > 0) {
      this.singleBarFormatted?.getSingleBar().update(total);
    } else {
      this.singleBarFormatted?.getSingleBar().update(total + 1);
    }

    if (finishedMessage) {
      this.payload.finishedMessage = finishedMessage;
    }

    await this.render(true);
  }

  /**
   * Return a copy of this {@link ProgressBar} with a new string prefix.
   */
  withLoggerPrefix(prefix: string): ProgressBar {
    return new ProgressBarCLI(
      this.logger.withLoggerPrefix(prefix),
      this.payload,
      this.singleBarFormatted,
    );
  }

  /**
   * Log a message at some specified {@link LogLevel}.
   */
  log(logLevel: LogLevel, message: string): void {
    ProgressBarCLI.log(this.logger, logLevel, message);
  }

  /**
   * Log a message at some specified {@link LogLevel}.
   */
  static log(logger: Logger, logLevel: LogLevel, message: string): void {
    if (logger.getLogLevel() > logLevel) {
      return;
    }

    const formattedMessage = logger.formatMessage(logLevel, message);
    ProgressBarCLI.logQueue.push(formattedMessage);
  }

  /**
   * When the number of progress bars exceeds the height of the console, cli-progress fails to be
   * able to clear them all reliably. It's recommended you don't have too many active progress bars
   * at once.
   * @see https://github.com/npkgz/cli-progress/issues/59
   */
  async freeze(): Promise<void> {
    if (!this.singleBarFormatted) {
      await this.logPayload();
      return;
    }

    await this.render(true);
    ProgressBarCLI.multiBar?.log(`${this.singleBarFormatted?.getLastOutput()}\n`);
    this.delete();
  }

  /**
   * Delete this {@link ProgressBarCLI} from the CLI.
   */
  delete(): void {
    if (!this.singleBarFormatted) {
      return;
    }

    ProgressBarCLI.multiBar?.remove(this.singleBarFormatted.getSingleBar());
    // NOTE(cemmer): forcing a render shouldn't be necessary, BUT if nothing is rendered after
    // deletion, then this deleted progress bar won't be overwritten!

    ProgressBarCLI.progressBars = ProgressBarCLI.progressBars
      .filter((singleBar) => singleBar.singleBarFormatted !== this.singleBarFormatted);
  }
}
