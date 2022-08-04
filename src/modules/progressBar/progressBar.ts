export default abstract class ProgressBar {
  abstract reset(total: number): Promise<void>;

  abstract setSymbol(symbol: string): Promise<void>;

  abstract increment(): Promise<void>;

  abstract update(current: number): Promise<void>;

  abstract done(finishedMessage?: string): Promise<void>;

  abstract log(message: string): Promise<void>;

  abstract logWarn(message: string): Promise<void>;

  abstract logError(message: string): Promise<void>;

  abstract delete(): void;
}
