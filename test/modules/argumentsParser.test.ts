import os from 'os';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';
import ArgumentsParser from '../../src/modules/argumentsParser.js';

const dummyRequiredArgs = ['--input', os.devNull, '--output', os.devNull];
const dummyCommandAndRequiredArgs = ['copy', ...dummyRequiredArgs];

const argumentsParser = new ArgumentsParser(new Logger(LogLevel.NEVER));

describe('commands', () => {
  it('should throw on no commands', () => {
    expect(() => argumentsParser.parse([])).toThrow(Error);
  });

  it('should throw on unrecognized commands', () => {
    expect(() => argumentsParser.parse(['foobar', ...dummyRequiredArgs])).toThrow(/unknown command/i);
    expect(() => argumentsParser.parse(['foo', 'bar', ...dummyRequiredArgs])).toThrow(/unknown command/i);
  });

  it('should parse single commands', () => {
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldCopy()).toBeTruthy();
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldMove()).toBeTruthy();
    expect(argumentsParser.parse(['zip', ...dummyRequiredArgs]).shouldZip('')).toBeTruthy();
    expect(argumentsParser.parse(['clean', ...dummyRequiredArgs]).shouldClean()).toBeTruthy();
    expect(argumentsParser.parse(['test', ...dummyRequiredArgs]).shouldTest()).toBeTruthy();
    expect(argumentsParser.parse(['report', ...dummyRequiredArgs]).shouldReport()).toBeTruthy();
  });

  it('should parse multiple commands', () => {
    const commands = ['copy', 'move', 'zip', 'clean', 'test', 'report', ...dummyRequiredArgs];
    expect(argumentsParser.parse(commands).shouldCopy()).toBeTruthy();
    expect(argumentsParser.parse(commands).shouldMove()).toBeTruthy();
    expect(argumentsParser.parse(commands).shouldZip('')).toBeTruthy();
    expect(argumentsParser.parse(commands).shouldClean()).toBeTruthy();
    expect(argumentsParser.parse(commands).shouldTest()).toBeTruthy();
    expect(argumentsParser.parse(commands).shouldReport()).toBeTruthy();
  });

  it('should parse duplicate commands', () => {
    expect(argumentsParser.parse(['copy', 'copy', 'copy', ...dummyRequiredArgs]).shouldCopy()).toBeTruthy();
  });

  it('should not parse commands not present', () => {
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldCopy()).toBeFalsy();
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldMove()).toBeFalsy();
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldZip('')).toBeFalsy();
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldClean()).toBeFalsy();
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldTest()).toBeFalsy();
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldReport()).toBeFalsy();
  });

  it('should throw on unrecognized options', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '-q'])).toThrow(/unknown argument/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--quiet'])).toThrow(/unknown argument/i);
  });
});

