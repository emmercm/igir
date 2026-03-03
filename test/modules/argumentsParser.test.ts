import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';

import Logger from '../../src/console/logger.js';
import { LogLevel } from '../../src/console/logLevel.js';
import Defaults from '../../src/globals/defaults.js';
import Temp from '../../src/globals/temp.js';
import ArgumentsParser from '../../src/modules/argumentsParser.js';
import FsPoly from '../../src/polyfill/fsPoly.js';
import ROM from '../../src/types/dats/rom.js';
import { ChecksumBitmask } from '../../src/types/files/fileChecksums.js';
import {
  FixExtension,
  GameSubdirMode,
  InputChecksumArchivesMode,
  LinkMode,
  MergeMode,
  MoveDeleteDirs,
  PreferRevision,
  TrimScanFiles,
  ZipFormat,
} from '../../src/types/options.js';

const dummyRequiredArgs = ['--input', os.devNull, '--output', os.devNull];
const dummyCommandAndRequiredArgs = ['copy', ...dummyRequiredArgs];

const argumentsParser = new ArgumentsParser(new Logger(LogLevel.NEVER, new PassThrough()));

describe('commands', () => {
  it('should throw on no commands', () => {
    expect(() => argumentsParser.parse([])).toThrow(Error);
  });

  it('should throw on unrecognized commands', () => {
    expect(() => argumentsParser.parse(['foobar', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
    expect(() => argumentsParser.parse(['foo', 'bar', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
  });

  it('should throw on conflicting commands', () => {
    expect(() => argumentsParser.parse(['copy', 'move', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
    expect(() => argumentsParser.parse(['copy', 'link', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
    expect(() => argumentsParser.parse(['move', 'link', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );

    expect(() => argumentsParser.parse(['extract', 'zip', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
    expect(() => argumentsParser.parse(['extract', 'link', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
    expect(() => argumentsParser.parse(['zip', 'link', ...dummyRequiredArgs])).toThrow(
      /unknown command/i,
    );
  });

  it('should throw on commands requiring other commands', () => {
    expect(() => argumentsParser.parse(['extract', ...dummyRequiredArgs])).toThrow(
      /command.+requires/i,
    );
    expect(() => argumentsParser.parse(['zip', ...dummyRequiredArgs])).toThrow(
      /command.+requires/i,
    );
    expect(() => argumentsParser.parse(['clean', ...dummyRequiredArgs])).toThrow(
      /command.+requires/i,
    );
  });

  it('should not parse commands not present', () => {
    expect(argumentsParser.parse(['move', ...dummyRequiredArgs]).shouldCopy()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldExtract()).toEqual(false);
    expect(
      argumentsParser
        .parse(['copy', ...dummyRequiredArgs])
        .shouldZipRom(new ROM({ name: '', size: 0 })),
    ).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldTest()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldPlaylist()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldDir2Dat()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldFixdat()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldClean()).toEqual(false);
    expect(argumentsParser.parse(['copy', ...dummyRequiredArgs]).shouldReport()).toEqual(false);
  });

  it('should parse multiple commands', () => {
    const datCommands = [
      'copy',
      'extract',
      'test',
      'clean',
      'report',
      ...dummyRequiredArgs,
      '--dat',
      os.devNull,
    ];
    expect(argumentsParser.parse(datCommands).shouldCopy()).toEqual(true);
    expect(argumentsParser.parse(datCommands).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(datCommands).shouldExtract()).toEqual(true);
    expect(argumentsParser.parse(datCommands).shouldZipRom(new ROM({ name: '', size: 0 }))).toEqual(
      false,
    );
    expect(argumentsParser.parse(datCommands).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(datCommands).shouldPlaylist()).toEqual(false);
    expect(argumentsParser.parse(datCommands).shouldDir2Dat()).toEqual(false);
    expect(argumentsParser.parse(datCommands).shouldFixdat()).toEqual(false);
    expect(argumentsParser.parse(datCommands).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(datCommands).shouldReport()).toEqual(true);

    const nonDatCommands = [
      'copy',
      'extract',
      'test',
      'playlist',
      'dir2dat',
      'clean',
      ...dummyRequiredArgs,
    ];
    expect(argumentsParser.parse(nonDatCommands).shouldCopy()).toEqual(true);
    expect(argumentsParser.parse(nonDatCommands).shouldMove()).toEqual(false);
    expect(argumentsParser.parse(nonDatCommands).shouldExtract()).toEqual(true);
    expect(
      argumentsParser.parse(nonDatCommands).shouldZipRom(new ROM({ name: '', size: 0 })),
    ).toEqual(false);
    expect(argumentsParser.parse(nonDatCommands).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(nonDatCommands).shouldPlaylist()).toEqual(true);
    expect(argumentsParser.parse(nonDatCommands).shouldDir2Dat()).toEqual(true);
    expect(argumentsParser.parse(nonDatCommands).shouldFixdat()).toEqual(false);
    expect(argumentsParser.parse(nonDatCommands).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(nonDatCommands).shouldReport()).toEqual(false);

    const moveZip = [
      'move',
      'zip',
      'test',
      'playlist',
      'fixdat',
      'clean',
      'report',
      ...dummyRequiredArgs,
      '--dat',
      os.devNull,
    ];
    expect(argumentsParser.parse(moveZip).shouldCopy()).toEqual(false);
    expect(argumentsParser.parse(moveZip).shouldMove()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldExtract()).toEqual(false);
    expect(argumentsParser.parse(moveZip).shouldZipRom(new ROM({ name: '', size: 0 }))).toEqual(
      true,
    );
    expect(argumentsParser.parse(moveZip).shouldTest()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldPlaylist()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldDir2Dat()).toEqual(false);
    expect(argumentsParser.parse(moveZip).shouldFixdat()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldClean()).toEqual(true);
    expect(argumentsParser.parse(moveZip).shouldReport()).toEqual(true);
  });

  it('should parse duplicate commands', () => {
    expect(
      argumentsParser.parse(['copy', 'copy', 'copy', ...dummyRequiredArgs]).shouldCopy(),
    ).toEqual(true);
  });

  it('should throw on unrecognized options', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '-q'])).toThrow(
      /unknown argument/i,
    );
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--quiet'])).toThrow(
      /unknown argument/i,
    );
  });
});

describe('options', () => {
  it('should have expected defaults', () => {
    const options = argumentsParser.parse(dummyCommandAndRequiredArgs);

    expect(options.shouldCopy()).toEqual(true); // dummy command
    expect(options.shouldMove()).toEqual(false);
    expect(options.shouldLink()).toEqual(false);
    expect(options.shouldExtract()).toEqual(false);
    expect(options.shouldZip()).toEqual(false);
    expect(options.shouldPlaylist()).toEqual(false);
    expect(options.shouldDir2Dat()).toEqual(false);
    expect(options.shouldFixdat()).toEqual(false);
    expect(options.shouldTest()).toEqual(false);
    expect(options.shouldClean()).toEqual(false);
    expect(options.shouldReport()).toEqual(false);

    expect(options.getInputPaths()).toEqual([os.devNull]);
    expect(options.getInputChecksumQuick()).toEqual(false);
    expect(options.getInputChecksumMin()).toEqual(ChecksumBitmask.CRC32);
    expect(options.getInputChecksumMax()).toBeUndefined();
    expect(options.getInputChecksumArchives()).toEqual(InputChecksumArchivesMode.AUTO);

    expect(options.getDatNameRegex()).toBeUndefined();
    expect(options.getDatNameRegexExclude()).toBeUndefined();
    expect(options.getDatDescriptionRegex()).toBeUndefined();
    expect(options.getDatDescriptionRegexExclude()).toBeUndefined();
    expect(options.getDatCombine()).toEqual(false);
    expect(options.getDatIgnoreParentClone()).toEqual(false);

    expect(options.getPatchFileCount()).toEqual(0);
    expect(options.getPatchOnly()).toEqual(false);

    expect(options.getDirMirror()).toEqual(false);
    expect(options.getDirDatMirror()).toEqual(false);
    expect(options.getDirDatName()).toEqual(false);
    expect(options.getDirDatDescription()).toEqual(false);
    expect(options.getDirLetter()).toEqual(false);
    expect(options.getDirLetterCount()).toEqual(1);
    expect(options.getDirLetterLimit()).toEqual(0);
    expect(options.getDirLetterGroup()).toEqual(false);
    expect(options.getDirGameSubdir()).toEqual(GameSubdirMode.MULTIPLE);

    expect(options.getFixExtension()).toEqual(FixExtension.AUTO);
    expect(options.getOverwrite()).toEqual(false);
    expect(options.getOverwriteInvalid()).toEqual(false);

    expect(options.getMoveDeleteDirs()).toEqual(MoveDeleteDirs.AUTO);

    expect(options.getCleanBackup()).toBeUndefined();
    expect(options.getCleanDryRun()).toEqual(false);

    expect(options.getZipFormat()).toEqual(ZipFormat.TORRENTZIP);
    expect(options.getZipDatName()).toEqual(false);

    expect(options.getLinkMode()).toEqual(LinkMode.HARDLINK);
    expect(options.getSymlinkRelative()).toEqual(false);

    expect(options.getTrimScanArchives()).toEqual(false);
    expect(options.getTrimScanFiles()).toEqual(TrimScanFiles.AUTO);

    expect(options.getMergeRoms()).toEqual(MergeMode.FULLNONMERGED);
    expect(options.getMergeDiscs()).toEqual(false);
    expect(options.getExcludeDisks()).toEqual(false);
    expect(options.getAllowExcessSets()).toEqual(false);
    expect(options.getAllowIncompleteSets()).toEqual(false);

    expect(options.getFilterRegex()).toBeUndefined();
    expect(options.getFilterRegexExclude()).toBeUndefined();
    expect(options.getFilterLanguage().size).toEqual(0);
    expect(options.getFilterRegion().size).toEqual(0);
    expect(options.getFilterCategoryRegex()).toBeUndefined();
    expect(options.getNoBios()).toEqual(false);
    expect(options.getOnlyBios()).toEqual(false);
    expect(options.getNoDevice()).toEqual(false);
    expect(options.getOnlyDevice()).toEqual(false);
    expect(options.getNoUnlicensed()).toEqual(false);
    expect(options.getOnlyUnlicensed()).toEqual(false);
    expect(options.getOnlyRetail()).toEqual(false);
    expect(options.getNoDebug()).toEqual(false);
    expect(options.getOnlyDebug()).toEqual(false);
    expect(options.getNoDemo()).toEqual(false);
    expect(options.getOnlyDemo()).toEqual(false);
    expect(options.getNoBeta()).toEqual(false);
    expect(options.getOnlyBeta()).toEqual(false);
    expect(options.getNoSample()).toEqual(false);
    expect(options.getOnlySample()).toEqual(false);
    expect(options.getNoPrototype()).toEqual(false);
    expect(options.getOnlyPrototype()).toEqual(false);
    expect(options.getNoProgram()).toEqual(false);
    expect(options.getOnlyProgram()).toEqual(false);
    expect(options.getNoAftermarket()).toEqual(false);
    expect(options.getOnlyAftermarket()).toEqual(false);
    expect(options.getNoHomebrew()).toEqual(false);
    expect(options.getOnlyHomebrew()).toEqual(false);
    expect(options.getNoUnverified()).toEqual(false);
    expect(options.getOnlyUnverified()).toEqual(false);
    expect(options.getNoBad()).toEqual(false);
    expect(options.getOnlyBad()).toEqual(false);

    expect(options.getSingle()).toEqual(false);
    expect(options.getPreferGameRegex()).toBeUndefined();
    expect(options.getPreferRomRegex()).toBeUndefined();
    expect(options.getPreferVerified()).toEqual(false);
    expect(options.getPreferGood()).toEqual(false);
    expect(options.getPreferLanguages()).toHaveLength(0);
    expect(options.getPreferRegions()).toHaveLength(0);
    expect(options.getPreferRevision()).toBeUndefined();
    expect(options.getPreferRetail()).toEqual(false);
    expect(options.getPreferParent()).toEqual(false);

    expect(argumentsParser.parse(['playlist']).getPlaylistExtensions()).toEqual([
      '.cue',
      '.gdi',
      '.mdf',
      '.chd',
    ]);

    expect(options.getDir2DatOutput()).toEqual(options.getOutput());

    expect(options.getFixdatOutput()).toEqual(options.getOutput());

    expect(options.getDatThreads()).toEqual(Defaults.DAT_DEFAULT_THREADS);
    expect(options.getReaderThreads()).toEqual(8);
    expect(options.getWriterThreads()).toEqual(4);
    expect(options.getDisableCache()).toEqual(false);
    expect(options.getCachePath()).toBeUndefined();
    expect(options.getLogLevel()).toEqual(LogLevel.WARN);
    expect(options.getHelp()).toEqual(false);
  });

  it('should parse "input"', async () => {
    expect(() => argumentsParser.parse(['copy', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['move', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['link', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['copy', 'extract', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['copy', 'zip', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['copy', 'test', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['dir2dat', '--output', os.devNull])).toThrow(
      /missing required argument/i,
    );
    await expect(
      argumentsParser
        .parse(['copy', '--input', 'nonexistentfile', '--output', os.devNull])
        .scanInputFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);
    await expect(
      argumentsParser
        .parse(['copy', '--input', os.devNull, '--output', os.devNull])
        .scanInputFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);

    const src = await argumentsParser
      .parse(['copy', '--input', './src', '--output', os.devNull])
      .scanInputFilesWithoutExclusions();
    const test = await argumentsParser
      .parse(['copy', '--input', './test', '--output', os.devNull])
      .scanInputFilesWithoutExclusions();
    const both = await argumentsParser
      .parse(['copy', '--input', './src', '--input', './test', '--output', os.devNull])
      .scanInputFilesWithoutExclusions();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both).toHaveLength(src.length + test.length);
    /** Note: glob patterns are tested in {@link ROMScanner} */
  });

  it('should parse "input-exclude"', async () => {
    expect(
      (
        await argumentsParser
          .parse(['copy', '--input', './src', '--output', os.devNull])
          .scanInputFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse(['copy', '--input', './src', '--output', os.devNull, '-I', os.devNull])
          .scanInputFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse(['copy', '--input', './src', '--output', os.devNull, '-I', 'nonexistentfile'])
          .scanInputFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse(['copy', '--input', './src', '--output', os.devNull, '--input-exclude', './src'])
          .scanInputFilesWithoutExclusions()
      ).length,
    ).toEqual(0);
    expect(
      (
        await argumentsParser
          .parse(['copy', '--input', './src', '--output', os.devNull, '--input-exclude', './src'])
          .scanInputFilesWithoutExclusions()
      ).length,
    ).toEqual(0);
  });

  it('should parse "input-checksum-quick"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--input-checksum-quick',
        '--input-checksum-min',
        'MD5',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--input-checksum-quick',
        '--input-checksum-min',
        'SHA1',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--input-checksum-quick',
        '--input-checksum-min',
        'SHA256',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-quick'])
        .getInputChecksumQuick(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-quick', 'true'])
        .getInputChecksumQuick(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-quick', 'false'])
        .getInputChecksumQuick(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-quick', '--input-checksum-quick'])
        .getInputChecksumQuick(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-quick',
          'false',
          '--input-checksum-quick',
          'true',
        ])
        .getInputChecksumQuick(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-quick',
          'true',
          '--input-checksum-quick',
          'false',
        ])
        .getInputChecksumQuick(),
    ).toEqual(false);
  });

  it('should parse "input-checksum-min', () => {
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-min', 'foobar'])
        .getInputChecksumMin(),
    ).toThrow(/invalid values/i);
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'MD5',
          '--input-checksum-max',
          'CRC32',
        ])
        .getInputChecksumMin(),
    ).toThrow(/min.+max/i);
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'SHA1',
          '--input-checksum-max',
          'CRC32',
        ])
        .getInputChecksumMin(),
    ).toThrow(/min.+max/i);
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'SHA256',
          '--input-checksum-max',
          'CRC32',
        ])
        .getInputChecksumMin(),
    ).toThrow(/min.+max/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-min', 'CRC32'])
        .getInputChecksumMin(),
    ).toEqual(ChecksumBitmask.CRC32);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-min', 'MD5'])
        .getInputChecksumMin(),
    ).toEqual(ChecksumBitmask.MD5);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-min', 'SHA1'])
        .getInputChecksumMin(),
    ).toEqual(ChecksumBitmask.SHA1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-min', 'SHA256'])
        .getInputChecksumMin(),
    ).toEqual(ChecksumBitmask.SHA256);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'SHA256',
          '--input-checksum-min',
          'CRC32',
        ])
        .getInputChecksumMin(),
    ).toEqual(ChecksumBitmask.CRC32);
  });

  it('should parse "input-checksum-max', () => {
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-max', 'foobar'])
        .getInputChecksumMax(),
    ).toThrow(/invalid values/i);
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'SHA256',
          '--input-checksum-max',
          'CRC32',
        ])
        .getInputChecksumMax(),
    ).toThrow(/min.+max/i);
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'SHA256',
          '--input-checksum-max',
          'MD5',
        ])
        .getInputChecksumMax(),
    ).toThrow(/min.+max/i);
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-min',
          'SHA256',
          '--input-checksum-max',
          'SHA1',
        ])
        .getInputChecksumMax(),
    ).toThrow(/min.+max/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-max', 'CRC32'])
        .getInputChecksumMax(),
    ).toEqual(ChecksumBitmask.CRC32);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-max', 'MD5'])
        .getInputChecksumMax(),
    ).toEqual(ChecksumBitmask.MD5);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-max', 'SHA1'])
        .getInputChecksumMax(),
    ).toEqual(ChecksumBitmask.SHA1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-max', 'SHA256'])
        .getInputChecksumMax(),
    ).toEqual(ChecksumBitmask.SHA256);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-max',
          'SHA256',
          '--input-checksum-max',
          'CRC32',
        ])
        .getInputChecksumMax(),
    ).toEqual(ChecksumBitmask.CRC32);
  });

  it('should parse "input-checksum-archives"', () => {
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs]).getInputChecksumArchives(),
    ).toEqual(InputChecksumArchivesMode.AUTO);
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-archives', 'foobar'])
        .getInputChecksumArchives(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-archives', 'never'])
        .getInputChecksumArchives(),
    ).toEqual(InputChecksumArchivesMode.NEVER);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-archives', 'auto'])
        .getInputChecksumArchives(),
    ).toEqual(InputChecksumArchivesMode.AUTO);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--input-checksum-archives', 'always'])
        .getInputChecksumArchives(),
    ).toEqual(InputChecksumArchivesMode.ALWAYS);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--input-checksum-archives',
          'always',
          '--input-checksum-archives',
          'never',
        ])
        .getInputChecksumArchives(),
    ).toEqual(InputChecksumArchivesMode.NEVER);
  });

  it('should parse "dat"', async () => {
    expect(() => argumentsParser.parse(['report', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat'])).toThrow(
      /not enough arguments/i,
    );
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, 'dir2dat', '--dat', os.devNull]),
    ).toThrow(/cannot be used/i);
    await expect(
      argumentsParser.parse(dummyCommandAndRequiredArgs).scanDatFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);
    await expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', 'nonexistentfile'])
        .scanDatFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);
    await expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull])
        .scanDatFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);

    const src = await argumentsParser
      .parse([...dummyCommandAndRequiredArgs, '-d', './src'])
      .scanDatFilesWithoutExclusions();
    const test = await argumentsParser
      .parse([...dummyCommandAndRequiredArgs, '--dat', './test'])
      .scanDatFilesWithoutExclusions();
    const both = await argumentsParser
      .parse([...dummyCommandAndRequiredArgs, '--dat', './src', '-d', './test'])
      .scanDatFilesWithoutExclusions();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both).toHaveLength(src.length + test.length);
    /** Note: glob patterns are tested in {@link DATScanner} */

    await expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', 'https://www.google.com/'])
        .scanDatFilesWithoutExclusions(),
    ).resolves.toEqual(['https://www.google.com/']);
  });

  it('should parse "dat-exclude"', async () => {
    expect(
      (
        await argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat', './src'])
          .scanDatFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat', './src', '--dat-exclude', os.devNull])
          .scanDatFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([
            ...dummyCommandAndRequiredArgs,
            '--dat',
            './src',
            '--dat-exclude',
            'nonexistentfile',
          ])
          .scanDatFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat', './src', '--dat-exclude', './src'])
          .scanDatFilesWithoutExclusions()
      ).length,
    ).toEqual(0);
  });

  it('should parse "dat-name-regex"', async () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDatNameRegex()).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', '[a-z]'])
        .getDatNameRegex()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', '[a-z]'])
        .getDatNameRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', '/[a-z]/i'])
        .getDatNameRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat-name-regex',
          '/[a-z]/i',
          '--dat-name-regex',
          '[0-9]',
        ])
        .getDatNameRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', tempFile])
          .getDatNameRegex()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', tempFile])
          .getDatNameRegex()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', tempFile])
          .getDatNameRegex()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', tempFile])
          .getDatNameRegex()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex', tempFile])
          .getDatNameRegex()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "dat-name-regex-exclude"', async () => {
    expect(
      argumentsParser.parse(dummyCommandAndRequiredArgs).getDatNameRegexExclude(),
    ).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', '[a-z]'])
        .getDatNameRegexExclude()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', '[a-z]'])
        .getDatNameRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', '/[a-z]/i'])
        .getDatNameRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat-name-regex-exclude',
          '/[a-z]/i',
          '--dat-name-regex-exclude',
          '[0-9]',
        ])
        .getDatNameRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', tempFile])
          .getDatNameRegexExclude()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', tempFile])
          .getDatNameRegexExclude()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', tempFile])
          .getDatNameRegexExclude()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', tempFile])
          .getDatNameRegexExclude()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-name-regex-exclude', tempFile])
          .getDatNameRegexExclude()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "dat-description-regex"', async () => {
    expect(
      argumentsParser.parse(dummyCommandAndRequiredArgs).getDatDescriptionRegex(),
    ).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', '[a-z]'])
        .getDatDescriptionRegex()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', '[a-z]'])
        .getDatDescriptionRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', '/[a-z]/i'])
        .getDatDescriptionRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat-description-regex',
          '/[a-z]/i',
          '--dat-description-regex',
          '[0-9]',
        ])
        .getDatDescriptionRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', tempFile])
          .getDatDescriptionRegex()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', tempFile])
          .getDatDescriptionRegex()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', tempFile])
          .getDatDescriptionRegex()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', tempFile])
          .getDatDescriptionRegex()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex', tempFile])
          .getDatDescriptionRegex()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "dat-description-regex-exclude"', async () => {
    expect(
      argumentsParser.parse(dummyCommandAndRequiredArgs).getDatDescriptionRegexExclude(),
    ).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', '[a-z]'])
        .getDatDescriptionRegexExclude()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', '[a-z]'])
        .getDatDescriptionRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', '/[a-z]/i'])
        .getDatDescriptionRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat-description-regex-exclude',
          '/[a-z]/i',
          '--dat-description-regex-exclude',
          '[0-9]',
        ])
        .getDatDescriptionRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', tempFile])
          .getDatDescriptionRegexExclude()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', tempFile])
          .getDatDescriptionRegexExclude()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', tempFile])
          .getDatDescriptionRegexExclude()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', tempFile])
          .getDatDescriptionRegexExclude()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--dat-description-regex-exclude', tempFile])
          .getDatDescriptionRegexExclude()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "dat-combine"', () => {
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-combine']).getDatCombine(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-combine', 'true'])
        .getDatCombine(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-combine', 'false'])
        .getDatCombine(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-combine', '--dat-combine'])
        .getDatCombine(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-combine', 'false', '--dat-combine', 'true'])
        .getDatCombine(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-combine', 'true', '--dat-combine', 'false'])
        .getDatCombine(),
    ).toEqual(false);
  });

  it('should parse "dat-ignore-parent-clone"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-ignore-parent-clone']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dat-ignore-parent-clone'])
        .getDatIgnoreParentClone(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dat-ignore-parent-clone',
          'true',
        ])
        .getDatIgnoreParentClone(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dat-ignore-parent-clone',
          'false',
        ])
        .getDatIgnoreParentClone(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dat-ignore-parent-clone',
          '--dat-ignore-parent-clone',
        ])
        .getDatIgnoreParentClone(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dat-ignore-parent-clone',
          'false',
          '--dat-ignore-parent-clone',
          'true',
        ])
        .getDatIgnoreParentClone(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dat-ignore-parent-clone',
          'true',
          '--dat-ignore-parent-clone',
          'false',
        ])
        .getDatIgnoreParentClone(),
    ).toEqual(false);
  });

  it('should parse "patch"', async () => {
    expect(() =>
      argumentsParser.parse([
        'link',
        '--input',
        os.devNull,
        '--patch',
        os.devNull,
        '--output',
        os.devNull,
      ]),
    ).toThrow(/cannot be used/i);
    await expect(
      argumentsParser
        .parse([
          'copy',
          '--input',
          os.devNull,
          '--patch',
          'nonexistentfile',
          '--output',
          os.devNull,
        ])
        .scanPatchFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);
    await expect(
      argumentsParser
        .parse(['copy', '--input', os.devNull, '--patch', os.devNull, '--output', os.devNull])
        .scanPatchFilesWithoutExclusions(),
    ).rejects.toThrow(/no files found/i);

    const src = await argumentsParser
      .parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull])
      .scanPatchFilesWithoutExclusions();
    const test = await argumentsParser
      .parse(['copy', '--input', os.devNull, '--patch', './test', '--output', os.devNull])
      .scanPatchFilesWithoutExclusions();
    const both = await argumentsParser
      .parse([
        'copy',
        '--input',
        os.devNull,
        '--patch',
        './src',
        '-p',
        './test',
        '--output',
        os.devNull,
      ])
      .scanPatchFilesWithoutExclusions();
    expect(src.length).toBeGreaterThan(0);
    expect(test.length).toBeGreaterThan(0);
    expect(both).toHaveLength(src.length + test.length);
    /** Note: glob patterns are tested in {@link PatchScanner} */
  });

  it('should parse "patch-exclude"', async () => {
    await expect(
      async () =>
        await argumentsParser
          .parse(['copy', '--input', os.devNull, '--patch-exclude', './src'])
          .scanPatchFilesWithoutExclusions(),
    ).rejects.toThrow(/dependent|implication/i);
    expect(
      (
        await argumentsParser
          .parse(['copy', '--input', os.devNull, '--patch', './src', '--output', os.devNull])
          .scanPatchFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([
            'copy',
            '--input',
            os.devNull,
            '--patch',
            './src',
            '--output',
            os.devNull,
            '-P',
            os.devNull,
          ])
          .scanPatchFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([
            'copy',
            '--input',
            os.devNull,
            '--patch',
            './src',
            '--output',
            os.devNull,
            '-P',
            'nonexistentfile',
          ])
          .scanPatchFilesWithoutExclusions()
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([
            'copy',
            '--input',
            os.devNull,
            '--patch',
            './src',
            '--output',
            os.devNull,
            '--patch-exclude',
            './src',
          ])
          .scanPatchFilesWithoutExclusions()
      ).length,
    ).toEqual(0);
    expect(
      (
        await argumentsParser
          .parse([
            'copy',
            '--input',
            os.devNull,
            '--patch',
            './src',
            '--output',
            os.devNull,
            '--patch-exclude',
            './src',
          ])
          .scanPatchFilesWithoutExclusions()
      ).length,
    ).toEqual(0);
  });

  it('should parse "patch-only"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--patch-only']).getPatchOnly(),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--patch', os.devNull, '--patch-only'])
        .getPatchOnly(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--patch', os.devNull, '--patch-only', 'true'])
        .getPatchOnly(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--patch', os.devNull, '--patch-only', 'false'])
        .getPatchOnly(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--patch',
          os.devNull,
          '--patch-only',
          '--patch-only',
        ])
        .getPatchOnly(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--patch',
          os.devNull,
          '--patch-only',
          'false',
          '--patch-only',
          'true',
        ])
        .getPatchOnly(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--patch',
          os.devNull,
          '--patch-only',
          'true',
          '--patch-only',
          'false',
        ])
        .getPatchOnly(),
    ).toEqual(false);
  });

  it('should parse "output"', () => {
    // Test requirements per command
    expect(() => argumentsParser.parse(['test'])).toThrow(/missing required argument/i);
    expect(() => argumentsParser.parse(['copy', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['move', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['link', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['copy', 'extract', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['copy', 'zip', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(() => argumentsParser.parse(['copy', 'clean', '--input', os.devNull])).toThrow(
      /missing required argument/i,
    );
    expect(
      argumentsParser.parse(['report', '--dat', os.devNull, '--input', os.devNull]).getOutput(),
    ).toContain(Temp.getTempDir());
    // Test value
    expect(argumentsParser.parse(['copy', '--input', os.devNull, '-o', 'foo']).getOutput()).toEqual(
      'foo',
    );
    expect(
      argumentsParser.parse(['copy', '--input', os.devNull, '--output', 'foo']).getOutput(),
    ).toEqual('foo');
    expect(
      argumentsParser
        .parse(['copy', '--input', os.devNull, '--output', 'foo', '--output', 'bar'])
        .getOutput(),
    ).toEqual('bar');
  });

  it('should parse "dir-mirror"', () => {
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-mirror',
          '--dir-dat-mirror',
        ])
        .getDirDatMirror(),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-mirror']).getDirMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true'])
        .getDirMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false'])
        .getDirMirror(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-mirror', '--dir-mirror'])
        .getDirMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'false', '--dir-mirror', 'true'])
        .getDirMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-mirror', 'true', '--dir-mirror', 'false'])
        .getDirMirror(),
    ).toEqual(false);
  });

  it('should parse "dir-dat-mirror"', () => {
    expect(() =>
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-mirror',
          '--dir-dat-mirror',
        ])
        .getDirDatMirror(),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-mirror'])
        .getDirDatMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-mirror', 'true'])
        .getDirDatMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-mirror', 'false'])
        .getDirDatMirror(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-mirror',
          '--dir-dat-mirror',
        ])
        .getDirDatMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-mirror',
          'false',
          '--dir-dat-mirror',
          'true',
        ])
        .getDirDatMirror(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-mirror',
          'true',
          '--dir-dat-mirror',
          'false',
        ])
        .getDirDatMirror(),
    ).toEqual(false);
  });

  it('should parse "dir-dat-name"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-name'])).toThrow(
      /dependent|implication/i,
    );
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-D'])
        .getDirDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name'])
        .getDirDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'true'])
        .getDirDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-name', 'false'])
        .getDirDatName(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-name',
          '--dir-dat-name',
        ])
        .getDirDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-name',
          'false',
          '--dir-dat-name',
          'true',
        ])
        .getDirDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-name',
          'true',
          '--dir-dat-name',
          'false',
        ])
        .getDirDatName(),
    ).toEqual(false);
  });

  it('should parse "dir-dat-description"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-dat-description']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--dir-dat-description'])
        .getDirDatDescription(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-description',
          'true',
        ])
        .getDirDatDescription(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-description',
          'false',
        ])
        .getDirDatDescription(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-description',
          '--dir-dat-description',
        ])
        .getDirDatDescription(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-description',
          'false',
          '--dir-dat-description',
          'true',
        ])
        .getDirDatDescription(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--dir-dat-description',
          'true',
          '--dir-dat-description',
          'false',
        ])
        .getDirDatDescription(),
    ).toEqual(false);
  });

  it('should parse "dir-letter"', () => {
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter']).getDirLetter(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true'])
        .getDirLetter(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false'])
        .getDirLetter(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter'])
        .getDirLetter(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'false', '--dir-letter', 'true'])
        .getDirLetter(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', 'true', '--dir-letter', 'false'])
        .getDirLetter(),
    ).toEqual(false);
  });

  it('should parse "dir-letter-count"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-count']),
    ).toThrow(/not enough arguments/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-count', '1']),
    ).not.toThrow();
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-count', '2']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-count', '-1'])
        .getDirLetterCount(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-count', '0'])
        .getDirLetterCount(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-count', '1'])
        .getDirLetterCount(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-count', '5'])
        .getDirLetterCount(),
    ).toEqual(5);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-count',
          '5',
          '--dir-letter-count',
          '10',
        ])
        .getDirLetterCount(),
    ).toEqual(10);
  });

  it('should parse "dir-letter-limit"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-limit']),
    ).toThrow(/not enough arguments/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-limit', '1']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '-1'])
        .getDirLetterLimit(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '0'])
        .getDirLetterLimit(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '1'])
        .getDirLetterLimit(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-letter', '--dir-letter-limit', '5'])
        .getDirLetterLimit(),
    ).toEqual(5);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '5',
          '--dir-letter-limit',
          '10',
        ])
        .getDirLetterLimit(),
    ).toEqual(10);
  });

  it('should parse "dir-letter-group"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dir-letter-group']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '1',
          '--dir-letter-group',
        ])
        .getDirLetterGroup(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '1',
          '--dir-letter-group',
          'true',
        ])
        .getDirLetterGroup(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '1',
          '--dir-letter-group',
          'false',
        ])
        .getDirLetterGroup(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '1',
          '--dir-letter-group',
          '--dir-letter-group',
        ])
        .getDirLetterGroup(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '1',
          '--dir-letter-group',
          'false',
          '--dir-letter-group',
          'true',
        ])
        .getDirLetterGroup(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-letter',
          '--dir-letter-limit',
          '1',
          '--dir-letter-group',
          'true',
          '--dir-letter-group',
          'false',
        ])
        .getDirLetterGroup(),
    ).toEqual(false);
  });

  it('should parse "dir-game-subdir"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDirGameSubdir()).toEqual(
      GameSubdirMode.MULTIPLE,
    );
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-game-subdir', 'foobar'])
        .getDirGameSubdir(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-game-subdir', 'never'])
        .getDirGameSubdir(),
    ).toEqual(GameSubdirMode.NEVER);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-game-subdir', 'multiple'])
        .getDirGameSubdir(),
    ).toEqual(GameSubdirMode.MULTIPLE);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dir-game-subdir', 'always'])
        .getDirGameSubdir(),
    ).toEqual(GameSubdirMode.ALWAYS);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dir-game-subdir',
          'always',
          '--dir-game-subdir',
          'never',
        ])
        .getDirGameSubdir(),
    ).toEqual(GameSubdirMode.NEVER);
  });

  it('should parse "fix-extension"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDirGameSubdir()).toEqual(
      GameSubdirMode.MULTIPLE,
    );
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--fix-extension', 'foobar'])
        .getFixExtension(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--fix-extension', 'never'])
        .getFixExtension(),
    ).toEqual(FixExtension.NEVER);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--fix-extension', 'auto'])
        .getFixExtension(),
    ).toEqual(FixExtension.AUTO);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--fix-extension', 'always'])
        .getFixExtension(),
    ).toEqual(FixExtension.ALWAYS);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--fix-extension',
          'always',
          '--fix-extension',
          'never',
        ])
        .getFixExtension(),
    ).toEqual(FixExtension.NEVER);
  });

  it('should parse "overwrite"', () => {
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite', '--overwrite-invalid'])
        .getOverwrite(),
    ).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-O']).getOverwrite()).toEqual(
      true,
    );
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite']).getOverwrite(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true']).getOverwrite(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false'])
        .getOverwrite(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite', '--overwrite'])
        .getOverwrite(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite', 'false', '--overwrite', 'true'])
        .getOverwrite(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite', 'true', '--overwrite', 'false'])
        .getOverwrite(),
    ).toEqual(false);
  });

  it('should parse "overwrite-invalid"', () => {
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite', '--overwrite-invalid'])
        .getOverwrite(),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid'])
        .getOverwriteInvalid(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', 'true'])
        .getOverwriteInvalid(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', 'false'])
        .getOverwriteInvalid(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--overwrite-invalid', '--overwrite-invalid'])
        .getOverwriteInvalid(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--overwrite-invalid',
          'false',
          '--overwrite-invalid',
          'true',
        ])
        .getOverwriteInvalid(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--overwrite-invalid',
          'true',
          '--overwrite-invalid',
          'false',
        ])
        .getOverwriteInvalid(),
    ).toEqual(false);
  });

  it('should parse "clean-exclude"', async () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--clean-exclude', os.devNull]),
    ).toThrow(/missing required command/i);
    const argv = ['copy', '--input', os.devNull, '--output', os.devNull];
    const outputDir = './src';
    expect(
      (await argumentsParser.parse(argv).scanOutputFilesWithoutCleanExclusions([outputDir], []))
        .length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([...argv, 'clean', '-C', os.devNull])
          .scanOutputFilesWithoutCleanExclusions([outputDir], [])
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([...argv, 'clean', '-C', 'nonexistentfile'])
          .scanOutputFilesWithoutCleanExclusions([outputDir], [])
      ).length,
    ).toBeGreaterThan(0);
    expect(
      (
        await argumentsParser
          .parse([...argv, 'clean', '--clean-exclude', outputDir])
          .scanOutputFilesWithoutCleanExclusions([outputDir], [])
      ).length,
    ).toEqual(0);
    expect(
      (
        await argumentsParser
          .parse([...argv, 'clean', '--clean-exclude', outputDir])
          .scanOutputFilesWithoutCleanExclusions([outputDir], [])
      ).length,
    ).toEqual(0);
  });

  it('should parse "move-delete-dirs"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getMoveDeleteDirs()).toEqual(
      MoveDeleteDirs.AUTO,
    );
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--move-delete-dirs', 'foobar'])
        .getMoveDeleteDirs(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--move-delete-dirs', 'never'])
        .getMoveDeleteDirs(),
    ).toEqual(MoveDeleteDirs.NEVER);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--move-delete-dirs', 'auto'])
        .getMoveDeleteDirs(),
    ).toEqual(MoveDeleteDirs.AUTO);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--move-delete-dirs', 'always'])
        .getMoveDeleteDirs(),
    ).toEqual(MoveDeleteDirs.ALWAYS);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--move-delete-dirs',
          'always',
          '--move-delete-dirs',
          'never',
        ])
        .getMoveDeleteDirs(),
    ).toEqual(MoveDeleteDirs.NEVER);
  });

  it('should parse "clean-backup"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--clean-backup', 'foo']),
    ).toThrow(/missing required command/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'clean', '--clean-backup', 'foo'])
        .getCleanBackup(),
    ).toEqual('foo');
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          'clean',
          '--clean-backup',
          'foo',
          '--clean-backup',
          'bar',
        ])
        .getCleanBackup(),
    ).toEqual('bar');
  });

  it('should parse "clean-dry-run"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--clean-dry-run']),
    ).toThrow(/missing required command/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'clean', '--clean-dry-run'])
        .getCleanDryRun(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'clean', '--clean-dry-run', 'true'])
        .getCleanDryRun(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'clean', '--clean-dry-run', 'false'])
        .getCleanDryRun(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'clean', '--clean-dry-run', '--clean-dry-run'])
        .getCleanDryRun(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          'clean',
          '--clean-dry-run',
          'false',
          '--clean-dry-run',
          'true',
        ])
        .getCleanDryRun(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          'clean',
          '--clean-dry-run',
          'true',
          '--clean-dry-run',
          'false',
        ])
        .getCleanDryRun(),
    ).toEqual(false);
  });

  it('should parse "zip-format"', () => {
    expect(() =>
      argumentsParser
        .parse([
          'copy',
          'zip',
          '--input',
          os.devNull,
          '--output',
          os.devNull,
          '--zip-format',
          'foobar',
        ])
        .getZipFormat(),
    ).toThrow(/invalid value/i);
    expect(
      argumentsParser
        .parse([
          'copy',
          'zip',
          '--input',
          os.devNull,
          '--output',
          os.devNull,
          '--zip-format',
          'torrentzip',
        ])
        .getZipFormat(),
    ).toEqual(ZipFormat.TORRENTZIP);
    expect(
      argumentsParser
        .parse([
          'copy',
          'zip',
          '--input',
          os.devNull,
          '--output',
          os.devNull,
          '--zip-format',
          'rvzstd',
        ])
        .getZipFormat(),
    ).toEqual(ZipFormat.RVZSTD);
  });

  it('should parse "zip-exclude"', () => {
    const rom = new ROM({ name: 'roms/test.rom', size: 0 });
    expect(
      argumentsParser
        .parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull])
        .shouldZipRom(rom),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '-Z', os.devNull])
        .shouldZipRom(rom),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*'])
        .shouldZipRom(rom),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse(['copy', 'zip', '--input', os.devNull, '--output', os.devNull, '-Z', '**/*.rom'])
        .shouldZipRom(rom),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          'copy',
          'zip',
          '--input',
          os.devNull,
          '--output',
          os.devNull,
          '--zip-exclude',
          '**/*.rom',
        ])
        .shouldZipRom(rom),
    ).toEqual(false);
  });

  it('should parse "zip-dat-name"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--zip-dat-name'])).toThrow(
      /missing required command/i,
    );
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name'])
        .getZipDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', 'true'])
        .getZipDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', 'false'])
        .getZipDatName(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--zip-dat-name', '--zip-dat-name'])
        .getZipDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          'zip',
          '--zip-dat-name',
          'false',
          '--zip-dat-name',
          'true',
        ])
        .getZipDatName(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          'zip',
          '--zip-dat-name',
          'true',
          '--zip-dat-name',
          'false',
        ])
        .getZipDatName(),
    ).toEqual(false);
  });

  it('should parse "link-mode"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getLinkMode()).toEqual(
      LinkMode.HARDLINK,
    );
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--link-mode', 'foobar'])
        .getLinkMode(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--link-mode', 'hardlink'])
        .getLinkMode(),
    ).toEqual(LinkMode.HARDLINK);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--link-mode', 'symlink'])
        .getLinkMode(),
    ).toEqual(LinkMode.SYMLINK);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--link-mode', 'reflink'])
        .getLinkMode(),
    ).toEqual(LinkMode.REFLINK);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--link-mode', 'symlink', '--link-mode', 'reflink'])
        .getLinkMode(),
    ).toEqual(LinkMode.REFLINK);
  });

  it('should parse "symlink-relative"', () => {
    expect(() =>
      argumentsParser.parse(['link', ...dummyRequiredArgs, '--symlink-relative']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse(['link', ...dummyRequiredArgs, '--link-mode', 'symlink', '--symlink-relative'])
        .getSymlinkRelative(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          'link',
          ...dummyRequiredArgs,
          '--link-mode',
          'symlink',
          '--symlink-relative',
          'true',
        ])
        .getSymlinkRelative(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          'link',
          ...dummyRequiredArgs,
          '--link-mode',
          'symlink',
          '--symlink-relative',
          'false',
        ])
        .getSymlinkRelative(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          'link',
          ...dummyRequiredArgs,
          '--link-mode',
          'symlink',
          '--symlink-relative',
          '--symlink-relative',
        ])
        .getSymlinkRelative(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          'link',
          ...dummyRequiredArgs,
          '--link-mode',
          'symlink',
          '--symlink-relative',
          'false',
          '--symlink-relative',
          'true',
        ])
        .getSymlinkRelative(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          'link',
          ...dummyRequiredArgs,
          '--link-mode',
          'symlink',
          '--symlink-relative',
          'true',
          '--symlink-relative',
          'false',
        ])
        .getSymlinkRelative(),
    ).toEqual(false);
  });

  it('should parse "header"', () => {
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'extract', '--header', '**/*'])
        .shouldReadFileForHeader('file.rom'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--header', '**/*', '--header', 'nope'])
        .shouldReadFileForHeader('file.rom'),
    ).toEqual(false);
  });

  it('should parse "remove-headers"', () => {
    // False
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).canRemoveHeader('.smc')).toEqual(
      false,
    );
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers', '.smc'])
        .canRemoveHeader('.rom'),
    ).toEqual(false);

    // True
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, 'extract', '-H']).canRemoveHeader(''),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers'])
        .canRemoveHeader(''),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers'])
        .canRemoveHeader('.rom'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'extract', '--remove-headers'])
        .canRemoveHeader('.smc'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'extract', '-H', '.smc'])
        .canRemoveHeader('filepath.smc'),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--remove-headers', 'smc'])
        .canRemoveHeader('.smc'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--remove-headers', '.smc'])
        .canRemoveHeader('.SMC'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '-H', 'LNX,.smc'])
        .canRemoveHeader('.smc'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, 'zip', '--remove-headers', 'lnx,.LNX'])
        .canRemoveHeader('.LnX'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          'zip',
          '--remove-headers',
          'LNX',
          '--remove-headers',
          '.smc',
        ])
        .canRemoveHeader('.smc'),
    ).toEqual(true);
  });

  it('should parse "trimmed-glob"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--trimmed-glob', '**/*']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--trimmed-glob', '**/*'])
        .shouldReadFileForTrimming('file.rom'),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--trimmed-glob',
          '**/*',
          '--trimmed-glob',
          'nope',
        ])
        .shouldReadFileForTrimming('file.rom'),
    ).toEqual(false);
  });

  it('should parse "trim-scan-files"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--trim-scan-files', 'foobar']),
    ).toThrow(/choices/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--trim-scan-files', 'never'])
        .getTrimScanFiles(),
    ).toEqual(TrimScanFiles.NEVER);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--trim-scan-files', 'auto'])
        .getTrimScanFiles(),
    ).toEqual(TrimScanFiles.AUTO);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--trim-scan-files', 'always'])
        .getTrimScanFiles(),
    ).toEqual(TrimScanFiles.ALWAYS);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--trim-scan-files',
          'never',
          '--trim-scan-files',
          'always',
        ])
        .getTrimScanFiles(),
    ).toEqual(TrimScanFiles.ALWAYS);
  });

  it('should parse "trim-scan-archives"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--trim-scan-archives']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--trim-scan-archives'])
        .getTrimScanArchives(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--trim-scan-archives',
          'true',
        ])
        .getTrimScanArchives(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--trim-scan-archives',
          'false',
        ])
        .getTrimScanArchives(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--trim-scan-archives',
          '--trim-scan-archives',
        ])
        .getTrimScanArchives(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--trim-scan-archives',
          'false',
          '--trim-scan-archives',
          'true',
        ])
        .getTrimScanArchives(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--trim-scan-archives',
          'true',
          '--trim-scan-archives',
          'false',
        ])
        .getTrimScanArchives(),
    ).toEqual(false);
  });

  it('should parse "single"', () => {
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '-s'])
        .getSingle(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single'])
        .getSingle(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'true'])
        .getSingle(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', 'false'])
        .getSingle(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--single', '--single'])
        .getSingle(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--single',
          'false',
          '--single',
          'true',
        ])
        .getSingle(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--single',
          'true',
          '--single',
          'false',
        ])
        .getSingle(),
    ).toEqual(false);
  });

  it('should parse "prefer-game-regex"', async () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-game-regex', '[a-z]']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', '[a-z]'])
        .getPreferGameRegex()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', '[a-z]'])
        .getPreferGameRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', '/[a-z]/i'])
        .getPreferGameRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--single',
          '--prefer-game-regex',
          '/[a-z]/i',
          '--prefer-game-regex',
          '[0-9]',
        ])
        .getPreferGameRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', tempFile])
          .getPreferGameRegex()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', tempFile])
          .getPreferGameRegex()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', tempFile])
          .getPreferGameRegex()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', tempFile])
          .getPreferGameRegex()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-game-regex', tempFile])
          .getPreferGameRegex()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "prefer-rom-regex"', async () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-rom-regex', '[a-z]']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', '[a-z]'])
        .getPreferRomRegex()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', '[a-z]'])
        .getPreferRomRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', '/[a-z]/i'])
        .getPreferRomRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--single',
          '--prefer-rom-regex',
          '/[a-z]/i',
          '--prefer-rom-regex',
          '[0-9]',
        ])
        .getPreferRomRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', tempFile])
          .getPreferRomRegex()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', tempFile])
          .getPreferRomRegex()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', tempFile])
          .getPreferRomRegex()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', tempFile])
          .getPreferRomRegex()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-rom-regex', tempFile])
          .getPreferRomRegex()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "prefer-verified"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-verified']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-verified', '--single'])
        .getPreferVerified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-verified', 'true', '--single'])
        .getPreferVerified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-verified', 'false', '--single'])
        .getPreferVerified(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-verified',
          '--prefer-verified',
          '--single',
        ])
        .getPreferVerified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-verified',
          'false',
          '--prefer-verified',
          'true',
          '--single',
        ])
        .getPreferVerified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-verified',
          'true',
          '--prefer-verified',
          'false',
          '--single',
        ])
        .getPreferVerified(),
    ).toEqual(false);
  });

  it('should parse "prefer-good"', () => {
    expect(() => argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-good'])).toThrow(
      /dependent|implication/i,
    );
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-good', '--single'])
        .getPreferGood(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'true', '--single'])
        .getPreferGood(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-good', 'false', '--single'])
        .getPreferGood(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-good', '--prefer-good', '--single'])
        .getPreferGood(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-good',
          'false',
          '--prefer-good',
          'true',
          '--single',
        ])
        .getPreferGood(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-good',
          'true',
          '--prefer-good',
          'false',
          '--single',
        ])
        .getPreferGood(),
    ).toEqual(false);
  });

  it('should parse "prefer-language"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language']),
    ).toThrow(/not enough arguments/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-language', 'EN']),
    ).toThrow(/dependent|implication/i);
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--single',
        '--prefer-language',
        'XX',
      ]),
    ).toThrow(/invalid/i);
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--single',
        '--prefer-language',
        'EN,XX',
      ]),
    ).toThrow(/invalid/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '-l', 'EN'])
        .getPreferLanguages(),
    ).toEqual(['EN']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-language', 'EN'])
        .getPreferLanguages(),
    ).toEqual(['EN']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-language', 'EN,it'])
        .getPreferLanguages(),
    ).toEqual(['EN', 'IT']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-language', 'en,IT,JA'])
        .getPreferLanguages(),
    ).toEqual(['EN', 'IT', 'JA']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-language', 'EN,en'])
        .getPreferLanguages(),
    ).toEqual(['EN']);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--single',
          '--prefer-language',
          'EN',
          '--prefer-language',
          'fr',
        ])
        .getPreferLanguages(),
    ).toEqual(['EN', 'FR']);
  });

  it('should parse "prefer-region"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region']),
    ).toThrow(/not enough arguments/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-region', 'USA']),
    ).toThrow(/dependent|implication/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-region', 'XX']),
    ).toThrow(/invalid/i);
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--single',
        '--prefer-region',
        'EN,XX',
      ]),
    ).toThrow(/invalid/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '-r', 'USA'])
        .getPreferRegions(),
    ).toEqual(['USA']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-region', 'USA'])
        .getPreferRegions(),
    ).toEqual(['USA']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-region', 'USA,eur'])
        .getPreferRegions(),
    ).toEqual(['USA', 'EUR']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-region', 'usa,EUR,JPN'])
        .getPreferRegions(),
    ).toEqual(['USA', 'EUR', 'JPN']);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-region', 'USA,usa'])
        .getPreferRegions(),
    ).toEqual(['USA']);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--single',
          '--prefer-region',
          'USA',
          '--prefer-region',
          'jpn',
        ])
        .getPreferRegions(),
    ).toEqual(['USA', 'JPN']);
  });

  it('should parse "prefer-revision"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-revision', 'newer']),
    ).toThrow(/dependent|implication/i);
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-revision', 'foobar'])
        .getMergeRoms(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-revision', 'older'])
        .getPreferRevision(),
    ).toEqual(PreferRevision.OLDER);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--single',
          '--prefer-revision',
          'older',
          '--prefer-revision',
          'newer',
        ])
        .getPreferRevision(),
    ).toEqual(PreferRevision.NEWER);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--single', '--prefer-revision', 'newer'])
        .getPreferRevision(),
    ).toEqual(PreferRevision.NEWER);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--single',
          '--prefer-revision',
          'newer',
          '--prefer-revision',
          'older',
        ])
        .getPreferRevision(),
    ).toEqual(PreferRevision.OLDER);
  });

  it('should parse "prefer-retail"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-retail']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-retail', '--single'])
        .getPreferRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'true', '--single'])
        .getPreferRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-retail', 'false', '--single'])
        .getPreferRetail(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-retail', '--prefer-retail', '--single'])
        .getPreferRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-retail',
          'false',
          '--prefer-retail',
          'true',
          '--single',
        ])
        .getPreferRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-retail',
          'true',
          '--prefer-retail',
          'false',
          '--single',
        ])
        .getPreferRetail(),
    ).toEqual(false);
  });

  it('should parse "prefer-parent"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--prefer-parent']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-parent', '--single'])
        .getPreferParent(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'true', '--single'])
        .getPreferParent(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-parent', 'false', '--single'])
        .getPreferParent(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--prefer-parent', '--prefer-parent', '--single'])
        .getPreferParent(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-parent',
          'false',
          '--prefer-parent',
          'true',
          '--single',
        ])
        .getPreferParent(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--prefer-parent',
          'true',
          '--prefer-parent',
          'false',
          '--single',
        ])
        .getPreferParent(),
    ).toEqual(false);
  });

  it('should parse "playlist-extensions"', () => {
    expect(() => argumentsParser.parse(['playlist', '--playlist-extensions', ''])).toThrow(
      /missing required argument/i,
    );
    expect(argumentsParser.parse(['playlist']).getPlaylistExtensions()).toEqual([
      '.cue',
      '.gdi',
      '.mdf',
      '.chd',
    ]);
    expect(
      argumentsParser.parse(['playlist', '--playlist-extensions', '.cue']).getPlaylistExtensions(),
    ).toEqual(['.cue']);
    expect(
      argumentsParser
        .parse(['playlist', '--playlist-extensions', '.cue', '--playlist-extensions', 'gdi,mdf'])
        .getPlaylistExtensions(),
    ).toEqual(['.cue', '.gdi', '.mdf']);
  });

  it('should parse "merge-roms"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--merge-roms', 'merged']),
    ).toThrow(/dependent|implication/i);
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getMergeRoms()).toEqual(
      MergeMode.FULLNONMERGED,
    );
    expect(() =>
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--merge-roms', 'foobar'])
        .getMergeRoms(),
    ).toThrow(/invalid values/i);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--merge-roms',
          'fullnonmerged',
        ])
        .getMergeRoms(),
    ).toEqual(MergeMode.FULLNONMERGED);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--merge-roms', 'nonmerged'])
        .getMergeRoms(),
    ).toEqual(MergeMode.NONMERGED);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--merge-roms', 'split'])
        .getMergeRoms(),
    ).toEqual(MergeMode.SPLIT);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--merge-roms', 'merged'])
        .getMergeRoms(),
    ).toEqual(MergeMode.MERGED);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--merge-roms',
          'merged',
          '--merge-roms',
          'split',
        ])
        .getMergeRoms(),
    ).toEqual(MergeMode.SPLIT);
  });

  it('should parse "merge-discs"', () => {
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--merge-discs']).getMergeDiscs(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--merge-discs', 'true'])
        .getMergeDiscs(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--merge-discs', 'false'])
        .getMergeDiscs(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--merge-discs', '--merge-discs'])
        .getMergeDiscs(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--merge-discs', 'false', '--merge-discs', 'true'])
        .getMergeDiscs(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--merge-discs', 'true', '--merge-discs', 'false'])
        .getMergeDiscs(),
    ).toEqual(false);
  });

  it('should parse "exclude-disks"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--exclude-disks']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--exclude-disks'])
        .getExcludeDisks(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--exclude-disks', 'true'])
        .getExcludeDisks(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--exclude-disks', 'false'])
        .getExcludeDisks(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--exclude-disks',
          '--exclude-disks',
        ])
        .getExcludeDisks(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--exclude-disks',
          'false',
          '--exclude-disks',
          'true',
        ])
        .getExcludeDisks(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--exclude-disks',
          'true',
          '--exclude-disks',
          'false',
        ])
        .getExcludeDisks(),
    ).toEqual(false);
  });

  it('should parse "allow-excess-sets"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--allow-excess-sets']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--allow-excess-sets'])
        .getAllowExcessSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--allow-excess-sets', 'true'])
        .getAllowExcessSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-excess-sets',
          'false',
        ])
        .getAllowExcessSets(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-excess-sets',
          '--allow-excess-sets',
        ])
        .getAllowExcessSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-excess-sets',
          'false',
          '--allow-excess-sets',
          'true',
        ])
        .getAllowExcessSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-excess-sets',
          'true',
          '--allow-excess-sets',
          'false',
        ])
        .getAllowExcessSets(),
    ).toEqual(false);
  });

  it('should parse "allow-incomplete-sets"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--allow-incomplete-sets']),
    ).toThrow(/dependent|implication/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat', os.devNull, '--allow-incomplete-sets'])
        .getAllowIncompleteSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-incomplete-sets',
          'true',
        ])
        .getAllowIncompleteSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-incomplete-sets',
          'false',
        ])
        .getAllowIncompleteSets(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-incomplete-sets',
          '--allow-incomplete-sets',
        ])
        .getAllowIncompleteSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-incomplete-sets',
          'false',
          '--allow-incomplete-sets',
          'true',
        ])
        .getAllowIncompleteSets(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--allow-incomplete-sets',
          'true',
          '--allow-incomplete-sets',
          'false',
        ])
        .getAllowIncompleteSets(),
    ).toEqual(false);
  });

  it('should parse "filter-regex"', async () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getFilterRegex()).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-regex', '[a-z]'])
        .getFilterRegex()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-regex', '[a-z]'])
        .getFilterRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-regex', '/[a-z]/i'])
        .getFilterRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--filter-regex',
          '/[a-z]/i',
          '--filter-regex',
          '[0-9]',
        ])
        .getFilterRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex', tempFile])
          .getFilterRegex()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex', tempFile])
          .getFilterRegex()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex', tempFile])
          .getFilterRegex()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex', tempFile])
          .getFilterRegex()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex', tempFile])
          .getFilterRegex()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "filter-regex-exclude"', async () => {
    expect(
      argumentsParser.parse(dummyCommandAndRequiredArgs).getFilterRegexExclude(),
    ).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '[a-z]'])
        .getFilterRegexExclude()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '[a-z]'])
        .getFilterRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', '/[a-z]/i'])
        .getFilterRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--filter-regex-exclude',
          '/[a-z]/i',
          '--filter-regex-exclude',
          '[0-9]',
        ])
        .getFilterRegexExclude()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', tempFile])
          .getFilterRegexExclude()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', tempFile])
          .getFilterRegexExclude()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', tempFile])
          .getFilterRegexExclude()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', tempFile])
          .getFilterRegexExclude()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([...dummyCommandAndRequiredArgs, '--filter-regex-exclude', tempFile])
          .getFilterRegexExclude()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "filter-language"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-language']),
    ).toThrow(/not enough arguments/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-language', 'XX']),
    ).toThrow(/invalid/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-language', 'EN,XX']),
    ).toThrow(/invalid/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '-L', 'EN']).getFilterLanguage(),
    ).toEqual(new Set(['EN']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-language', 'EN'])
        .getFilterLanguage(),
    ).toEqual(new Set(['EN']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-language', 'EN,it'])
        .getFilterLanguage(),
    ).toEqual(new Set(['EN', 'IT']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-language', 'en,IT,JA'])
        .getFilterLanguage(),
    ).toEqual(new Set(['EN', 'IT', 'JA']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-language', 'EN,en'])
        .getFilterLanguage(),
    ).toEqual(new Set(['EN']));
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--filter-language',
          'EN',
          '--filter-language',
          'fr',
        ])
        .getFilterLanguage(),
    ).toEqual(new Set(['EN', 'FR']));
  });

  it('should parse "filter-region"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-region']),
    ).toThrow(/not enough arguments/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-region', 'XYZ']),
    ).toThrow(/invalid/i);
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--filter-region', 'USA,XYZ']),
    ).toThrow(/invalid/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '-R', 'USA']).getFilterRegion(),
    ).toEqual(new Set(['USA']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-region', 'USA'])
        .getFilterRegion(),
    ).toEqual(new Set(['USA']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-region', 'USA,eur'])
        .getFilterRegion(),
    ).toEqual(new Set(['USA', 'EUR']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-region', 'usa,EUR,JPN'])
        .getFilterRegion(),
    ).toEqual(new Set(['USA', 'EUR', 'JPN']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-region', 'USA,usa'])
        .getFilterRegion(),
    ).toEqual(new Set(['USA']));
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--filter-region', 'USA', '--filter-region', 'jpn'])
        .getFilterRegion(),
    ).toEqual(new Set(['USA', 'JPN']));
  });

  it('should parse "filter-category-regex"', async () => {
    expect(
      argumentsParser.parse(dummyCommandAndRequiredArgs).getFilterCategoryRegex(),
    ).toBeUndefined();
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--filter-category-regex',
          '[a-z]',
        ])
        .getFilterCategoryRegex()
        ?.some((regex) => regex.test('lower')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--filter-category-regex',
          '[a-z]',
        ])
        .getFilterCategoryRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--filter-category-regex',
          '/[a-z]/i',
        ])
        .getFilterCategoryRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--dat',
          os.devNull,
          '--filter-category-regex',
          '/[a-z]/i',
          '--filter-category-regex',
          '[0-9]',
        ])
        .getFilterCategoryRegex()
        ?.some((regex) => regex.test('UPPER')),
    ).toEqual(false);

    const tempFile = await FsPoly.mktemp(path.join(Temp.getTempDir(), 'temp'));
    await FsPoly.mkdir(path.dirname(tempFile), { recursive: true });
    try {
      await FsPoly.writeFile(tempFile, '\n/[a-z]/i\r\n[0-9]\n\n');
      expect(
        argumentsParser
          .parse([
            ...dummyCommandAndRequiredArgs,
            '--dat',
            os.devNull,
            '--filter-category-regex',
            tempFile,
          ])
          .getFilterCategoryRegex()
          ?.some((regex) => regex.test('')),
      ).toEqual(false);
      expect(
        argumentsParser
          .parse([
            ...dummyCommandAndRequiredArgs,
            '--dat',
            os.devNull,
            '--filter-category-regex',
            tempFile,
          ])
          .getFilterCategoryRegex()
          ?.some((regex) => regex.test('lower')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([
            ...dummyCommandAndRequiredArgs,
            '--dat',
            os.devNull,
            '--filter-category-regex',
            tempFile,
          ])
          .getFilterCategoryRegex()
          ?.some((regex) => regex.test('UPPER')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([
            ...dummyCommandAndRequiredArgs,
            '--dat',
            os.devNull,
            '--filter-category-regex',
            tempFile,
          ])
          .getFilterCategoryRegex()
          ?.some((regex) => regex.test('007')),
      ).toEqual(true);
      expect(
        argumentsParser
          .parse([
            ...dummyCommandAndRequiredArgs,
            '--dat',
            os.devNull,
            '--filter-category-regex',
            tempFile,
          ])
          .getFilterCategoryRegex()
          ?.some((regex) => regex.test('@!#?@!')),
      ).toEqual(false);
    } finally {
      await FsPoly.rm(tempFile);
    }
  });

  it('should parse "no-bios"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--only-bios']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios']).getNoBios(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true']).getNoBios(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false']).getNoBios(),
    ).toEqual(false);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bios', '--no-bios']).getNoBios(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-bios', 'false', '--no-bios', 'true'])
        .getNoBios(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-bios', 'true', '--no-bios', 'false'])
        .getNoBios(),
    ).toEqual(false);
  });

  it('should parse "only-bios"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', '--no-bios']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios']).getOnlyBios(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true']).getOnlyBios(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false']).getOnlyBios(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-bios', '--only-bios'])
        .getOnlyBios(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-bios', 'false', '--only-bios', 'true'])
        .getOnlyBios(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-bios', 'true', '--only-bios', 'false'])
        .getOnlyBios(),
    ).toEqual(false);
  });

  it('should parse "no-device"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', '--only-device']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device']).getNoDevice(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', 'true']).getNoDevice(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-device', 'false']).getNoDevice(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-device', '--no-device'])
        .getNoDevice(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-device', 'false', '--no-device', 'true'])
        .getNoDevice(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-device', 'true', '--no-device', 'false'])
        .getNoDevice(),
    ).toEqual(false);
  });

  it('should parse "only-device"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device', '--no-device']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-device']).getOnlyDevice(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-device', 'true'])
        .getOnlyDevice(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-device', 'false'])
        .getOnlyDevice(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-device', '--only-device'])
        .getOnlyDevice(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-device', 'false', '--only-device', 'true'])
        .getOnlyDevice(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-device', 'true', '--only-device', 'false'])
        .getOnlyDevice(),
    ).toEqual(false);
  });

  it('should parse "no-unlicensed"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--no-unlicensed',
        '--only-unlicensed',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unlicensed']).getNoUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'true'])
        .getNoUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', 'false'])
        .getNoUnlicensed(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-unlicensed', '--no-unlicensed'])
        .getNoUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-unlicensed',
          'false',
          '--no-unlicensed',
          'true',
        ])
        .getNoUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-unlicensed',
          'true',
          '--no-unlicensed',
          'false',
        ])
        .getNoUnlicensed(),
    ).toEqual(false);
  });

  it('should parse "only-unlicensed"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--only-unlicensed',
        '--no-unlicensed',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unlicensed'])
        .getOnlyUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', 'true'])
        .getOnlyUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', 'false'])
        .getOnlyUnlicensed(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unlicensed', '--only-unlicensed'])
        .getOnlyUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-unlicensed',
          'false',
          '--only-unlicensed',
          'true',
        ])
        .getOnlyUnlicensed(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-unlicensed',
          'true',
          '--only-unlicensed',
          'false',
        ])
        .getOnlyUnlicensed(),
    ).toEqual(false);
  });

  it('should parse "only-retail"', () => {
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-retail']).getOnlyRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true'])
        .getOnlyRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false'])
        .getOnlyRetail(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-retail', '--only-retail'])
        .getOnlyRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-retail', 'false', '--only-retail', 'true'])
        .getOnlyRetail(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-retail', 'true', '--only-retail', 'false'])
        .getOnlyRetail(),
    ).toEqual(false);
  });

  it('should parse "no-debug"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', '--only-debug']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug']).getNoDebug(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', 'true']).getNoDebug(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-debug', 'false']).getNoDebug(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-debug', '--no-debug'])
        .getNoDebug(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-debug', 'false', '--no-debug', 'true'])
        .getNoDebug(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-debug', 'true', '--no-debug', 'false'])
        .getNoDebug(),
    ).toEqual(false);
  });

  it('should parse "only-debug"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug', '--no-debug']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-debug']).getOnlyDebug(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-debug', 'true'])
        .getOnlyDebug(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-debug', 'false'])
        .getOnlyDebug(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-debug', '--only-debug'])
        .getOnlyDebug(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-debug', 'false', '--only-debug', 'true'])
        .getOnlyDebug(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-debug', 'true', '--only-debug', 'false'])
        .getOnlyDebug(),
    ).toEqual(false);
  });

  it('should parse "no-demo"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--only-demo']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo']).getNoDemo(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true']).getNoDemo(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false']).getNoDemo(),
    ).toEqual(false);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-demo', '--no-demo']).getNoDemo(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-demo', 'false', '--no-demo', 'true'])
        .getNoDemo(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-demo', 'true', '--no-demo', 'false'])
        .getNoDemo(),
    ).toEqual(false);
  });

  it('should parse "only-demo"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', '--no-demo']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo']).getOnlyDemo(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', 'true']).getOnlyDemo(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-demo', 'false']).getOnlyDemo(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-demo', '--only-demo'])
        .getOnlyDemo(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-demo', 'false', '--only-demo', 'true'])
        .getOnlyDemo(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-demo', 'true', '--only-demo', 'false'])
        .getOnlyDemo(),
    ).toEqual(false);
  });

  it('should parse "no-beta"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--only-beta']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta']).getNoBeta(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true']).getNoBeta(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false']).getNoBeta(),
    ).toEqual(false);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-beta', '--no-beta']).getNoBeta(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-beta', 'false', '--no-beta', 'true'])
        .getNoBeta(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-beta', 'true', '--no-beta', 'false'])
        .getNoBeta(),
    ).toEqual(false);
  });

  it('should parse "only-beta"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', '--no-beta']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta']).getOnlyBeta(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', 'true']).getOnlyBeta(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-beta', 'false']).getOnlyBeta(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-beta', '--only-beta'])
        .getOnlyBeta(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-beta', 'false', '--only-beta', 'true'])
        .getOnlyBeta(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-beta', 'true', '--only-beta', 'false'])
        .getOnlyBeta(),
    ).toEqual(false);
  });

  it('should parse "no-sample"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', '--only-sample']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample']).getNoSample(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true']).getNoSample(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false']).getNoSample(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-sample', '--no-sample'])
        .getNoSample(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-sample', 'false', '--no-sample', 'true'])
        .getNoSample(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-sample', 'true', '--no-sample', 'false'])
        .getNoSample(),
    ).toEqual(false);
  });

  it('should parse "only-sample"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample', '--no-sample']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-sample']).getOnlySample(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-sample', 'true'])
        .getOnlySample(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-sample', 'false'])
        .getOnlySample(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-sample', '--only-sample'])
        .getOnlySample(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-sample', 'false', '--only-sample', 'true'])
        .getOnlySample(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-sample', 'true', '--only-sample', 'false'])
        .getOnlySample(),
    ).toEqual(false);
  });

  it('should parse "no-prototype"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--only-prototype']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-prototype']).getNoPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'true'])
        .getNoPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-prototype', 'false'])
        .getNoPrototype(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-prototype', '--no-prototype'])
        .getNoPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-prototype',
          'false',
          '--no-prototype',
          'true',
        ])
        .getNoPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-prototype',
          'true',
          '--no-prototype',
          'false',
        ])
        .getNoPrototype(),
    ).toEqual(false);
  });

  it('should parse "only-prototype"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-prototype', '--no-prototype']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-prototype'])
        .getOnlyPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-prototype', 'true'])
        .getOnlyPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-prototype', 'false'])
        .getOnlyPrototype(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-prototype', '--only-prototype'])
        .getOnlyPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-prototype',
          'false',
          '--only-prototype',
          'true',
        ])
        .getOnlyPrototype(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-prototype',
          'true',
          '--only-prototype',
          'false',
        ])
        .getOnlyPrototype(),
    ).toEqual(false);
  });

  it('should parse "no-program-roms"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-program', '--only-program']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-program']).getNoProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-program', 'true'])
        .getNoProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-program', 'false'])
        .getNoProgram(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-program', '--no-program'])
        .getNoProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-program', 'false', '--no-program', 'true'])
        .getNoProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-program', 'true', '--no-program', 'false'])
        .getNoProgram(),
    ).toEqual(false);
  });

  it('should parse "only-program"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-program', '--no-program']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-program']).getOnlyProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-program', 'true'])
        .getOnlyProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-program', 'false'])
        .getOnlyProgram(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-program', '--only-program'])
        .getOnlyProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-program',
          'false',
          '--only-program',
          'true',
        ])
        .getOnlyProgram(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-program',
          'true',
          '--only-program',
          'false',
        ])
        .getOnlyProgram(),
    ).toEqual(false);
  });

  it('should parse "no-aftermarket"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--no-aftermarket',
        '--only-aftermarket',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-aftermarket'])
        .getNoAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'true'])
        .getNoAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', 'false'])
        .getNoAftermarket(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-aftermarket', '--no-aftermarket'])
        .getNoAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-aftermarket',
          'false',
          '--no-aftermarket',
          'true',
        ])
        .getNoAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-aftermarket',
          'true',
          '--no-aftermarket',
          'false',
        ])
        .getNoAftermarket(),
    ).toEqual(false);
  });

  it('should parse "only-aftermarket"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--only-aftermarket',
        '--no-aftermarket',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-aftermarket'])
        .getOnlyAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', 'true'])
        .getOnlyAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', 'false'])
        .getOnlyAftermarket(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-aftermarket', '--only-aftermarket'])
        .getOnlyAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-aftermarket',
          'false',
          '--only-aftermarket',
          'true',
        ])
        .getOnlyAftermarket(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-aftermarket',
          'true',
          '--only-aftermarket',
          'false',
        ])
        .getOnlyAftermarket(),
    ).toEqual(false);
  });

  it('should parse "no-homebrew"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--only-homebrew']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-homebrew']).getNoHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true'])
        .getNoHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false'])
        .getNoHomebrew(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-homebrew', '--no-homebrew'])
        .getNoHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'false', '--no-homebrew', 'true'])
        .getNoHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-homebrew', 'true', '--no-homebrew', 'false'])
        .getNoHomebrew(),
    ).toEqual(false);
  });

  it('should parse "only-homebrew"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew', '--no-homebrew']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-homebrew']).getOnlyHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-homebrew', 'true'])
        .getOnlyHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-homebrew', 'false'])
        .getOnlyHomebrew(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-homebrew', '--only-homebrew'])
        .getOnlyHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-homebrew',
          'false',
          '--only-homebrew',
          'true',
        ])
        .getOnlyHomebrew(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-homebrew',
          'true',
          '--only-homebrew',
          'false',
        ])
        .getOnlyHomebrew(),
    ).toEqual(false);
  });

  it('should parse "no-unverified"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--no-unverified',
        '--only-unverified',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-unverified']).getNoUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'true'])
        .getNoUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-unverified', 'false'])
        .getNoUnverified(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-unverified', '--no-unverified'])
        .getNoUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-unverified',
          'false',
          '--no-unverified',
          'true',
        ])
        .getNoUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--no-unverified',
          'true',
          '--no-unverified',
          'false',
        ])
        .getNoUnverified(),
    ).toEqual(false);
  });

  it('should parse "only-unverified"', () => {
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--only-unverified',
        '--no-unverified',
      ]),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unverified'])
        .getOnlyUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unverified', 'true'])
        .getOnlyUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unverified', 'false'])
        .getOnlyUnverified(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-unverified', '--only-unverified'])
        .getOnlyUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-unverified',
          'false',
          '--only-unverified',
          'true',
        ])
        .getOnlyUnverified(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--only-unverified',
          'true',
          '--only-unverified',
          'false',
        ])
        .getOnlyUnverified(),
    ).toEqual(false);
  });

  it('should parse "no-bad"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--only-bad']),
    ).toThrow(/mutually exclusive/i);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad']).getNoBad()).toEqual(
      true,
    );
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true']).getNoBad(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false']).getNoBad(),
    ).toEqual(false);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--no-bad', '--no-bad']).getNoBad(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-bad', 'false', '--no-bad', 'true'])
        .getNoBad(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--no-bad', 'true', '--no-bad', 'false'])
        .getNoBad(),
    ).toEqual(false);
  });

  it('should parse "only-bad"', () => {
    expect(() =>
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', '--no-bad']),
    ).toThrow(/mutually exclusive/i);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad']).getOnlyBad(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', 'true']).getOnlyBad(),
    ).toEqual(true);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--only-bad', 'false']).getOnlyBad(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-bad', '--only-bad'])
        .getOnlyBad(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-bad', 'false', '--only-bad', 'true'])
        .getOnlyBad(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--only-bad', 'true', '--only-bad', 'false'])
        .getOnlyBad(),
    ).toEqual(false);
  });

  it('should parse "dir2dat-output"', () => {
    expect(argumentsParser.parse(['dir2dat', '--input', os.devNull]).getDir2DatOutput()).toEqual(
      process.cwd(),
    );
    expect(
      argumentsParser
        .parse(['copy', 'dir2dat', '--input', os.devNull, '--output', os.tmpdir()])
        .getDir2DatOutput(),
    ).toEqual(os.tmpdir());
    expect(
      argumentsParser
        .parse(['dir2dat', '--input', os.devNull, '--dir2dat-output', os.tmpdir()])
        .getDir2DatOutput(),
    ).toEqual(os.tmpdir());
  });

  it('should parse "fixdat-output"', () => {
    expect(
      argumentsParser
        .parse(['fixdat', '--input', os.devNull, '--dat', os.devNull])
        .getFixdatOutput(),
    ).toEqual(process.cwd());
    expect(
      argumentsParser
        .parse([
          'copy',
          'fixdat',
          '--input',
          os.devNull,
          '--output',
          os.tmpdir(),
          '--dat',
          os.devNull,
        ])
        .getFixdatOutput(),
    ).toEqual(os.tmpdir());
    expect(
      argumentsParser
        .parse([
          'fixdat',
          '--input',
          os.devNull,
          '--dat',
          os.devNull,
          '--fixdat-output',
          os.tmpdir(),
        ])
        .getFixdatOutput(),
    ).toEqual(os.tmpdir());
  });

  it('should parse "report-output"', () => {
    expect(argumentsParser.parse(['report', '--dat', os.devNull]).getReportOutput()).toMatch(
      /igir_[0-9]{4}-[0-9]{2}-[0-9]{2}/,
    );
    expect(
      argumentsParser
        .parse(['report', '--dat', os.devNull, '--report-output', 'report.csv'])
        .getReportOutput(),
    ).toEqual('report.csv');
    expect(
      argumentsParser
        .parse([
          'report',
          '--dat',
          os.devNull,
          '--report-output',
          '%dddd, %MMMM %Do %YYYY, %h:%mm:%ss %a.csv',
        ])
        .getReportOutput(),
    ).toMatch(/[A-Z][a-z]+, [A-Z][a-z]+ [0-9]{1,2}[a-z]{2} [0-9]{4},/);
  });

  it('should parse "dat-threads"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getDatThreads()).toEqual(
      Defaults.DAT_DEFAULT_THREADS,
    );
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-threads', '-1'])
        .getDatThreads(),
    ).toEqual(1);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '0']).getDatThreads(),
    ).toEqual(1);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '1']).getDatThreads(),
    ).toEqual(1);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--dat-threads', '2']).getDatThreads(),
    ).toEqual(2);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--dat-threads', '2', '--dat-threads', '3'])
        .getDatThreads(),
    ).toEqual(3);
  });

  it('should parse "reader-threads"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getReaderThreads()).toEqual(8);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--reader-threads', '-1'])
        .getReaderThreads(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--reader-threads', '0'])
        .getReaderThreads(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--reader-threads', '1'])
        .getReaderThreads(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--reader-threads', '2'])
        .getReaderThreads(),
    ).toEqual(2);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--reader-threads', '2', '--reader-threads', '3'])
        .getReaderThreads(),
    ).toEqual(3);
  });

  it('should parse "writer-threads"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getWriterThreads()).toEqual(4);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--writer-threads', '-1'])
        .getWriterThreads(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--writer-threads', '0'])
        .getWriterThreads(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--writer-threads', '1'])
        .getWriterThreads(),
    ).toEqual(1);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--writer-threads', '2'])
        .getWriterThreads(),
    ).toEqual(2);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--writer-threads', '2', '--writer-threads', '3'])
        .getWriterThreads(),
    ).toEqual(3);
  });

  it('should parse "write-retry"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getWriteRetry()).toEqual(2);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--write-retry', '-1'])
        .getWriteRetry(),
    ).toEqual(0);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--write-retry', '0']).getWriteRetry(),
    ).toEqual(0);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--write-retry', '1']).getWriteRetry(),
    ).toEqual(1);
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--write-retry', '2']).getWriteRetry(),
    ).toEqual(2);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--write-retry', '2', '--write-retry', '3'])
        .getWriteRetry(),
    ).toEqual(3);
  });

  it('should parse "disable-cache"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs]).getDisableCache()).toEqual(
      false,
    );
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--disable-cache']).getDisableCache(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--disable-cache', 'true'])
        .getDisableCache(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--disable-cache', 'false'])
        .getDisableCache(),
    ).toEqual(false);
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--disable-cache', '--disable-cache'])
        .getDisableCache(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--disable-cache',
          'false',
          '--disable-cache',
          'true',
        ])
        .getDisableCache(),
    ).toEqual(true);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--disable-cache',
          'true',
          '--disable-cache',
          'false',
        ])
        .getDisableCache(),
    ).toEqual(false);
  });

  it('should parse "cache-path"', () => {
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs]).getCachePath()).toBeUndefined();
    expect(
      argumentsParser
        .parse([...dummyCommandAndRequiredArgs, '--cache-path', os.devNull])
        .getCachePath(),
    ).toEqual(os.devNull);
    expect(
      argumentsParser
        .parse([
          ...dummyCommandAndRequiredArgs,
          '--cache-path',
          os.devNull,
          '--cache-path',
          'igir.cache',
        ])
        .getCachePath(),
    ).toEqual('igir.cache');
    expect(() =>
      argumentsParser.parse([
        ...dummyCommandAndRequiredArgs,
        '--disable-cache',
        '--cache-path',
        os.devNull,
      ]),
    ).toThrow(/mutually exclusive/i);
  });

  it('should parse "verbose"', () => {
    expect(argumentsParser.parse(dummyCommandAndRequiredArgs).getLogLevel()).toEqual(LogLevel.WARN);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-v']).getLogLevel()).toEqual(
      LogLevel.INFO,
    );
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '--verbose']).getLogLevel(),
    ).toEqual(LogLevel.INFO);
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-vv']).getLogLevel()).toEqual(
      LogLevel.DEBUG,
    );
    expect(argumentsParser.parse([...dummyCommandAndRequiredArgs, '-vvv']).getLogLevel()).toEqual(
      LogLevel.TRACE,
    );
    expect(
      argumentsParser.parse([...dummyCommandAndRequiredArgs, '-vvvvvvvvvv']).getLogLevel(),
    ).toEqual(LogLevel.TRACE);
  });

  it('should parse "help"', () => {
    expect(argumentsParser.parse(['-h']).getHelp()).toEqual(true);
    expect(argumentsParser.parse(['--help']).getHelp()).toEqual(true);
    expect(argumentsParser.parse(['--help', '100']).getHelp()).toEqual(true);
  });
});
