import ArgumentsParser from '../../src/modules/argumentsParser.js';

const dummyRequiredArgs = ['--input', '/dev/null', '--output', '/dev/null'];
const dummyCommandAndRequiredArgs = ['copy', ...dummyRequiredArgs];

describe('commands', () => {
  it('should throw on no commands', () => {
    expect(() => ArgumentsParser.parse([])).toThrow(Error);
  });

  it('should throw on unrecognized commands', () => {
    expect(() => ArgumentsParser.parse(['foobar', ...dummyRequiredArgs])).toThrow(/unknown command/i);
    expect(() => ArgumentsParser.parse(['foo', 'bar', ...dummyRequiredArgs])).toThrow(/unknown command/i);
  });

  it('should parse single commands', () => {
    expect(ArgumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldCopy()).toBeTruthy();
    expect(ArgumentsParser.parse(['move', ...dummyRequiredArgs]).shouldMove()).toBeTruthy();
    expect(ArgumentsParser.parse(['zip', ...dummyRequiredArgs]).shouldZip('')).toBeTruthy();
    expect(ArgumentsParser.parse(['clean', ...dummyRequiredArgs]).shouldClean()).toBeTruthy();
    expect(ArgumentsParser.parse(['test', ...dummyRequiredArgs]).shouldTest()).toBeTruthy();
    expect(ArgumentsParser.parse(['report', ...dummyRequiredArgs]).shouldReport()).toBeTruthy();
  });

  it('should parse multiple commands', () => {
    const commands = ['copy', 'move', 'zip', 'clean', 'test', 'report', ...dummyRequiredArgs];
    expect(ArgumentsParser.parse(commands).shouldCopy()).toBeTruthy();
    expect(ArgumentsParser.parse(commands).shouldMove()).toBeTruthy();
    expect(ArgumentsParser.parse(commands).shouldZip('')).toBeTruthy();
    expect(ArgumentsParser.parse(commands).shouldClean()).toBeTruthy();
    expect(ArgumentsParser.parse(commands).shouldTest()).toBeTruthy();
    expect(ArgumentsParser.parse(commands).shouldReport()).toBeTruthy();
  });

  it('should parse duplicate commands', () => {
    expect(ArgumentsParser.parse(['copy', 'copy', 'copy', ...dummyRequiredArgs]).shouldCopy()).toBeTruthy();
  });

  it('should not parse commands not present', () => {
    expect(ArgumentsParser.parse(['move', ...dummyRequiredArgs]).shouldCopy()).toBeFalsy();
    expect(ArgumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldMove()).toBeFalsy();
    expect(ArgumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldZip('')).toBeFalsy();
    expect(ArgumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldClean()).toBeFalsy();
    expect(ArgumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldTest()).toBeFalsy();
    expect(ArgumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldReport()).toBeFalsy();
  });

  it('should throw on unrecognized options', () => {
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-q'])).toThrow(/unknown argument/i);
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--quiet'])).toThrow(/unknown argument/i);
  });
});

describe('options', () => {
  it('should have expected defaults', () => {
    const options = ArgumentsParser.parse(dummyCommandAndRequiredArgs);
    expect(options.getDirMirror()).toBeFalsy();
    expect(options.getDirDatName()).toBeFalsy();
    expect(options.getDirLetter()).toBeFalsy();
    expect(options.getSingle()).toBeFalsy();
    expect(options.getOverwrite()).toBeFalsy();
    expect(options.getPreferGood()).toBeFalsy();
    expect(options.getPreferLanguages().length).toBe(0);
    expect(options.getPreferRegions().length).toBe(0);
    expect(options.getLanguageFilter().length).toBe(0);
    expect(options.getPreferRevisionNewer()).toBeFalsy();
    expect(options.getPreferRevisionOlder()).toBeFalsy();
    expect(options.getPreferRetail()).toBeFalsy();
    expect(options.getPreferParent()).toBeFalsy();
    expect(options.getRegionFilter().length).toBe(0);
    expect(options.getOnlyBios()).toBeFalsy();
    expect(options.getNoBios()).toBeFalsy();
    expect(options.getNoUnlicensed()).toBeFalsy();
    expect(options.getOnlyRetail()).toBeFalsy();
    expect(options.getNoDemo()).toBeFalsy();
    expect(options.getNoBeta()).toBeFalsy();
    expect(options.getNoSample()).toBeFalsy();
    expect(options.getNoPrototype()).toBeFalsy();
    expect(options.getNoTestRoms()).toBeFalsy();
    expect(options.getNoAftermarket()).toBeFalsy();
    expect(options.getNoHomebrew()).toBeFalsy();
    expect(options.getNoBad()).toBeFalsy();
    expect(options.getHelp()).toBeFalsy();
  });

  it('should parse "dat"', () => {});
  it('should parse "input"', () => {});
  it('should parse "input-exclude"', () => {});
  it('should parse "output"', () => {});
  it('should parse "dir-mirror"', () => {});
  it('should parse "dir-datname"', () => {});
  it('should parse "dir-letter"', () => {});
  it('should parse "single"', () => {});
  it('should parse "zip-exclude"', () => {});
  it('should parse "overwrite"', () => {});
  it('should parse "prefer-good"', () => {});
  it('should parse "prefer-language"', () => {});
  it('should parse "prefer-region"', () => {});
  it('should parse "prefer-revision-newer"', () => {});
  it('should parse "prefer-revision-older"', () => {});
  it('should parse "prefer-retail"', () => {});
  it('should parse "prefer-parent"', () => {});
  it('should parse "language-filter"', () => {});
  it('should parse "region-filter"', () => {});
  it('should parse "only-bios"', () => {});
  it('should parse "no-bios"', () => {});
  it('should parse "no-unlicensed"', () => {});
  it('should parse "only-retail"', () => {});
  it('should parse "no-demo"', () => {});
  it('should parse "no-beta"', () => {});
  it('should parse "no-sample"', () => {});
  it('should parse "no-prototype"', () => {});
  it('should parse "no-test-roms"', () => {});
  it('should parse "no-aftermarket"', () => {});
  it('should parse "no-homebrew"', () => {});
  it('should parse "no-bad"', () => {});

  it('should parse "help"', () => {
    expect(() => ArgumentsParser.parse(['-h']).getHelp()).toBeTruthy();
    expect(() => ArgumentsParser.parse(['--help']).getHelp()).toBeTruthy();
  });
});
