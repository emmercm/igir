import yargs from '../../src/polyfill/yargsShim.js';

describe('factory', () => {
  it('should be callable', () => {
    expect(typeof yargs).toBe('function');
  });

  it('should parse options', async () => {
    const argv = await yargs([]).option('foo', { type: 'string' }).parse(['--foo', 'bar']);
    expect(argv.foo).toBe('bar');
  });
});

describe('translations', () => {
  it('should render English section headings in help output', async () => {
    const help = await yargs([]).option('foo', { type: 'string' }).getHelp();
    expect(help).toContain('Options:');
    expect(help).toContain('--foo');
  });

  it('should render English error messages for missing required arguments', () => {
    expect(
      async () =>
        await yargs([])
          .option('foo', { type: 'string', demandOption: true })
          .fail((msg) => {
            throw new Error(msg);
          })
          .parse([]),
    ).toThrow(/Missing required argument: foo/);
  });

  it('should accept updateStrings overrides', async () => {
    const help = await yargs([])
      .option('foo', { type: 'string' })
      .updateStrings({ 'Options:': 'Custom heading:' })
      .getHelp();
    expect(help).toContain('Custom heading:');
    expect(help).not.toContain('Options:');
  });

  it('should pluralize messages with %s substitution', () => {
    expect(
      async () =>
        await yargs([])
          .demandCommand(2)
          .fail((msg) => {
            throw new Error(msg);
          })
          .parse(['only-one-arg']),
    ).toThrow(/Not enough non-option arguments: got 1, need at least 2/);
  });
});
