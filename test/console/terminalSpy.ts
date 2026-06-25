import stream from 'node:stream';

import Terminal from '../../src/console/terminal.js';

/**
 * A test helper that wraps a {@link Terminal} writing to an in-memory stream and captures everything
 * written to it.
 */
export default class TerminalSpy {
  private readonly stream: stream.PassThrough;

  private readonly spy: Promise<string>;

  readonly terminal: Terminal;

  constructor() {
    this.stream = new stream.PassThrough();
    this.spy = new Promise((resolve) => {
      const buffers: Uint8Array[] = [];
      this.stream.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });
      this.stream.on('end', () => {
        resolve(Buffer.concat(buffers).toString());
      });
    });
    this.terminal = new Terminal(this.stream);
  }

  async getOutput(): Promise<string> {
    this.stream.end();
    return await this.spy;
  }
}
