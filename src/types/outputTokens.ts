export type OutputTokenValues = Map<string, string>;

/**
 * A class of information about specific game consoles and their names, standard file extensions,
 * and how to replace output tokens such as `{pocket}`.
 */
export default class OutputTokens {
  private readonly datRegex: RegExp;

  private readonly extensions: string[];

  private readonly tokens: OutputTokenValues;

  constructor(datRegex: RegExp, extensions: string[], tokens: OutputTokenValues) {
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

  getTokens(): OutputTokenValues {
    return this.tokens;
  }
}
