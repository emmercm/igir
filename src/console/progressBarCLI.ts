import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar, SingleBar } from 'cli-progress';
import { PassThrough } from 'stream';

import Logger, { LogLevel } from './logger.js';
import ProgressBar from './progressBar.js';
import SingleBarFormatted, { ProgressBarPayload } from './singleBarFormatted.js';

export default class ProgressBarCLI extends ProgressBar {
  private static readonly RENDER_MUTEX = new Mutex();

  private static fps = 4;

  private static multiBar?: MultiBar;

  private static lastRedraw: [number, number] = [0, 0];

  private readonly logger: Logger;

  private readonly singleBar: SingleBar;

  constructor(logger: Logger, name: string, symbol: string, initialTotal = 0) {
    super();

    this.logger = logger;

    if (!ProgressBarCLI.multiBar) {
      ProgressBarCLI.multiBar = new cliProgress.MultiBar({
        stream: logger.getLogLevel() < LogLevel.OFF ? logger.getStream() : new PassThrough(),
        barsize: 25,
        fps: ProgressBarCLI.fps,
        emptyOnZero: true,
        hideCursor: true,
        noTTYOutput: true, /** should output for {@link PassThrough} */
      }, cliProgress.Presets.shades_grey);
    }

    this.singleBar = new SingleBarFormatted(ProgressBarCLI.multiBar)
      .build(name, symbol, initialTotal);
  }

  static stop() {
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
  private static async render(): Promise<void> {
    try {
      await this.RENDER_MUTEX.runExclusive(() => {
        const elapsed = process.hrtime(this.lastRedraw);
        const elapsedMs = (elapsed[0] * 1000000000 + elapsed[1]) / 1000000;
        if (elapsedMs >= (1000 / ProgressBarCLI.fps)) {
          this.multiBar?.update();
          this.lastRedraw = process.hrtime();
          this.RENDER_MUTEX.cancel(); // cancel all waiting locks, we just redrew
        }
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
    this.singleBar.setTotal(total);
    this.singleBar.update(0);
    return ProgressBarCLI.render();
  }

  async setSymbol(symbol: string): Promise<void> {
    this.singleBar.update({
      symbol,
    } as ProgressBarPayload);
    return ProgressBarCLI.render();
  }

  async increment(): Promise<void> {
    this.singleBar.increment();
    return ProgressBarCLI.render();
  }

  async update(current: number): Promise<void> {
    this.singleBar.update(current);
    return ProgressBarCLI.render();
  }

  async done(finishedMessage?: string): Promise<void> {
    await this.setSymbol('✅');

    if (this.singleBar.getTotal() > 0) {
      this.singleBar.update(this.singleBar.getTotal());
    } else {
      this.singleBar.update(this.singleBar.getTotal() + 1);
    }

    if (finishedMessage) {
      this.singleBar.update({
        finishedMessage,
      } as ProgressBarPayload);
    }

    return ProgressBarCLI.render();
  }

  async log(logLevel: LogLevel, message: string): Promise<void> {
    const formatters: { [key: number]: (message: string) => string } = {
      [LogLevel.DEBUG]: Logger.debugFormatter,
      [LogLevel.INFO]: Logger.infoFormatter,
      [LogLevel.WARN]: Logger.warnFormatter,
      [LogLevel.ERROR]: Logger.errorFormatter,
    };
    if (this.logger.getLogLevel() <= logLevel) {
      ProgressBarCLI.multiBar?.log(`${formatters[logLevel.valueOf()](message)}\n`);
      await ProgressBarCLI.render();
    }
  }

  /**
   * When the number of progress bars exceeds the height of the console, cli-progress fails to be
   * able to clear them all reliably. It's recommended you don't have too many active progress bars
   * at once.
   */
  delete(): void {
    ProgressBarCLI.multiBar?.remove(this.singleBar);
    // Forcing a render shouldn't be necessary
  }
}
