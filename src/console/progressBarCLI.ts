import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar } from 'cli-progress';
import { PassThrough } from 'stream';
import wrapAnsi from 'wrap-ansi';

import ConsolePoly from '../polyfill/consolePoly.js';
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
      }, cliProgress.Presets.shades_grey);
    }

    const initialPayload: ProgressBarPayload = {
      symbol,
      name,
      inProgress: 0,
    };

    if (!logger.isTTY()) {
      // Only create progress bars for TTY consoles
      return new ProgressBarCLI(logger, initialPayload).logPayload();
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
  private async render(force = false): Promise<void> {
    this.singleBarFormatted?.getSingleBar().update(this.payload);

    if (!force) {
      // Limit the frequency of redrawing
      const [elapsedSec, elapsedNano] = process.hrtime(ProgressBarCLI.lastRedraw);
      const elapsedMs = (elapsedSec * 1000000000 + elapsedNano) / 1000000;
      if (elapsedMs < (1000 / ProgressBarCLI.fps)) {
        return;
      }
    }

    try {
      await ProgressBarCLI.RENDER_MUTEX.runExclusive(() => {
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

  static setFPS(fps: number): void {
    this.fps = fps;
  }

  async reset(total: number): Promise<void> {
    this.singleBarFormatted?.getSingleBar().setTotal(total);
    this.singleBarFormatted?.getSingleBar().update(0);
    return this.render(true);
  }

  private async logPayload(): Promise<ProgressBarCLI> {
    if (this.singleBarFormatted) {
      return this;
    }
    await this.log(
      LogLevel.ALWAYS,
      `${this.payload.name} ... ${this.payload.finishedMessage || ''}`.trim(),
      true,
    );
    return this;
  }

  async setSymbol(symbol: string): Promise<void> {
    this.payload.symbol = symbol;
    await this.render(true);
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

    if (this.payload.waitingMessage) {
      // Render immediately if the output could change
      this.setWaitingMessageTimeout(0);
    }
  }

  private setWaitingMessageTimeout(timeout = 10_000): void {
    clearTimeout(this.waitingMessageTimeout);

    this.waitingMessageTimeout = setTimeout(async () => {
      const total = this.singleBarFormatted?.getSingleBar().getTotal() || 0;
      if (total <= 1) {
        return;
      }

      // eslint-disable-next-line prefer-destructuring
      this.payload.waitingMessage = this.waitingMessages[0];
      await this.render(true);
    }, timeout);
  }

  async incrementProgress(): Promise<void> {
    this.payload.inProgress = (this.payload.inProgress || 0) + 1;
    await this.render();
  }

  async incrementDone(): Promise<void> {
    this.payload.inProgress = Math.max((this.payload.inProgress || 0) - 1, 0);
    this.singleBarFormatted?.getSingleBar().increment();
    return this.render();
  }

  async update(current: number): Promise<void> {
    this.singleBarFormatted?.getSingleBar().update(current);
    return this.render();
  }

  async done(finishedMessage?: string): Promise<void> {
    await this.setSymbol(ProgressBarSymbol.DONE);

    const total = this.singleBarFormatted?.getSingleBar().getTotal() || 0;
    if (total > 0) {
      this.singleBarFormatted?.getSingleBar().update(total);
    } else {
      this.singleBarFormatted?.getSingleBar().update(total + 1);
    }

    if (finishedMessage) {
      this.payload.finishedMessage = finishedMessage;
    }

    await this.render(true);
    await this.logPayload();
  }

  withLoggerPrefix(prefix: string): ProgressBar {
    return new ProgressBarCLI(
      this.logger.withLoggerPrefix(prefix),
      this.payload,
      this.singleBarFormatted,
    );
  }

  async log(logLevel: LogLevel, message: string, forceRender = false): Promise<void> {
    if (this.logger.getLogLevel() > logLevel) {
      return;
    }

    const formattedMessage = this.logger.formatMessage(logLevel, message);

    // https://github.com/npkgz/cli-progress/issues/142
    const messageWrapped = wrapAnsi(formattedMessage, ConsolePoly.consoleWidth());

    ProgressBarCLI.multiBar?.log(`${messageWrapped}\n`);
    await this.render(forceRender);
  }

  /**
   * When the number of progress bars exceeds the height of the console, cli-progress fails to be
   * able to clear them all reliably. It's recommended you don't have too many active progress bars
   * at once.
   *
   * @see https://github.com/npkgz/cli-progress/issues/59
   */
  async freeze(): Promise<void> {
    if (!this.singleBarFormatted) {
      return;
    }

    await this.render(true);
    ProgressBarCLI.multiBar?.log(`${this.singleBarFormatted?.getLastOutput()}\n`);
    this.delete();
  }

  delete(): void {
    if (!this.singleBarFormatted) {
      return;
    }

    ProgressBarCLI.multiBar?.remove(this.singleBarFormatted.getSingleBar());
    // Forcing a render shouldn't be necessary
  }
}
