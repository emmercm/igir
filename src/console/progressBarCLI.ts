import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar } from 'cli-progress';
import { PassThrough } from 'stream';

import Logger from './logger.js';
import LogLevel from './logLevel.js';
import ProgressBar, { ProgressBarSymbol } from './progressBar.js';
import ProgressBarPayload from './progressBarPayload.js';
import SingleBarFormatted from './singleBarFormatted.js';

export default class ProgressBarCLI extends ProgressBar {
  private static readonly RENDER_MUTEX = new Mutex();

  private static fps = 4;

  private static multiBar?: MultiBar;

  private static lastRedraw: [number, number] = [0, 0];

  private readonly logger: Logger;

  private readonly singleBarFormatted: SingleBarFormatted;

  private waitingMessageTimeout?: NodeJS.Timeout;

  private waitingMessages: string[] = [];

  private constructor(logger: Logger, singleBarFormatted: SingleBarFormatted) {
    super();
    this.logger = logger;
    this.singleBarFormatted = singleBarFormatted;
  }

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
        noTTYOutput: true, /** should output for {@link PassThrough} */
      }, cliProgress.Presets.shades_grey);
    }

    const singleBarFormatted = new SingleBarFormatted(
      ProgressBarCLI.multiBar,
      name,
      symbol,
      initialTotal,
    );
    await this.render(true);

    return new ProgressBarCLI(logger, singleBarFormatted);
  }

  static stop(): void {
    this.multiBar?.stop();
    this.multiBar = undefined;
    // Forcing a render shouldn't be necessary
  }

  /**
   * Applications that are too synchronous or have a high concurrency (e.g. with async.js, p-limit,
   * p-map, etc.) keep cli-progress from redrawing with its setTimeout(), so it might be necessary
   * to force it. This function needs to be safe to be called concurrently because of the way
   * cli-progress clears previous output.
   *
   * @see https://github.com/npkgz/cli-progress/issues/79
   */
  private static async render(force = false): Promise<void> {
    if (!force) {
      // Limit the frequency of redrawing
      const [elapsedSec, elapsedNano] = process.hrtime(this.lastRedraw);
      const elapsedMs = (elapsedSec * 1000000000 + elapsedNano) / 1000000;
      if (elapsedMs < (1000 / ProgressBarCLI.fps)) {
        return;
      }
    }

    try {
      await this.RENDER_MUTEX.runExclusive(() => {
        this.multiBar?.update();
        this.lastRedraw = process.hrtime();
        this.RENDER_MUTEX.cancel(); // cancel all waiting locks, we just redrew
      });
    } catch (e) {
      if (e !== E_CANCELED) {
        throw e;
      }
    }
  }

  static setFPS(fps: number): void {
    this.fps = fps;
  }

  async reset(total: number): Promise<void> {
    this.singleBarFormatted.getSingleBar().setTotal(total);
    this.singleBarFormatted.getSingleBar().update(0);
    return ProgressBarCLI.render(true);
  }

  async setSymbol(symbol: string): Promise<void> {
    this.singleBarFormatted.getSingleBar().update({
      symbol,
    } satisfies ProgressBarPayload);
    return ProgressBarCLI.render();
  }

  /**
   * If progress hasn't been made by some timeout period, then show a waiting message to let the
   *  user know that there is still something processing.
   */
  addWaitingMessage(waitingMessage: string): void {
    this.waitingMessages.push(waitingMessage);
    this.setWaitingMessageTimeout();
  }

  removeWaitingMessage(waitingMessage: string): void {
    this.waitingMessages = this.waitingMessages.filter((msg) => msg !== waitingMessage);
    this.setWaitingMessageTimeout();
  }

  private setWaitingMessageTimeout(timeout = 10_000): void {
    clearTimeout(this.waitingMessageTimeout);
    this.waitingMessageTimeout = setTimeout(async () => {
      if (this.singleBarFormatted.getSingleBar().getTotal() <= 1) {
        return;
      }

      this.singleBarFormatted.getSingleBar().update({
        waitingMessage: this.waitingMessages[0],
      } satisfies ProgressBarPayload);
      await ProgressBarCLI.render(true);
    }, timeout);
  }

  async increment(): Promise<void> {
    this.singleBarFormatted.getSingleBar().increment();
    return ProgressBarCLI.render();
  }

  async update(current: number): Promise<void> {
    this.singleBarFormatted.getSingleBar().update(current);
    return ProgressBarCLI.render();
  }

  async done(finishedMessage?: string): Promise<void> {
    await this.setSymbol(ProgressBarSymbol.DONE);

    if (this.singleBarFormatted.getSingleBar().getTotal() > 0) {
      this.singleBarFormatted.getSingleBar()
        .update(this.singleBarFormatted.getSingleBar().getTotal());
    } else {
      this.singleBarFormatted.getSingleBar()
        .update(this.singleBarFormatted.getSingleBar().getTotal() + 1);
    }

    if (finishedMessage) {
      this.singleBarFormatted.getSingleBar().update({
        finishedMessage,
      } satisfies ProgressBarPayload);
    }

    return ProgressBarCLI.render(true);
  }

  withLoggerPrefix(prefix: string): ProgressBar {
    return new ProgressBarCLI(this.logger.withLoggerPrefix(prefix), this.singleBarFormatted);
  }

  async log(logLevel: LogLevel, message: string): Promise<void> {
    if (this.logger.getLogLevel() > logLevel) {
      return;
    }

    ProgressBarCLI.multiBar?.log(`${this.logger.formatMessage(logLevel, message)}\n`);
    await ProgressBarCLI.render();
  }

  /**
   * When the number of progress bars exceeds the height of the console, cli-progress fails to be
   * able to clear them all reliably. It's recommended you don't have too many active progress bars
   * at once.
   *
   * @see https://github.com/npkgz/cli-progress/issues/59
   */
  async freeze(): Promise<void> {
    await ProgressBarCLI.render(true);
    ProgressBarCLI.multiBar?.log(`${this.singleBarFormatted.getLastOutput()}\n`);
    this.delete();
  }

  delete(): void {
    ProgressBarCLI.multiBar?.remove(this.singleBarFormatted.getSingleBar());
    // Forcing a render shouldn't be necessary
  }
}
