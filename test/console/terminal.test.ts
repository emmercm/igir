import stream from 'node:stream';

import TerminalSpy from './terminalSpy.js';

describe('isInteractive', () => {
  it('should be false for a non-TTY stream', () => {
    const spy = new TerminalSpy();
    expect(spy.terminal.isInteractive()).toEqual(false);
  });
});

describe('writeLine', () => {
  it('should write the line with a trailing newline', async () => {
    const spy = new TerminalSpy();
    spy.terminal.writeLine('hello');
    await expect(spy.getOutput()).resolves.toEqual('hello\n');
  });

  it('should write multiple lines in order', async () => {
    const spy = new TerminalSpy();
    spy.terminal.writeLine('a');
    spy.terminal.writeLine('b');
    await expect(spy.getOutput()).resolves.toEqual('a\nb\n');
  });
});

describe('setLiveRegion', () => {
  it('should not draw the live region to a non-TTY stream', async () => {
    const spy = new TerminalSpy();
    spy.terminal.setLiveRegion('progress bar');
    await expect(spy.getOutput()).resolves.toEqual('');
  });

  it('should not corrupt following log lines on a non-TTY stream', async () => {
    const spy = new TerminalSpy();
    spy.terminal.setLiveRegion('progress bar');
    spy.terminal.writeLine('log line');
    await expect(spy.getOutput()).resolves.toEqual('log line\n');
  });
});

describe('clearLiveRegion', () => {
  it('should not write to a non-TTY stream', async () => {
    const spy = new TerminalSpy();
    spy.terminal.setLiveRegion('progress bar');
    spy.terminal.clearLiveRegion();
    await expect(spy.getOutput()).resolves.toEqual('');
  });
});

describe('setStream', () => {
  it('should redirect subsequent output to the new stream', async () => {
    const first = new TerminalSpy();
    const second = new stream.PassThrough();
    const secondOutput = new Promise<string>((resolve) => {
      const buffers: Uint8Array[] = [];
      second.on('data', (chunk: Buffer) => {
        buffers.push(chunk);
      });
      second.on('end', () => {
        resolve(Buffer.concat(buffers).toString());
      });
    });

    first.terminal.setStream(second);
    first.terminal.writeLine('redirected');

    second.end();
    await expect(secondOutput).resolves.toEqual('redirected\n');
    await expect(first.getOutput()).resolves.toEqual('');
  });
});
