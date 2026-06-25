import type Logger from './logger.js';

/**
 * A thin wrapper around a {@link Logger} that stamps every message with a fixed prefix (typically a
 * class name, shown dimmed at TRACE level). Obtain one via {@link Logger.child} rather than
 * constructing it directly.
 */
export default class PrefixedLogger {
  private readonly logger: Logger;
  private readonly prefix: string;

  constructor(logger: Logger, prefix: string) {
    this.logger = logger;
    this.prefix = prefix;
  }

  /**
   * Log a TRACE message.
   *
   * This should be used to log internal actions that most users shouldn't care about, but could be
   * helpful in bug reports.
   */
  trace(message: unknown = ''): void {
    this.logger.trace(message, this.prefix);
  }

  /**
   * Log a DEBUG message.
   *
   * This should be used to log actions that weren't taken (i.e. skipped writing a ROM because it
   * already exists, etc.).
   */
  debug(message: unknown = ''): void {
    this.logger.debug(message, this.prefix);
  }

  /**
   * Log an INFO message.
   *
   * This should be used to log actions that were taken (i.e. copying/moving ROMs, recycling files,
   * writing DATs, etc.).
   */
  info(message: unknown = ''): void {
    this.logger.info(message, this.prefix);
  }

  /**
   * Log a WARN message.
   */
  warn(message: unknown = ''): void {
    this.logger.warn(message, this.prefix);
  }

  /**
   * Log an ERROR message.
   */
  error(message: unknown = ''): void {
    this.logger.error(message, this.prefix);
  }
}
