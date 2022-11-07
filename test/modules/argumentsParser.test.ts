import os from 'os';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';
import Constants from '../../src/constants.js';
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
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldCopy()).toEqual(true);
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldMove()).toEqual(true);
    expect(argumentsParser.parse(['zip', ...dummyRequiredArgs]).shouldZip('')).toEqual(true);
    expect(argumentsParser.parse(['clean', ...dummyRequiredArgs]).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(['test', ...dummyRequiredArgs]).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(['report', ...dummyRequiredArgs, '--dat', os.devNull]).shouldReport()).toEqual(true);
  });

  it('should parse multiple commands', () => {
    const commands = ['copy', 'move', 'zip', 'clean', 'test', 'report', ...dummyRequiredArgs, '--dat', os.devNull];
    expect(argumentsParser.parse(commands).shouldCopy()).toEqual(true);
    expect(argumentsParser.parse(commands).shouldMove()).toEqual(true);
    expect(argumentsParser.parse(commands).shouldZip('')).toEqual(true);
    expect(argumentsParser.parse(commands).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(commands).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(commands).shouldReport()).toEqual(true);
  });

  it('should parse duplicate commands', () => {
    expect(argumentsParser.parse(['copy', 'copy', 'copy', ...dummyRequiredArgs]).shouldCopy()).toEqual(true);
  });

  it('should not parse commands not present', () => {
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldCopy()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldZip('')).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldClean()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldTest()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldReport()).toEqual(false);
  });

  it('should throw on unrecognized options', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '-q'])).toThrow(/unknown argument/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--quiet'])).toThrow(/unknown argument/i);
  });
});

