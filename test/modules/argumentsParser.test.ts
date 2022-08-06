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

  it('should parse "dat"', () => {
    // TODO(cemmer)
  });

  it('should parse "input"', () => {
    // TODO(cemmer)
  });

  it('should parse "input-exclude"', () => {
    // TODO(cemmer)
  });

  it('should parse "output"', () => {
    // TODO(cemmer)
  });

  it('should parse "dir-mirror"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror']).getDirMirror()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true']).getDirMirror()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false']).getDirMirror()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', '--dir-mirror']).getDirMirror()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false', '--dir-mirror', 'true']).getDirMirror()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true', '--dir-mirror', 'false']).getDirMirror()).toBeFalsy();
  });

  it('should parse "dir-datname"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-D']).getDirDatName()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name']).getDirDatName()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'true']).getDirDatName()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'false']).getDirDatName()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', '--dir-dat-name']).getDirDatName()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'false', '--dir-dat-name', 'true']).getDirDatName()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'true', '--dir-dat-name', 'false']).getDirDatName()).toBeFalsy();
  });

  it('should parse "dir-letter"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter']).getDirLetter()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true']).getDirLetter()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false']).getDirLetter()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter']).getDirLetter()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false', '--dir-letter', 'true']).getDirLetter()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true', '--dir-letter', 'false']).getDirLetter()).toBeFalsy();
  });

  it('should parse "single"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-s']).getSingle()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--single']).getSingle()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'true']).getSingle()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'false']).getSingle()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', '--single']).getSingle()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'false', '--single', 'true']).getSingle()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'true', '--single', 'false']).getSingle()).toBeFalsy();
  });

  it('should parse "zip-exclude"', () => {
    // TODO(cemmer)
  });

  it('should parse "overwrite"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-O']).getOverwrite()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite']).getOverwrite()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true']).getOverwrite()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false']).getOverwrite()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', '--overwrite']).getOverwrite()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false', '--overwrite', 'true']).getOverwrite()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true', '--overwrite', 'false']).getOverwrite()).toBeFalsy();
  });

  it('should parse "prefer-good"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good']).getPreferGood()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'true']).getPreferGood()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'false']).getPreferGood()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', '--prefer-good']).getPreferGood()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'false', '--prefer-good', 'true']).getPreferGood()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'true', '--prefer-good', 'false']).getPreferGood()).toBeFalsy();
  });

  it('should parse "prefer-language"', () => {
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language'])).toThrow(/not enough arguments/i);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-l', 'EN']).getPreferLanguages()).toEqual(['EN']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN']).getPreferLanguages()).toEqual(['EN']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN,it']).getPreferLanguages()).toEqual(['EN', 'IT']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'en,IT,JP']).getPreferLanguages()).toEqual(['EN', 'IT', 'JP']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN,en']).getPreferLanguages()).toEqual(['EN']);
  });

  it('should parse "prefer-region"', () => {
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region'])).toThrow(/not enough arguments/i);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-r', 'USA']).getPreferRegions()).toEqual(['USA']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA']).getPreferRegions()).toEqual(['USA']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA,eur']).getPreferRegions()).toEqual(['USA', 'EUR']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'usa,EUR,JPN']).getPreferRegions()).toEqual(['USA', 'EUR', 'JPN']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA,usa']).getPreferRegions()).toEqual(['USA']);
  });

  it('should parse "prefer-revision-newer"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer']).getPreferRevisionNewer()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'true']).getPreferRevisionNewer()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'false']).getPreferRevisionNewer()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', '--prefer-revision-newer']).getPreferRevisionNewer()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'false', '--prefer-revision-newer', 'true']).getPreferRevisionNewer()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'true', '--prefer-revision-newer', 'false']).getPreferRevisionNewer()).toBeFalsy();
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', '--prefer-revision-older'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "prefer-revision-older"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older']).getPreferRevisionOlder()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'true']).getPreferRevisionOlder()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'false']).getPreferRevisionOlder()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', '--prefer-revision-older']).getPreferRevisionOlder()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'false', '--prefer-revision-older', 'true']).getPreferRevisionOlder()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'true', '--prefer-revision-older', 'false']).getPreferRevisionOlder()).toBeFalsy();
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', '--prefer-revision-newer'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "prefer-retail"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail']).getPreferRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'true']).getPreferRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'false']).getPreferRetail()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', '--prefer-retail']).getPreferRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'false', '--prefer-retail', 'true']).getPreferRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'true', '--prefer-retail', 'false']).getPreferRetail()).toBeFalsy();
  });

  it('should parse "prefer-parent"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent']).getPreferParent()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'true']).getPreferParent()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'false']).getPreferParent()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', '--prefer-parent']).getPreferParent()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'false', '--prefer-parent', 'true']).getPreferParent()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'true', '--prefer-parent', 'false']).getPreferParent()).toBeFalsy();
  });

  it('should parse "language-filter"', () => {
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter'])).toThrow(/not enough arguments/i);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-L', 'EN']).getLanguageFilter()).toEqual(['EN']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN']).getLanguageFilter()).toEqual(['EN']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN,it']).getLanguageFilter()).toEqual(['EN', 'IT']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'en,IT,JP']).getLanguageFilter()).toEqual(['EN', 'IT', 'JP']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN,en']).getLanguageFilter()).toEqual(['EN']);
  });

  it('should parse "region-filter"', () => {
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter'])).toThrow(/not enough arguments/i);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '-R', 'USA']).getRegionFilter()).toEqual(['USA']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'USA']).getRegionFilter()).toEqual(['USA']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'USA,eur']).getRegionFilter()).toEqual(['USA', 'EUR']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'usa,EUR,JPN']).getRegionFilter()).toEqual(['USA', 'EUR', 'JPN']);
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'USA,usa']).getRegionFilter()).toEqual(['USA']);
  });

  it('should parse "only-bios"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios']).getOnlyBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true']).getOnlyBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false']).getOnlyBios()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--only-bios']).getOnlyBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false', '--only-bios', 'true']).getOnlyBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true', '--only-bios', 'false']).getOnlyBios()).toBeFalsy();
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--no-bios'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "no-bios"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios']).getNoBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true']).getNoBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false']).getNoBios()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--no-bios']).getNoBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false', '--no-bios', 'true']).getNoBios()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true', '--no-bios', 'false']).getNoBios()).toBeFalsy();
    expect(() => ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--only-bios'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "no-unlicensed"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed']).getNoUnlicensed()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true']).getNoUnlicensed()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false']).getNoUnlicensed()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', '--no-unlicensed']).getNoUnlicensed()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false', '--no-unlicensed', 'true']).getNoUnlicensed()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true', '--no-unlicensed', 'false']).getNoUnlicensed()).toBeFalsy();
  });

  it('should parse "only-retail"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail']).getOnlyRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true']).getOnlyRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false']).getOnlyRetail()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', '--only-retail']).getOnlyRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false', '--only-retail', 'true']).getOnlyRetail()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true', '--only-retail', 'false']).getOnlyRetail()).toBeFalsy();
  });

  it('should parse "no-demo"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo']).getNoDemo()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true']).getNoDemo()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false']).getNoDemo()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--no-demo']).getNoDemo()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false', '--no-demo', 'true']).getNoDemo()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true', '--no-demo', 'false']).getNoDemo()).toBeFalsy();
  });

  it('should parse "no-beta"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta']).getNoBeta()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true']).getNoBeta()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false']).getNoBeta()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--no-beta']).getNoBeta()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false', '--no-beta', 'true']).getNoBeta()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true', '--no-beta', 'false']).getNoBeta()).toBeFalsy();
  });

  it('should parse "no-sample"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample']).getNoSample()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true']).getNoSample()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false']).getNoSample()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', '--no-sample']).getNoSample()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false', '--no-sample', 'true']).getNoSample()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true', '--no-sample', 'false']).getNoSample()).toBeFalsy();
  });

  it('should parse "no-prototype"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype']).getNoPrototype()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true']).getNoPrototype()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false']).getNoPrototype()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--no-prototype']).getNoPrototype()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false', '--no-prototype', 'true']).getNoPrototype()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true', '--no-prototype', 'false']).getNoPrototype()).toBeFalsy();
  });

  it('should parse "no-test-roms"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms']).getNoTestRoms()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true']).getNoTestRoms()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false']).getNoTestRoms()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', '--no-test-roms']).getNoTestRoms()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false', '--no-test-roms', 'true']).getNoTestRoms()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true', '--no-test-roms', 'false']).getNoTestRoms()).toBeFalsy();
  });

  it('should parse "no-aftermarket"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket']).getNoAftermarket()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true']).getNoAftermarket()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false']).getNoAftermarket()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', '--no-aftermarket']).getNoAftermarket()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false', '--no-aftermarket', 'true']).getNoAftermarket()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true', '--no-aftermarket', 'false']).getNoAftermarket()).toBeFalsy();
  });

  it('should parse "no-homebrew"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew']).getNoHomebrew()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true']).getNoHomebrew()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false']).getNoHomebrew()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--no-homebrew']).getNoHomebrew()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false', '--no-homebrew', 'true']).getNoHomebrew()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true', '--no-homebrew', 'false']).getNoHomebrew()).toBeFalsy();
  });

  it('should parse "no-bad"', () => {
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad']).getNoBad()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true']).getNoBad()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false']).getNoBad()).toBeFalsy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--no-bad']).getNoBad()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false', '--no-bad', 'true']).getNoBad()).toBeTruthy();
    expect(ArgumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true', '--no-bad', 'false']).getNoBad()).toBeFalsy();
  });

  it('should parse "help"', () => {
    expect(ArgumentsParser.parse(['-h']).getHelp()).toBeTruthy();
    expect(ArgumentsParser.parse(['--help']).getHelp()).toBeTruthy();
  });
});
