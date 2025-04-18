import { PassThrough } from 'node:stream';

import { E_CANCELED, Mutex } from 'async-mutex';
import cliProgress, { MultiBar } from 'cli-progress';
import wrapAnsi from 'wrap-ansi';

import ConsolePoly from '../polyfill/consolePoly.js';
import TimePoly from '../polyfill/timePoly.js';
import Timer from '../timer.js';
import Logger from './logger.js';
import { LogLevel, LogLevelValue } from './logLevel.js';
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

  private static lastRedraw = 0;

  private static logQueue: string[] = [];

  private logger: Logger;

  private readonly payload: ProgressBarPayload;

  private readonly singleBarFormatted?: SingleBarFormatted;

  private waitingMessageTimeout?: Timer;

  private readonly waitingMessages = new Map<string, number>();

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
      ProgressBarCLI.progressBars.push(this);
    }
  }

  /**
   * Create a new {@link ProgressBarCLI}, and initialize the {@link MultiBar} if it hasn't been yet.
   */
  static new(logger: Logger, name: string, symbol: string, initialTotal = 0): ProgressBarCLI {
    if (!ProgressBarCLI.multiBar) {
      ProgressBarCLI.multiBar = new cliProgress.MultiBar(
        {
          stream: logger.getLogLevel() < LogLevel.NEVER ? logger.getStream() : new PassThrough(),
          barsize: 20,
          fps: 1 / 60, // limit the automatic redraws
          forceRedraw: true,
          emptyOnZero: true,
          hideCursor: true,
        },
        cliProgress.Presets.shades_grey,
      );
      process.on('exit', () => {
        this.multiBar?.stop();
      });
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
    progressBarCLI.render(true);
    return progressBarCLI;
  }

  /**
   * Stop the {@link MultiBar} (and therefore everyProgressBar).
   */
  static stop(): void {
    // Freeze (and delete) any lingering progress bars
    const progressBarsCopy = [...ProgressBarCLI.progressBars];
    progressBarsCopy.forEach((progressBar) => {
      progressBar.freeze();
    });

    // Clear the last deleted, non-frozen progress bar
    ProgressBarCLI.multiBar?.log(' ');
    this.multiBar?.update();

    this.multiBar?.stop();
    this.multiBar = undefined;
    // Forcing a render shouldn't be necessary
  }

  /**
   * Applications that are too synchronous or have a high concurrency (e.g. with async.js, p-limit,
   * p-map, etc.) keep cli-progress from redrawing with its setTimeout(), so it might be necessary
   * to force it. This function needs to be safe to be called concurrently because of the way
   * cli-progress clears previous output.
   * @see https://github.com/npkgz/cli-progress/issues/79
   */
  render(force = false): void {
    this.singleBarFormatted?.getSingleBar().update(this.payload);

    const callback = (): void => {
      // Dequeue all log messages
      if (ProgressBarCLI.multiBar && ProgressBarCLI.logQueue.length > 0) {
        const consoleWidth = ConsolePoly.consoleWidth();
        const logMessage = ProgressBarCLI.logQueue
          // Wrapping is broken: https://github.com/npkgz/cli-progress/issues/142
          .map((msg) =>
            wrapAnsi(msg, consoleWidth, { trim: false })
              // ...and if we manually wrap lines, we also need to deal with overwriting existing
              //  progress bar output.
              .split('\n')
              // TODO(cemmer): this appears to only overwrite the last line, not any others?
              .join(`\n${this.logger.isTTY() ? '\x1B[K' : ''}`),
          )
          .join('\n');
        ProgressBarCLI.multiBar.log(`${logMessage}\n`);
        ProgressBarCLI.logQueue = [];
      }

      ProgressBarCLI.multiBar?.update();
      ProgressBarCLI.lastRedraw = TimePoly.hrtimeMillis();
      ProgressBarCLI.RENDER_MUTEX.cancel(); // cancel all waiting locks, we just redrew
    };

    if (force) {
      callback();
      return;
    }

    // Limit the frequency of redrawing
    const elapsedMs = TimePoly.hrtimeMillis(ProgressBarCLI.lastRedraw);
    if (elapsedMs < 1000 / ProgressBarCLI.FPS) {
      return;
    }

    setImmediate(async () => {
      try {
        await ProgressBarCLI.RENDER_MUTEX.runExclusive(callback);
      } catch (error) {
        if (error !== E_CANCELED) {
          throw error;
        }
      }
    });
  }

  /**
   * Reset the {@link ProgressBar}'s progress to zero and change its total.
   */
  reset(total: number): void {
    this.singleBarFormatted?.getSingleBar().setTotal(total);
    this.singleBarFormatted?.getSingleBar().update(0);
    this.payload.inProgress = 0;
    this.payload.waitingMessage = undefined;
    this.render(true);
  }

  private logPayload(): void {
    const name = this.payload.name ?? '';
    const finishedMessageWrapped = this.payload.finishedMessage
      ?.split('\n')
      .map((line, idx) => {
        if (idx === 0) {
          return line;
        }
        return `   ${line}`;
      })
      .join('\n');

    this.log(
      LogLevel.ALWAYS,
      `${name}${finishedMessageWrapped ? ` ... ${finishedMessageWrapped}` : ''}`,
    );
    this.render(true);
  }

  setName(name: string): void {
    if (this.payload.name === name) {
      return;
    }
    this.payload.name = name;
    this.render(true);
  }

  setSymbol(symbol: string): void {
    if (this.payload.symbol === symbol) {
      return;
    }
    this.payload.symbol = symbol;
    this.render(true);
  }

  /**
   * If progress hasn't been made by some timeout period, then show a waiting message to let the
   * user know that there is still something processing.
   */
  addWaitingMessage(waitingMessage: string): void {
    if (!this.singleBarFormatted) {
      return;
    }
    this.waitingMessages.set(waitingMessage, TimePoly.hrtimeMillis());

    if (!this.waitingMessageTimeout) {
      this.waitingMessageTimeout = Timer.setInterval(() => {
        const currentMillis = TimePoly.hrtimeMillis();
        const newWaitingMessagePair = [...this.waitingMessages].find(
          ([, ms]) => currentMillis - ms >= 5000,
        );

        const newWaitingMessage =
          newWaitingMessagePair === undefined ? undefined : newWaitingMessagePair[0];

        if (newWaitingMessage !== this.payload.waitingMessage) {
          this.payload.waitingMessage = newWaitingMessage;
          this.render(true);
        }
      }, 1000 / ProgressBarCLI.FPS);
    }
  }

  /**
   * Remove a waiting message to let the user know some processing has finished.
   */
  removeWaitingMessage(waitingMessage: string): void {
    if (!this.singleBarFormatted) {
      return;
    }
    this.waitingMessages.delete(waitingMessage);
  }

  /**
   * Increment the total by some amount.
   */
  incrementTotal(increment: number): void {
    if (!this.singleBarFormatted) {
      return;
    }

    this.singleBarFormatted
      .getSingleBar()
      .setTotal(this.singleBarFormatted.getSingleBar().getTotal() + increment);
    this.render();
  }

  /**
   * Increment the in-progress count by one.
   */
  incrementProgress(): void {
    this.payload.inProgress = Math.max(this.payload.inProgress ?? 0, 0) + 1;
    this.render();
  }

  /**
   * Decrement the in-progress count by one, and increment the completed count by one.
   */
  incrementDone(): void {
    this.payload.inProgress = Math.max((this.payload.inProgress ?? 0) - 1, 0);
    this.singleBarFormatted?.getSingleBar().increment();
    this.render();
  }

  /**
   * Set the completed count.
   */
  update(current: number): void {
    this.singleBarFormatted?.getSingleBar().update(current);
    this.render();
  }

  /**
   * Set the completed count to the total, and render any completion message.
   */
  done(finishedMessage?: string): void {
    this.setSymbol(ProgressBarSymbol.DONE);

    const total = this.singleBarFormatted?.getSingleBar().getTotal() ?? 0;
    if (total > 0) {
      this.singleBarFormatted?.getSingleBar().update(total);
    } else {
      this.singleBarFormatted?.getSingleBar().update(total + 1);
    }

    this.payload.waitingMessage = undefined;
    if (finishedMessage) {
      this.payload.finishedMessage = finishedMessage;
    }

    this.render(true);
  }

  /**
   * Return a copy of this {@link ProgressBar} with a new string prefix.
   */
  setLoggerPrefix(prefix: string): void {
    this.logger = this.logger.withLoggerPrefix(prefix);
  }

  /**
   * Log a message at some specified {@link LogLevelValue}.
   */
  log(logLevel: LogLevelValue, message: string): void {
    ProgressBarCLI.log(this.logger, logLevel, message);
  }

  /**
   * Log a message at some specified {@link LogLevelValue}.
   */
  static log(logger: Logger, logLevel: LogLevelValue, message: string): void {
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
  freeze(): void {
    if (!this.singleBarFormatted) {
      this.logPayload();
      return;
    }

    this.render(true);
    ProgressBarCLI.multiBar?.log(`${this.singleBarFormatted.getLastOutput()}\n`);
    this.delete();
  }

  /**
   * Delete this {@link ProgressBarCLI} from the CLI.
   */
  delete(): void {
    this.waitingMessageTimeout?.cancel();

    if (!this.singleBarFormatted) {
      return;
    }

    ProgressBarCLI.multiBar?.remove(this.singleBarFormatted.getSingleBar());
    ProgressBarCLI.progressBars = ProgressBarCLI.progressBars.filter(
      (singleBar) => singleBar.singleBarFormatted !== this.singleBarFormatted,
    );
  }
}