describe('options', () => {
  it('should have expected defaults', () => {
    const options = argumentsParser.parse(dummyCommandAndRequiredArgs);
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

  it('should parse "dat"', async () => {
    const src = await argumentsParser.parse(['test', '--input', os.devNull, '--dat', './src']).scanDatFiles();
    const test = await argumentsParser.parse(['test', '--input', os.devNull, '--dat', './test']).scanDatFiles();
    const both = await argumentsParser.parse(['test', '--input', os.devNull, '--dat', './src', '--dat', './test']).scanDatFiles();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both.length).toEqual(src.length + test.length);
    /** Note: glob patterns are tested in {@link DATScanner} */
  });

  it('should parse "input"', async () => {
    const src = await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull]).scanInputFilesWithoutExclusions();
    const test = await argumentsParser.parse(['copy', '--input', './test', '--output', os.devNull]).scanInputFilesWithoutExclusions();
    const both = await argumentsParser.parse(['copy', '--input', './src', '--input', './test', '--output', os.devNull]).scanInputFilesWithoutExclusions();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both.length).toEqual(src.length + test.length);
    /** Note: glob patterns are tested in {@link ROMScanner} */
  });

  it('should parse "input-exclude"', async () => {
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull]).scanInputFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull, '-I', os.devNull]).scanInputFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull, '-I', './src']).scanInputFilesWithoutExclusions()).length).toEqual(0);
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull, '--input-exclude', './src']).scanInputFilesWithoutExclusions()).length).toEqual(0);
  });

  it('should parse "output"', () => {
    // Test requirements per command
    expect(() => argumentsParser.parse(['test'])).toThrow(/missing required argument/i);
    expect(() => argumentsParser.parse(['copy', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['move', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['zip', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['clean', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(argumentsParser.parse(['test', '--input', os.devNull]).getOutput()).toContain(os.tmpdir());
    expect(argumentsParser.parse(['report', '--input', os.devNull]).getOutput()).toContain(os.tmpdir());
    // Test value
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '-o', 'foo']).getOutput()).toEqual('foo');
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo']).getOutput()).toEqual('foo');
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo', '--output', 'bar']).getOutput()).toEqual('bar');
  });

  it('should parse "dir-mirror"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror']).getDirMirror()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true']).getDirMirror()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false']).getDirMirror()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', '--dir-mirror']).getDirMirror()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false', '--dir-mirror', 'true']).getDirMirror()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true', '--dir-mirror', 'false']).getDirMirror()).toBeFalsy();
  });

  it('should parse "dir-datname"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-D']).getDirDatName()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name']).getDirDatName()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'true']).getDirDatName()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'false']).getDirDatName()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', '--dir-dat-name']).getDirDatName()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'false', '--dir-dat-name', 'true']).getDirDatName()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name', 'true', '--dir-dat-name', 'false']).getDirDatName()).toBeFalsy();
  });

  it('should parse "dir-letter"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter']).getDirLetter()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true']).getDirLetter()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false']).getDirLetter()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter']).getDirLetter()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false', '--dir-letter', 'true']).getDirLetter()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true', '--dir-letter', 'false']).getDirLetter()).toBeFalsy();
  });

  it('should parse "single"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-s']).getSingle()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single']).getSingle()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'true']).getSingle()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'false']).getSingle()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', '--single']).getSingle()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'false', '--single', 'true']).getSingle()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', 'true', '--single', 'false']).getSingle()).toBeFalsy();
  });

  it('should parse "zip-exclude"', () => {
    const filePath = 'roms/test.rom';
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull]).shouldZip(filePath)).toBeTruthy();
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '-Z', os.devNull]).shouldZip(filePath)).toBeTruthy();
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*']).shouldZip(filePath)).toBeFalsy();
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*.rom']).shouldZip(filePath)).toBeFalsy();
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '--zip-exclude', '**/*.rom']).shouldZip(filePath)).toBeFalsy();
  });

  it('should parse "overwrite"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-O']).getOverwrite()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite']).getOverwrite()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true']).getOverwrite()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false']).getOverwrite()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', '--overwrite']).getOverwrite()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false', '--overwrite', 'true']).getOverwrite()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true', '--overwrite', 'false']).getOverwrite()).toBeFalsy();
  });

  it('should parse "prefer-good"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', '--single']).getPreferGood()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'true', '--single']).getPreferGood()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'false', '--single']).getPreferGood()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', '--prefer-good', '--single']).getPreferGood()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'false', '--prefer-good', 'true', '--single']).getPreferGood()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'true', '--prefer-good', 'false', '--single']).getPreferGood()).toBeFalsy();
  });

  it('should parse "prefer-language"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language'])).toThrow(/not enough arguments/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-l', 'EN', '--single']).getPreferLanguages()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN', '--single']).getPreferLanguages()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN,it', '--single']).getPreferLanguages()).toEqual(['EN', 'IT']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'en,IT,JP', '--single']).getPreferLanguages()).toEqual(['EN', 'IT', 'JP']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN,en', '--single']).getPreferLanguages()).toEqual(['EN']);
  });

  it('should parse "prefer-region"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region'])).toThrow(/not enough arguments/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-r', 'USA', '--single']).getPreferRegions()).toEqual(['USA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA', '--single']).getPreferRegions()).toEqual(['USA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA,eur', '--single']).getPreferRegions()).toEqual(['USA', 'EUR']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'usa,EUR,JPN', '--single']).getPreferRegions()).toEqual(['USA', 'EUR', 'JPN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA,usa', '--single']).getPreferRegions()).toEqual(['USA']);
  });

  it('should parse "prefer-revision-newer"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', '--single']).getPreferRevisionNewer()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'true', '--single']).getPreferRevisionNewer()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'false', '--single']).getPreferRevisionNewer()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', '--prefer-revision-newer', '--single']).getPreferRevisionNewer()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'false', '--prefer-revision-newer', 'true', '--single']).getPreferRevisionNewer()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', 'true', '--prefer-revision-newer', 'false', '--single']).getPreferRevisionNewer()).toBeFalsy();
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', '--prefer-revision-older', '--single'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "prefer-revision-older"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', '--single']).getPreferRevisionOlder()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'true', '--single']).getPreferRevisionOlder()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'false', '--single']).getPreferRevisionOlder()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', '--prefer-revision-older', '--single']).getPreferRevisionOlder()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'false', '--prefer-revision-older', 'true', '--single']).getPreferRevisionOlder()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', 'true', '--prefer-revision-older', 'false', '--single']).getPreferRevisionOlder()).toBeFalsy();
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', '--prefer-revision-newer', '--single'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "prefer-retail"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', '--single']).getPreferRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'true', '--single']).getPreferRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'false', '--single']).getPreferRetail()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', '--prefer-retail', '--single']).getPreferRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'false', '--prefer-retail', 'true', '--single']).getPreferRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'true', '--prefer-retail', 'false', '--single']).getPreferRetail()).toBeFalsy();
  });

  it('should parse "prefer-parent"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', '--single']).getPreferParent()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'true', '--single']).getPreferParent()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'false', '--single']).getPreferParent()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', '--prefer-parent', '--single']).getPreferParent()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'false', '--prefer-parent', 'true', '--single']).getPreferParent()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'true', '--prefer-parent', 'false', '--single']).getPreferParent()).toBeFalsy();
  });

  it('should parse "language-filter"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter'])).toThrow(/not enough arguments/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-L', 'EN']).getLanguageFilter()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN']).getLanguageFilter()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN,it']).getLanguageFilter()).toEqual(['EN', 'IT']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'en,IT,JP']).getLanguageFilter()).toEqual(['EN', 'IT', 'JP']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN,en']).getLanguageFilter()).toEqual(['EN']);
  });

  it('should parse "region-filter"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter'])).toThrow(/not enough arguments/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-R', 'USA']).getRegionFilter()).toEqual(['USA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'USA']).getRegionFilter()).toEqual(['USA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'USA,eur']).getRegionFilter()).toEqual(['USA', 'EUR']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'usa,EUR,JPN']).getRegionFilter()).toEqual(['USA', 'EUR', 'JPN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--region-filter', 'USA,usa']).getRegionFilter()).toEqual(['USA']);
  });

  it('should parse "only-bios"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios']).getOnlyBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true']).getOnlyBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false']).getOnlyBios()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--only-bios']).getOnlyBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false', '--only-bios', 'true']).getOnlyBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true', '--only-bios', 'false']).getOnlyBios()).toBeFalsy();
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--no-bios'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "no-bios"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios']).getNoBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true']).getNoBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false']).getNoBios()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--no-bios']).getNoBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false', '--no-bios', 'true']).getNoBios()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true', '--no-bios', 'false']).getNoBios()).toBeFalsy();
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--only-bios'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "no-unlicensed"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed']).getNoUnlicensed()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true']).getNoUnlicensed()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false']).getNoUnlicensed()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', '--no-unlicensed']).getNoUnlicensed()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false', '--no-unlicensed', 'true']).getNoUnlicensed()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true', '--no-unlicensed', 'false']).getNoUnlicensed()).toBeFalsy();
  });

  it('should parse "only-retail"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail']).getOnlyRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true']).getOnlyRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false']).getOnlyRetail()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', '--only-retail']).getOnlyRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false', '--only-retail', 'true']).getOnlyRetail()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true', '--only-retail', 'false']).getOnlyRetail()).toBeFalsy();
  });

  it('should parse "no-demo"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo']).getNoDemo()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true']).getNoDemo()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false']).getNoDemo()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--no-demo']).getNoDemo()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false', '--no-demo', 'true']).getNoDemo()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true', '--no-demo', 'false']).getNoDemo()).toBeFalsy();
  });

  it('should parse "no-beta"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta']).getNoBeta()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true']).getNoBeta()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false']).getNoBeta()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--no-beta']).getNoBeta()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false', '--no-beta', 'true']).getNoBeta()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true', '--no-beta', 'false']).getNoBeta()).toBeFalsy();
  });

  it('should parse "no-sample"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample']).getNoSample()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true']).getNoSample()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false']).getNoSample()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', '--no-sample']).getNoSample()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false', '--no-sample', 'true']).getNoSample()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true', '--no-sample', 'false']).getNoSample()).toBeFalsy();
  });

  it('should parse "no-prototype"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype']).getNoPrototype()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true']).getNoPrototype()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false']).getNoPrototype()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--no-prototype']).getNoPrototype()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false', '--no-prototype', 'true']).getNoPrototype()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true', '--no-prototype', 'false']).getNoPrototype()).toBeFalsy();
  });

  it('should parse "no-test-roms"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms']).getNoTestRoms()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true']).getNoTestRoms()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false']).getNoTestRoms()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', '--no-test-roms']).getNoTestRoms()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false', '--no-test-roms', 'true']).getNoTestRoms()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true', '--no-test-roms', 'false']).getNoTestRoms()).toBeFalsy();
  });

  it('should parse "no-aftermarket"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket']).getNoAftermarket()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true']).getNoAftermarket()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false']).getNoAftermarket()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', '--no-aftermarket']).getNoAftermarket()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false', '--no-aftermarket', 'true']).getNoAftermarket()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true', '--no-aftermarket', 'false']).getNoAftermarket()).toBeFalsy();
  });

  it('should parse "no-homebrew"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew']).getNoHomebrew()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true']).getNoHomebrew()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false']).getNoHomebrew()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--no-homebrew']).getNoHomebrew()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false', '--no-homebrew', 'true']).getNoHomebrew()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true', '--no-homebrew', 'false']).getNoHomebrew()).toBeFalsy();
  });

  it('should parse "no-bad"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad']).getNoBad()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true']).getNoBad()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false']).getNoBad()).toBeFalsy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--no-bad']).getNoBad()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false', '--no-bad', 'true']).getNoBad()).toBeTruthy();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true', '--no-bad', 'false']).getNoBad()).toBeFalsy();
  });

  it('should parse "help"', () => {
    expect(argumentsParser.parse(['-h']).getHelp()).toBeTruthy();
    expect(argumentsParser.parse(['--help']).getHelp()).toBeTruthy();
  });
});
