import os from 'os';
import path from 'path';

import Logger from '../../src/console/logger.js';
import LogLevel from '../../src/console/logLevel.js';
import Constants from '../../src/constants.js';
import ArgumentsParser from '../../src/modules/argumentsParser.js';
import Header from '../../src/types/dats/logiqx/header.js';
import LogiqxDAT from '../../src/types/dats/logiqx/logiqxDat.js';

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

  it('should throw on conflicting commands', () => {
    expect(() => argumentsParser.parse(['copy', 'move', ...dummyRequiredArgs])).toThrow(/incompatible command/i);
    expect(() => argumentsParser.parse(['copy', 'symlink', ...dummyRequiredArgs])).toThrow(/incompatible command/i);
    expect(() => argumentsParser.parse(['move', 'symlink', ...dummyRequiredArgs])).toThrow(/incompatible command/i);

    expect(() => argumentsParser.parse(['extract', 'zip', ...dummyRequiredArgs])).toThrow(/incompatible command/i);
    expect(() => argumentsParser.parse(['extract', 'symlink', ...dummyRequiredArgs])).toThrow(/incompatible command/i);
    expect(() => argumentsParser.parse(['zip', 'symlink', ...dummyRequiredArgs])).toThrow(/incompatible command/i);
  });

  it('should throw on commands requiring other commands', () => {
    expect(() => argumentsParser.parse(['extract', ...dummyRequiredArgs])).toThrow(/command.+requires/i);
    expect(() => argumentsParser.parse(['zip', ...dummyRequiredArgs])).toThrow(/command.+requires/i);
    expect(() => argumentsParser.parse(['test', ...dummyRequiredArgs])).toThrow(/command.+requires/i);
    expect(() => argumentsParser.parse(['clean', ...dummyRequiredArgs])).toThrow(/command.+requires/i);
  });

  it('should not parse different commands', () => {
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldCopy()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldExtract()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldZip('')).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldClean()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldTest()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldReport()).toEqual(false);
  });

  it('should parse multiple commands', () => {
    const copyExtract = ['copy', 'extract', 'clean', 'test', 'report', ...dummyRequiredArgs, '--dat', os.devNull];
    expect(argumentsParser.parse(copyExtract).shouldCopy()).toEqual(true);
    expect(argumentsParser.parse(copyExtract).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(copyExtract).shouldExtract()).toEqual(true);
    expect(argumentsParser.parse(copyExtract).shouldZip('')).toEqual(false);
    expect(argumentsParser.parse(copyExtract).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(copyExtract).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(copyExtract).shouldReport()).toEqual(true);

    const moveZip = ['move', 'zip', 'clean', 'test', 'report', ...dummyRequiredArgs, '--dat', os.devNull];
    expect(argumentsParser.parse(moveZip).shouldCopy()).toEqual(false);
    expect(argumentsParser.parse(moveZip).shouldMove()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldExtract()).toEqual(false);
    expect(argumentsParser.parse(moveZip).shouldZip('')).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldReport()).toEqual(true);
  });

  it('should parse duplicate commands', () => {
    expect(argumentsParser.parse(['copy', 'copy', 'copy', ...dummyRequiredArgs]).shouldCopy()).toEqual(true);
  });

  it('should not parse commands not present', () => {
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldCopy()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldExtract()).toEqual(false);
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
    expect(options.getNoDevice()).toEqual(false);
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

  it('should parse "input"', async () => {
    await expect(argumentsParser.parse(['copy', '--input', 'nonexistentfile', '--output', os.devNull]).scanInputFilesWithoutExclusions()).rejects.toThrow(/no files found/i);
    await expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', os.devNull]).scanInputFilesWithoutExclusions()).resolves.toHaveLength(0);

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
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull, '-I', 'nonexistentfile']).scanInputFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull, '--input-exclude', './src']).scanInputFilesWithoutExclusions()).length).toEqual(0);
    expect((await argumentsParser.parse(['copy', '--input', './src', '--output', os.devNull, '--input-exclude', './src']).scanInputFilesWithoutExclusions()).length).toEqual(0);
  });

  it('should parse "patch"', async () => {
    await expect(argumentsParser.parse(['copy', '--input', os.devNull, '--patch', 'nonexistentfile', '--output', os.devNull]).scanPatchFilesWithoutExclusions()).rejects.toThrow(/no files found/i);
    await expect(argumentsParser.parse(['copy', '--input', os.devNull, '--patch', os.devNull, '--output', os.devNull]).scanPatchFilesWithoutExclusions()).resolves.toHaveLength(0);

    const src = await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull]).scanPatchFilesWithoutExclusions();
    const test = await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './test', '--output', os.devNull]).scanPatchFilesWithoutExclusions();
    const both = await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '-p', './test', '--output', os.devNull]).scanPatchFilesWithoutExclusions();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both.length).toEqual(src.length + test.length);
    /** Note: glob patterns are tested in {@link PatchScanner} */
  });

  it('should parse "patch-exclude"', async () => {
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull]).scanPatchFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull, '-P', os.devNull]).scanPatchFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull, '-P', 'nonexistentfile']).scanPatchFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull, '--patch-exclude', './src']).scanPatchFilesWithoutExclusions()).length).toEqual(0);
    expect((await argumentsParser.parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull, '--patch-exclude', './src']).scanPatchFilesWithoutExclusions()).length).toEqual(0);
  });

  it('should parse "dat"', async () => {
    expect(() => argumentsParser.parse(['report', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat'])).toThrow(/not enough arguments/i);
    await expect(argumentsParser.parse(dummyCommandAndRequiredArgs).scanDatFilesWithoutExclusions())
      .resolves.toHaveLength(0);
    await expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', 'nonexistentfile']).scanDatFilesWithoutExclusions()).rejects.toThrow(/no files found/i);
    await expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull]).scanDatFilesWithoutExclusions()).resolves.toHaveLength(0);

    const src = await argumentsParser.parse([...dummyCommandAndRequiredArgs, '-d', './src']).scanDatFilesWithoutExclusions();
    const test = await argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', './test']).scanDatFilesWithoutExclusions();
    const both = await argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', './src', '-d', './test']).scanDatFilesWithoutExclusions();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both.length).toEqual(src.length + test.length);
    /** Note: glob patterns are tested in {@link DATScanner} */

    await expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', 'https://www.google.com/']).scanDatFilesWithoutExclusions()).resolves.toEqual(['https://www.google.com/']);
  });

  it('should parse "dat-exclude"', async () => {
    expect((await argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', './src']).scanDatFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', './src', '--dat-exclude', os.devNull]).scanDatFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', './src', '--dat-exclude', 'nonexistentfile']).scanDatFilesWithoutExclusions()).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', './src', '--dat-exclude', './src']).scanDatFilesWithoutExclusions()).length).toEqual(0);
  });

  it('should parse "dat-regex"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDatRegex()).toBeUndefined();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex', '[a-z]']).getDatRegex()?.test('lower')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex', '[a-z]']).getDatRegex()?.test('UPPER')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex', '/[a-z]/i']).getDatRegex()?.test('UPPER')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex', '/[a-z]/i', '--dat-regex', '[0-9]']).getDatRegex()?.test('UPPER')).toEqual(false);
  });

  it('should parse "dat-regex-exclude"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDatRegexExclude()).toBeUndefined();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex-exclude', '[a-z]']).getDatRegexExclude()?.test('lower')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex-exclude', '[a-z]']).getDatRegexExclude()?.test('UPPER')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex-exclude', '/[a-z]/i']).getDatRegexExclude()?.test('UPPER')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-regex-exclude', '/[a-z]/i', '--dat-regex-exclude', '[0-9]']).getDatRegexExclude()?.test('UPPER')).toEqual(false);
  });

  it('should parse "fixdat"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--fixdat']).getFixdat()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--fixdat', 'true']).getFixdat()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--fixdat', 'false']).getFixdat()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--fixdat', '--fixdat']).getFixdat()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--fixdat', 'false', '--fixdat', 'true']).getFixdat()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--fixdat', 'true', '--fixdat', 'false']).getFixdat()).toEqual(false);
  });

  it('should parse "output"', () => {
    // Test requirements per command
    expect(() => argumentsParser.parse(['test'])).toThrow(/missing required argument/i);
    expect(() => argumentsParser.parse(['copy', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['move', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['copy', 'zip', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(() => argumentsParser.parse(['copy', 'clean', '--input', os.devNull])).toThrow(/missing required option/i);
    expect(argumentsParser.parse(['report', '--dat', os.devNull, '--input', os.devNull]).getOutput()).toContain(Constants.GLOBAL_TEMP_DIR);
    // Test value
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '-o', 'foo']).getOutput()).toEqual('foo');
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo']).getOutput()).toEqual('foo');
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo', '--output', 'bar']).getOutput()).toEqual('bar');
  });

  it('should parse "dir-mirror"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false']).getDirMirror()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', '--dir-mirror']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false', '--dir-mirror', 'true']).getDirMirror()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true', '--dir-mirror', 'false']).getDirMirror()).toEqual(false);
  });

  it('should parse "dir-dat-name"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-D']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'true']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'false']).getDirDatName()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', '--dir-dat-name']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'false', '--dir-dat-name', 'true']).getDirDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'true', '--dir-dat-name', 'false']).getDirDatName()).toEqual(false);
  });

  it('should parse "dir-dat-description"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-description'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description']).getDirDatDescription()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description', 'true']).getDirDatDescription()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description', 'false']).getDirDatDescription()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description', '--dir-dat-description']).getDirDatDescription()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description', 'false', '--dir-dat-description', 'true']).getDirDatDescription()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description', 'true', '--dir-dat-description', 'false']).getDirDatDescription()).toEqual(false);
  });

  it('should parse "dir-letter"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false']).getDirLetter()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false', '--dir-letter', 'true']).getDirLetter()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true', '--dir-letter', 'false']).getDirLetter()).toEqual(false);
  });

  it('should parse "dir-letter-limit"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-limit'])).toThrow(/not enough arguments/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-limit', '1'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '-1']).getDirLetterLimit()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '0']).getDirLetterLimit()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '1']).getDirLetterLimit()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '5']).getDirLetterLimit()).toEqual(5);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '5', '--dir-letter-limit', '10']).getDirLetterLimit()).toEqual(10);
  });

  it('should parse "single"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single'])).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-s']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'true']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'false']).getSingle()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', '--single']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'false', '--single', 'true']).getSingle()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'true', '--single', 'false']).getSingle()).toEqual(false);
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

  it('should parse "overwrite-invalid"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid']).getOverwriteInvalid()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', 'true']).getOverwriteInvalid()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', 'false']).getOverwriteInvalid()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', '--overwrite-invalid']).getOverwriteInvalid()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', 'false', '--overwrite-invalid', 'true']).getOverwriteInvalid()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', 'true', '--overwrite-invalid', 'false']).getOverwriteInvalid()).toEqual(false);
  });

  it('should parse "clean-exclude"', async () => {
    const argv = ['copy', '--input', os.devNull, '--output', os.devNull];
    const outputDir = './src';
    expect((await argumentsParser.parse(argv)
      .scanOutputFilesWithoutCleanExclusions([outputDir], [])).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse([...argv, '-C', os.devNull]).scanOutputFilesWithoutCleanExclusions([outputDir], [])).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse([...argv, '-C', 'nonexistentfile']).scanOutputFilesWithoutCleanExclusions([outputDir], [])).length).toBeGreaterThan(0);
    expect((await argumentsParser.parse([...argv, '--clean-exclude', outputDir]).scanOutputFilesWithoutCleanExclusions([outputDir], [])).length).toEqual(0);
    expect((await argumentsParser.parse([...argv, '--clean-exclude', outputDir]).scanOutputFilesWithoutCleanExclusions([outputDir], [])).length).toEqual(0);
  });

  it('should parse "zip-exclude"', () => {
    const filePath = 'roms/test.rom';
    expect(argumentsParser.parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull]).shouldZip(filePath)).toEqual(true);
    expect(argumentsParser.parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '-Z', os.devNull]).shouldZip(filePath)).toEqual(true);
    expect(argumentsParser.parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*']).shouldZip(filePath)).toEqual(false);
    expect(argumentsParser.parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*.rom']).shouldZip(filePath)).toEqual(false);
    expect(argumentsParser.parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '--zip-exclude', '**/*.rom']).shouldZip(filePath)).toEqual(false);
  });

  it('should parse "zip-dat-name"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--zip-dat-name'])).toThrow(/missing required command/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name']).getZipDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', 'true']).getZipDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', 'false']).getZipDatName()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', '--zip-dat-name']).getZipDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', 'false', '--zip-dat-name', 'true']).getZipDatName()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', 'true', '--zip-dat-name', 'false']).getZipDatName()).toEqual(false);
  });

  it('should parse "symlink-relative"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--symlink-relative'])).toThrow(/missing required command/i);
    expect(argumentsParser.parse(['symlink', ...dummyRequiredArgs, '--symlink-relative']).getSymlinkRelative()).toEqual(true);
    expect(argumentsParser.parse(['symlink', ...dummyRequiredArgs, '--symlink-relative', 'true']).getSymlinkRelative()).toEqual(true);
    expect(argumentsParser.parse(['symlink', ...dummyRequiredArgs, '--symlink-relative', 'false']).getSymlinkRelative()).toEqual(false);
    expect(argumentsParser.parse(['symlink', ...dummyRequiredArgs, '--symlink-relative', '--symlink-relative']).getSymlinkRelative()).toEqual(true);
    expect(argumentsParser.parse(['symlink', ...dummyRequiredArgs, '--symlink-relative', 'false', '--symlink-relative', 'true']).getSymlinkRelative()).toEqual(true);
    expect(argumentsParser.parse(['symlink', ...dummyRequiredArgs, '--symlink-relative', 'true', '--symlink-relative', 'false']).getSymlinkRelative()).toEqual(false);
  });

  it('should parse "header"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '--header', '**/*']).shouldReadFileForHeader('file.rom')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--header', '**/*', '--header', 'nope']).shouldReadFileForHeader('file.rom')).toEqual(false);
  });

  it('should parse "remove-headers"', () => {
    const dat = new LogiqxDAT(new Header(), []);

    // False
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).canRemoveHeader(dat, '.smc')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers', '.smc']).canRemoveHeader(dat, '.rom')).toEqual(false);

    // True
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '-H']).canRemoveHeader(dat, '')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers']).canRemoveHeader(dat, '')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers']).canRemoveHeader(dat, '.rom')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers']).canRemoveHeader(dat, '.smc')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '-H', '.smc']).canRemoveHeader(dat, 'filepath.smc')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--remove-headers', 'smc']).canRemoveHeader(dat, '.smc')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--remove-headers', '.smc']).canRemoveHeader(dat, '.SMC')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '-H', 'LNX,.smc']).canRemoveHeader(dat, '.smc')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, 'zip', '--remove-headers', 'lnx,.LNX']).canRemoveHeader(dat, '.LnX')).toEqual(true);
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

  it('should parse "prefer-ntsc"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-ntsc'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', '--prefer-pal', '--single']).getPreferNTSC()).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', '--single']).getPreferNTSC()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', 'true', '--single']).getPreferNTSC()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', 'false', '--single']).getPreferNTSC()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', '--prefer-ntsc', '--single']).getPreferNTSC()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', 'false', '--prefer-ntsc', 'true', '--single']).getPreferNTSC()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-ntsc', 'true', '--prefer-ntsc', 'false', '--single']).getPreferNTSC()).toEqual(false);
  });

  it('should parse "prefer-pal"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-pal'])).toThrow(/dependent|implication/i);
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', '--prefer-ntsc', '--single']).getPreferPAL()).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', '--single']).getPreferPAL()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', 'true', '--single']).getPreferPAL()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', 'false', '--single']).getPreferPAL()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', '--prefer-pal', '--single']).getPreferPAL()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', 'false', '--prefer-pal', 'true', '--single']).getPreferPAL()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--prefer-pal', 'true', '--prefer-pal', 'false', '--single']).getPreferPAL()).toEqual(false);
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

  it('should parse "filter-regex"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getFilterRegex()).toBeUndefined();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex', '[a-z]']).getFilterRegex()?.test('lower')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex', '[a-z]']).getFilterRegex()?.test('UPPER')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex', '/[a-z]/i']).getFilterRegex()?.test('UPPER')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex', '/[a-z]/i', '--filter-regex', '[0-9]']).getFilterRegex()?.test('UPPER')).toEqual(false);
  });

  it('should parse "filter-regex-exclude"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getFilterRegexExclude())
      .toBeUndefined();
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '[a-z]']).getFilterRegexExclude()?.test('lower')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '[a-z]']).getFilterRegexExclude()?.test('UPPER')).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '/[a-z]/i']).getFilterRegexExclude()?.test('UPPER')).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '/[a-z]/i', '--filter-regex-exclude', '[0-9]']).getFilterRegexExclude()?.test('UPPER')).toEqual(false);
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

  it('should parse "no-bios"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--only-bios'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false']).getNoBios()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--no-bios']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false', '--no-bios', 'true']).getNoBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true', '--no-bios', 'false']).getNoBios()).toEqual(false);
  });

  it('should parse "only-bios"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--no-bios'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false']).getOnlyBios()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--only-bios']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false', '--only-bios', 'true']).getOnlyBios()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true', '--only-bios', 'false']).getOnlyBios()).toEqual(false);
  });

  it('should parse "no-device"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', '--only-device'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device']).getNoDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', 'true']).getNoDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', 'false']).getNoDevice()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', '--no-device']).getNoDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', 'false', '--no-device', 'true']).getNoDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', 'true', '--no-device', 'false']).getNoDevice()).toEqual(false);
  });

  it('should parse "only-device"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', '--no-device'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device']).getOnlyDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', 'true']).getOnlyDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', 'false']).getOnlyDevice()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', '--only-device']).getOnlyDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', 'false', '--only-device', 'true']).getOnlyDevice()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', 'true', '--only-device', 'false']).getOnlyDevice()).toEqual(false);
  });

  it('should parse "no-unlicensed"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', '--only-unlicensed'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false']).getNoUnlicensed()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', '--no-unlicensed']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false', '--no-unlicensed', 'true']).getNoUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true', '--no-unlicensed', 'false']).getNoUnlicensed()).toEqual(false);
  });

  it('should parse "only-unlicensed"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', '--no-unlicensed'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed']).getOnlyUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', 'true']).getOnlyUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', 'false']).getOnlyUnlicensed()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', '--only-unlicensed']).getOnlyUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', 'false', '--only-unlicensed', 'true']).getOnlyUnlicensed()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', 'true', '--only-unlicensed', 'false']).getOnlyUnlicensed()).toEqual(false);
  });

  it('should parse "only-retail"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false']).getOnlyRetail()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', '--only-retail']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false', '--only-retail', 'true']).getOnlyRetail()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true', '--only-retail', 'false']).getOnlyRetail()).toEqual(false);
  });

  it('should parse "no-debug"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', '--only-debug'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug']).getNoDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', 'true']).getNoDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', 'false']).getNoDebug()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', '--no-debug']).getNoDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', 'false', '--no-debug', 'true']).getNoDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', 'true', '--no-debug', 'false']).getNoDebug()).toEqual(false);
  });

  it('should parse "only-debug"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', '--no-debug'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug']).getOnlyDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', 'true']).getOnlyDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', 'false']).getOnlyDebug()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', '--only-debug']).getOnlyDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', 'false', '--only-debug', 'true']).getOnlyDebug()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', 'true', '--only-debug', 'false']).getOnlyDebug()).toEqual(false);
  });

  it('should parse "no-demo"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--only-demo'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false']).getNoDemo()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--no-demo']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false', '--no-demo', 'true']).getNoDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true', '--no-demo', 'false']).getNoDemo()).toEqual(false);
  });

  it('should parse "only-demo"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', '--no-demo'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo']).getOnlyDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', 'true']).getOnlyDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', 'false']).getOnlyDemo()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', '--only-demo']).getOnlyDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', 'false', '--only-demo', 'true']).getOnlyDemo()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', 'true', '--only-demo', 'false']).getOnlyDemo()).toEqual(false);
  });

  it('should parse "no-beta"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--only-beta'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false']).getNoBeta()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--no-beta']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false', '--no-beta', 'true']).getNoBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true', '--no-beta', 'false']).getNoBeta()).toEqual(false);
  });

  it('should parse "only-beta"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', '--no-beta'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta']).getOnlyBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', 'true']).getOnlyBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', 'false']).getOnlyBeta()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', '--only-beta']).getOnlyBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', 'false', '--only-beta', 'true']).getOnlyBeta()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', 'true', '--only-beta', 'false']).getOnlyBeta()).toEqual(false);
  });

  it('should parse "no-sample"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', '--only-sample'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false']).getNoSample()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', '--no-sample']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false', '--no-sample', 'true']).getNoSample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true', '--no-sample', 'false']).getNoSample()).toEqual(false);
  });

  it('should parse "only-sample"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', '--no-sample'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample']).getOnlySample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', 'true']).getOnlySample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', 'false']).getOnlySample()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', '--only-sample']).getOnlySample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', 'false', '--only-sample', 'true']).getOnlySample()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', 'true', '--only-sample', 'false']).getOnlySample()).toEqual(false);
  });

  it('should parse "no-prototype"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--only-prototype'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false']).getNoPrototype()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--no-prototype']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false', '--no-prototype', 'true']).getNoPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true', '--no-prototype', 'false']).getNoPrototype()).toEqual(false);
  });

  it('should parse "only-prototype"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', '--no-prototype'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype']).getOnlyPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', 'true']).getOnlyPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', 'false']).getOnlyPrototype()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', '--only-prototype']).getOnlyPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', 'false', '--only-prototype', 'true']).getOnlyPrototype()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', 'true', '--only-prototype', 'false']).getOnlyPrototype()).toEqual(false);
  });

  it('should parse "no-test-roms"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', '--only-test-roms'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false']).getNoTestRoms()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', '--no-test-roms']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'false', '--no-test-roms', 'true']).getNoTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-test-roms', 'true', '--no-test-roms', 'false']).getNoTestRoms()).toEqual(false);
  });

  it('should parse "only-test-roms"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms', '--no-test-roms'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms']).getOnlyTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms', 'true']).getOnlyTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms', 'false']).getOnlyTestRoms()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms', '--only-test-roms']).getOnlyTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms', 'false', '--only-test-roms', 'true']).getOnlyTestRoms()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-test-roms', 'true', '--only-test-roms', 'false']).getOnlyTestRoms()).toEqual(false);
  });

  it('should parse "no-aftermarket"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', '--only-aftermarket'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false']).getNoAftermarket()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', '--no-aftermarket']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false', '--no-aftermarket', 'true']).getNoAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true', '--no-aftermarket', 'false']).getNoAftermarket()).toEqual(false);
  });

  it('should parse "only-aftermarket"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', '--no-aftermarket'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket']).getOnlyAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', 'true']).getOnlyAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', 'false']).getOnlyAftermarket()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', '--only-aftermarket']).getOnlyAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', 'false', '--only-aftermarket', 'true']).getOnlyAftermarket()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', 'true', '--only-aftermarket', 'false']).getOnlyAftermarket()).toEqual(false);
  });

  it('should parse "no-homebrew"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--only-homebrew'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false']).getNoHomebrew()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--no-homebrew']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false', '--no-homebrew', 'true']).getNoHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true', '--no-homebrew', 'false']).getNoHomebrew()).toEqual(false);
  });

  it('should parse "only-homebrew"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', '--no-homebrew'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew']).getOnlyHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', 'true']).getOnlyHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', 'false']).getOnlyHomebrew()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', '--only-homebrew']).getOnlyHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', 'false', '--only-homebrew', 'true']).getOnlyHomebrew()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', 'true', '--only-homebrew', 'false']).getOnlyHomebrew()).toEqual(false);
  });

  it('should parse "no-unverified"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', '--only-unverified'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'true']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'false']).getNoUnverified()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', '--no-unverified']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'false', '--no-unverified', 'true']).getNoUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'true', '--no-unverified', 'false']).getNoUnverified()).toEqual(false);
  });

  it('should parse "only-unverified"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified', '--no-unverified'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified']).getOnlyUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified', 'true']).getOnlyUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified', 'false']).getOnlyUnverified()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified', '--only-unverified']).getOnlyUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified', 'false', '--only-unverified', 'true']).getOnlyUnverified()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-unverified', 'true', '--only-unverified', 'false']).getOnlyUnverified()).toEqual(false);
  });

  it('should parse "no-bad"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--only-bad'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false']).getNoBad()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--no-bad']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false', '--no-bad', 'true']).getNoBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true', '--no-bad', 'false']).getNoBad()).toEqual(false);
  });

  it('should parse "only-bad"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', '--no-bad'])).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad']).getOnlyBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', 'true']).getOnlyBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', 'false']).getOnlyBad()).toEqual(false);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', '--only-bad']).getOnlyBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', 'false', '--only-bad', 'true']).getOnlyBad()).toEqual(true);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', 'true', '--only-bad', 'false']).getOnlyBad()).toEqual(false);
  });

  it('should parse "report-output"', () => {
    expect(argumentsParser.parse(['report', '--input', os.devNull, '--dat', os.devNull]).getReportOutput()).toMatch(/igir_[0-9]{4}-[0-9]{2}-[0-9]{2}/);
    expect(argumentsParser.parse(['report', '--input', os.devNull, '--dat', os.devNull, '--report-output', 'report.csv']).getReportOutput()).toEqual(path.resolve('report.csv'));
    expect(argumentsParser.parse(['report', '--input', os.devNull, '--dat', os.devNull, '--report-output', '%dddd, %MMMM %Do %YYYY, %h:%mm:%ss %a.csv']).getReportOutput()).toMatch(/[A-Z][a-z]+, [A-Z][a-z]+ [0-9]{1,2}[a-z]{2} [0-9]{4},/);
  });

  it('should parse "dat-threads"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDatThreads()).toEqual(3);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '-1']).getDatThreads()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '0']).getDatThreads()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '1']).getDatThreads()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '2']).getDatThreads()).toEqual(2);
  });

  it('should parse "writer-threads"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getWriterThreads())
      .toEqual(Constants.ROM_WRITER_DEFAULT_THREADS);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--writer-threads', '-1']).getWriterThreads()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--writer-threads', '0']).getWriterThreads()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--writer-threads', '1']).getWriterThreads()).toEqual(1);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--writer-threads', '2']).getWriterThreads()).toEqual(2);
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
