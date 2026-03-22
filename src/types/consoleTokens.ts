export type ConsoleTokenValues = Map<string, string>;

/**
 * A class of information about specific game consoles and their names, standard file extensions,
 * and how to replace output tokens such as `{pocket}`.
 */
export default class ConsoleTokens {
  private readonly datRegex: RegExp;

  private readonly extensions: string[];

  private readonly tokens: ConsoleTokenValues;

  constructor(datRegex: RegExp, extensions: string[], tokens: ConsoleTokenValues) {
    this.datRegex = datRegex;
    this.extensions = extensions;
    this.tokens = tokens;
  }

  getDatRegex(): RegExp {
    return this.datRegex;
  }

  getExtensions(): string[] {
    return this.extensions;
  }

  getTokens(): ConsoleTokenValues {
    return this.tokens;
  }
}