describe('options', () => {
  it('should have expected defaults', () => {
    const options = argumentsParser.parse(dummyCommandAndRequiredArgs);
    expect(options.getDirMirror()).toEqual(false);
    expect(options.getDirDatName()).toEqual(false);
    expect(options.getDirLetter()).toEqual(false);
    expect(options.getSingle()).toEqual(false);
    expect(options.getOverwrite()).toEqual(false);
    expect(options.getPreferVerified()).toEqual(false);
    expect(options.getPreferGood()).toEqual(false);
    expect(options.getPreferLanguages()).toHaveLength(0);
    expect(options.getPreferRegions()).toHaveLength(0);
    expect(options.getLanguageFilter()).toHaveLength(0);
    expect(options.getPreferRevisionNewer()).toEqual(false);
    expect(options.getPreferRevisionOlder()).toEqual(false);
    expect(options.getPreferRetail()).toEqual(false);
    expect(options.getPreferParent()).toEqual(false);
    expect(options.getRegionFilter()).toHaveLength(0);
    expect(options.getOnlyBios()).toEqual(false);
    expect(options.getNoBios()).toEqual(false);
    expect(options.getNoUnlicensed()).toEqual(false);
    expect(options.getOnlyRetail()).toEqual(false);
    expect(options.getNoDemo()).toEqual(false);
    expect(options.getNoBeta()).toEqual(false);
    expect(options.getNoSample()).toEqual(false);
    expect(options.getNoPrototype()).toEqual(false);
    expect(options.getNoTestRoms()).toEqual(false);
    expect(options.getNoAftermarket()).toEqual(false);
    expect(options.getNoHomebrew()).toEqual(false);
    expect(options.getNoUnverified()).toEqual(false);
    expect(options.getNoBad()).toEqual(false);
    expect(options.getHelp()).toEqual(false);
  });

  it('should parse "dat"', async () => {
    expect(() => argumentsParser.parse(['report', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['test', '--input', os.devNull, '--dat'])).toThrow(/not enough arguments/i);
    await expect(argumentsParser.parse(['test', '--input', os.devNull]).scanDatFiles()).resolves.toHaveLength(0);
    await expect(argumentsParser.parse(['test', '--input', os.devNull, '--dat', os.devNull]).scanDatFiles()).resolves.toHaveLength(0);

    const src = await argumentsParser.parse(['test', '--input', os.devNull, '-d', './src']).scanDatFiles();
    const test = await argumentsParser.parse(['test', '--input', os.devNull, '--dat', './test']).scanDatFiles();
    const both = await argumentsParser.parse(['test', '--input', os.devNull, '--dat', './src', '-d', './test']).scanDatFiles();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both.length).toEqual(src.length + test.length);
    /** Note: glob patterns are tested in {@link DATScanner} */
  });

  it('should parse "input"', async () => {
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--output', os.devNull]).scanInputFilesWithoutExclusions()).length).toEqual(0);

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

  it('should parse "patch"', async () => {
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', os.devNull, '--output', os.devNull]).scanInputFilesWithoutExclusions()).length).toEqual(0);

    const src = await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull]).scanPatchFiles();
    const test = await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './test', '--output', os.devNull]).scanPatchFiles();
    const both = await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '-p', './test', '--output', os.devNull]).scanPatchFiles();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both.length).toEqual(src.length + test.length);
    /** Note: glob patterns are tested in {@link PatchScanner} */
  });

  it('should parse "output"', () => {
    // Test requirements per command
    expect(() => argumentsParser.parse(['test'])).toThrow(/missing required argument/i);
    expect(() => argumentsParser.parse(['copy', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['move', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['zip', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['clean', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(argumentsParser.parse(['test', '--dat', os.devNull, '--input', os.devNull]).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
    expect(argumentsParser.parse(['report', '--dat', os.devNull, '--input', os.devNull]).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
    // Test value
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '-o', 'foo']).getOutput()).toEqual('foo');
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo']).getOutput()).toEqual('foo');
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo', '--output', 'bar']).getOutput()).toEqual('bar');
  });

  it('should parse "header"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--header', '**/*']).shouldReadFileForHeader('file.rom')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--header', '**/*', '--header', 'nope']).shouldReadFileForHeader('file.rom')).toEqual(false);
  });

  it('should parse "dir-mirror"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false']).getDirMirror()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', '--dir-mirror']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false', '--dir-mirror', 'true']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true', '--dir-mirror', 'false']).getDirMirror()).toEqual(false);
  });

  it('should parse "dir-datname"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name']).getDirDatName()).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-D']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'true']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'false']).getDirDatName()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', '--dir-dat-name']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'false', '--dir-dat-name', 'true']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'true', '--dir-dat-name', 'false']).getDirDatName()).toEqual(false);
  });

  it('should parse "dir-letter"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false']).getDirLetter()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false', '--dir-letter', 'true']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true', '--dir-letter', 'false']).getDirLetter()).toEqual(false);
  });

  it('should parse "single"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single']).getSingle()).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-s']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'true']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'false']).getSingle()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', '--single']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'false', '--single', 'true']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'true', '--single', 'false']).getSingle()).toEqual(false);
  });

  it('should parse "zip-exclude"', () => {
    const filePath = 'roms/test.rom';
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull]).shouldZip(filePath)).toEqual(true);
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '-Z', os.devNull]).shouldZip(filePath)).toEqual(true);
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*']).shouldZip(filePath)).toEqual(false);
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*.rom']).shouldZip(filePath)).toEqual(false);
    expect(argumentsParser.parse(['zip', '--input', os.devNull, '--output', os.devNull, '--zip-exclude', '**/*.rom']).shouldZip(filePath)).toEqual(false);
  });

  it('should parse "remove-headers"', () => {
    // False
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).canRemoveHeader('.smc')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers', '.smc']).canRemoveHeader('.rom')).toEqual(false);
    // True
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-H']).canRemoveHeader('')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers']).canRemoveHeader('')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers']).canRemoveHeader('.rom')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers']).canRemoveHeader('.smc')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-H', '.smc']).canRemoveHeader('filepath.smc')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers', 'smc']).canRemoveHeader('.smc')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers', '.smc']).canRemoveHeader('.SMC')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-H', 'LNX,.smc']).canRemoveHeader('.smc')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--remove-headers', 'lnx,.LNX']).canRemoveHeader('.LnX')).toEqual(true);
  });

  it('should parse "overwrite"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-O']).getOverwrite()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite']).getOverwrite()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true']).getOverwrite()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false']).getOverwrite()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', '--overwrite']).getOverwrite()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false', '--overwrite', 'true']).getOverwrite()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true', '--overwrite', 'false']).getOverwrite()).toEqual(false);
  });

  it('should parse "prefer-verified"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-verified'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-verified', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-verified', '--single']).getPreferVerified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-verified', 'true', '--single']).getPreferVerified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-verified', 'false', '--single']).getPreferVerified()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-verified', '--prefer-verified', '--single']).getPreferVerified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-verified', 'false', '--prefer-verified', 'true', '--single']).getPreferVerified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-verified', 'true', '--prefer-verified', 'false', '--single']).getPreferVerified()).toEqual(false);
  });

  it('should parse "prefer-good"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-good', '--single']).getPreferGood()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-good', 'true', '--single']).getPreferGood()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-good', 'false', '--single']).getPreferGood()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-good', '--prefer-good', '--single']).getPreferGood()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-good', 'false', '--prefer-good', 'true', '--single']).getPreferGood()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-good', 'true', '--prefer-good', 'false', '--single']).getPreferGood()).toEqual(false);
  });

  it('should parse "prefer-language"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language'])).toThrow(/not enough arguments/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-l', 'EN', '--single']).getPreferLanguages()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-language', 'EN', '--single']).getPreferLanguages()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-language', 'EN,it', '--single']).getPreferLanguages()).toEqual(['EN', 'IT']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-language', 'en,IT,JA', '--single']).getPreferLanguages()).toEqual(['EN', 'IT', 'JA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-language', 'EN,en', '--single']).getPreferLanguages()).toEqual(['EN']);
  });

  it('should parse "prefer-region"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region'])).toThrow(/not enough arguments/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-r', 'USA', '--single']).getPreferRegions()).toEqual(['USA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-region', 'USA', '--single']).getPreferRegions()).toEqual(['USA']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-region', 'USA,eur', '--single']).getPreferRegions()).toEqual(['USA', 'EUR']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-region', 'usa,EUR,JPN', '--single']).getPreferRegions()).toEqual(['USA', 'EUR', 'JPN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-region', 'USA,usa', '--single']).getPreferRegions()).toEqual(['USA']);
  });

  it('should parse "prefer-revision-newer"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-newer', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', '--single']).getPreferRevisionNewer()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', 'true', '--single']).getPreferRevisionNewer()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', 'false', '--single']).getPreferRevisionNewer()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', '--prefer-revision-newer', '--single']).getPreferRevisionNewer()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', 'false', '--prefer-revision-newer', 'true', '--single']).getPreferRevisionNewer()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', 'true', '--prefer-revision-newer', 'false', '--single']).getPreferRevisionNewer()).toEqual(false);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-newer', '--prefer-revision-older', '--single'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "prefer-revision-older"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision-older', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', '--single']).getPreferRevisionOlder()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', 'true', '--single']).getPreferRevisionOlder()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', 'false', '--single']).getPreferRevisionOlder()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', '--prefer-revision-older', '--single']).getPreferRevisionOlder()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', 'false', '--prefer-revision-older', 'true', '--single']).getPreferRevisionOlder()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', 'true', '--prefer-revision-older', 'false', '--single']).getPreferRevisionOlder()).toEqual(false);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-revision-older', '--prefer-revision-newer', '--single'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "prefer-retail"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-retail', '--single']).getPreferRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-retail', 'true', '--single']).getPreferRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-retail', 'false', '--single']).getPreferRetail()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-retail', '--prefer-retail', '--single']).getPreferRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-retail', 'false', '--prefer-retail', 'true', '--single']).getPreferRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-retail', 'true', '--prefer-retail', 'false', '--single']).getPreferRetail()).toEqual(false);
  });

  it('should parse "prefer-parent"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent', '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-parent', '--single']).getPreferParent()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-parent', 'true', '--single']).getPreferParent()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-parent', 'false', '--single']).getPreferParent()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-parent', '--prefer-parent', '--single']).getPreferParent()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-parent', 'false', '--prefer-parent', 'true', '--single']).getPreferParent()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-parent', 'true', '--prefer-parent', 'false', '--single']).getPreferParent()).toEqual(false);
  });

  it('should parse "language-filter"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter'])).toThrow(/not enough arguments/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-L', 'EN']).getLanguageFilter()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN']).getLanguageFilter()).toEqual(['EN']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'EN,it']).getLanguageFilter()).toEqual(['EN', 'IT']);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--language-filter', 'en,IT,JA']).getLanguageFilter()).toEqual(['EN', 'IT', 'JA']);
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
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false']).getOnlyBios()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--only-bios']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false', '--only-bios', 'true']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true', '--only-bios', 'false']).getOnlyBios()).toEqual(false);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--no-bios'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "no-bios"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false']).getNoBios()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--no-bios']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false', '--no-bios', 'true']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true', '--no-bios', 'false']).getNoBios()).toEqual(false);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--only-bios'])).toThrow(/mutually exclusive/i);
  });

  it('should parse "no-unlicensed"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false']).getNoUnlicensed()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', '--no-unlicensed']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false', '--no-unlicensed', 'true']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true', '--no-unlicensed', 'false']).getNoUnlicensed()).toEqual(false);
  });

  it('should parse "only-retail"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false']).getOnlyRetail()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', '--only-retail']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false', '--only-retail', 'true']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true', '--only-retail', 'false']).getOnlyRetail()).toEqual(false);
  });

  it('should parse "no-demo"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false']).getNoDemo()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--no-demo']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false', '--no-demo', 'true']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true', '--no-demo', 'false']).getNoDemo()).toEqual(false);
  });

  it('should parse "no-beta"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false']).getNoBeta()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--no-beta']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false', '--no-beta', 'true']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true', '--no-beta', 'false']).getNoBeta()).toEqual(false);
  });

  it('should parse "no-sample"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false']).getNoSample()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', '--no-sample']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false', '--no-sample', 'true']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true', '--no-sample', 'false']).getNoSample()).toEqual(false);
  });

  it('should parse "no-prototype"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false']).getNoPrototype()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--no-prototype']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false', '--no-prototype', 'true']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true', '--no-prototype', 'false']).getNoPrototype()).toEqual(false);
  });

  it('should parse "no-test-roms"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false']).getNoTestRoms()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', '--no-test-roms']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false', '--no-test-roms', 'true']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true', '--no-test-roms', 'false']).getNoTestRoms()).toEqual(false);
  });

  it('should parse "no-aftermarket"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false']).getNoAftermarket()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', '--no-aftermarket']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false', '--no-aftermarket', 'true']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true', '--no-aftermarket', 'false']).getNoAftermarket()).toEqual(false);
  });

  it('should parse "no-homebrew"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false']).getNoHomebrew()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--no-homebrew']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false', '--no-homebrew', 'true']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true', '--no-homebrew', 'false']).getNoHomebrew()).toEqual(false);
  });

  it('should parse "no-unverified"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'true']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'false']).getNoUnverified()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', '--no-unverified']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'false', '--no-unverified', 'true']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'true', '--no-unverified', 'false']).getNoUnverified()).toEqual(false);
  });

  it('should parse "no-bad"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false']).getNoBad()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--no-bad']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false', '--no-bad', 'true']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true', '--no-bad', 'false']).getNoBad()).toEqual(false);
  });

  it('should parse "verbose"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getLogLevel()).toEqual(LogLevel.WARN);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-v']).getLogLevel()).toEqual(LogLevel.INFO);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--verbose']).getLogLevel()).toEqual(LogLevel.INFO);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-vv']).getLogLevel()).toEqual(LogLevel.DEBUG);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-vvv']).getLogLevel()).toEqual(LogLevel.TRACE);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-vvvvvvvvvv']).getLogLevel()).toEqual(LogLevel.TRACE);
  });

  it('should parse "help"', () => {
    expect(argumentsParser.parse(['-h']).getHelp()).toEqual(true);
    expect(argumentsParser.parse(['--help']).getHelp()).toEqual(true);
    expect(argumentsParser.parse(['--help', '100']).getHelp()).toEqual(true);
  });
});
