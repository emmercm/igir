// eslint-disable-next-line max-classes-per-file
import path, { ParsedPath } from 'node:path';

import fsPoly from '../polyfill/fsPoly.js';
import DAT from './dats/dat.js';
import Game from './dats/game.js';
import Release from './dats/release.js';
import ROM from './dats/rom.js';
import ArchiveEntry from './files/archives/archiveEntry.js';
import File from './files/file.js';
import FileFactory from './files/fileFactory.js';
import GameConsole from './gameConsole.js';
import Options, { GameSubdirMode } from './options.js';

/**
 * A {@link ParsedPath} that carries {@link ArchiveEntry} path information.
 */
interface ParsedPathWithEntryPath extends ParsedPath {
  entryPath: string;
}

/**
 * A {@link ParsedPathWithEntryPath} that normalizes formatting across OSes.
 */
class OutputPath implements ParsedPathWithEntryPath {
  base: string;

  dir: string;

  ext: string;

  // NOTE(cemmer): this class differs from {@link ParsedPath} crucially in that the "name" here
  // may contain {@link path.sep} in it on purpose. That's fine, because {@link path.format} handles
  // it gracefully.
  name: string;

  root: string;

  entryPath: string;

  constructor(parsedPath: ParsedPathWithEntryPath) {
    this.base = parsedPath.base.replace(/[\\/]/g, path.sep);
    this.dir = parsedPath.dir.replace(/[\\/]/g, path.sep);
    this.ext = parsedPath.ext.replace(/[\\/]/g, path.sep);
    this.name = parsedPath.name.replace(/[\\/]/g, path.sep);
    this.root = parsedPath.root.replace(/[\\/]/g, path.sep);
    this.entryPath = parsedPath.entryPath.replace(/[\\/]/g, path.sep);
  }

  /**
   * Format this {@link OutputPath}, similar to {@link path#format}.
   */
  format(): string {
    return path.format(this)
      // No double slashes / empty subdir name
      .replace(/\/{2,}/g, path.sep) // unix
      .replace(/(?<!^\\*)\\{2,}/, path.sep) // windows, preserving network paths
      // No trailing slashes
      .replace(/[\\/]+$/, '');
  }
}

/**
 * A factory of static methods to generate output paths for a {@link ROM} and its related
 * {@link Game} and {@link Release}.
 */
export default class OutputFactory {
  /**
   * Get the full output path for a ROM file.
   * @param options the {@link Options} instance for this run of igir.
   * @param dat the {@link DAT} that the ROM/{@link Game} is from.
   * @param game the {@link Game} that this file matches to.
   * @param release a {@link Release} from the {@link Game}.
   * @param rom a {@link ROM} from the {@link Game}.
   * @param inputFile a {@link File} that matches the {@link ROM}.
   * @param romBasenames the intended output basenames for every ROM from this {@link DAT}.
   */
  static getPath(
    options: Options,
    dat: DAT,
    game: Game,
    release: Release | undefined,
    rom: ROM,
    inputFile: File,
    romBasenames?: string[],
  ): OutputPath {
    const name = this.getName(options, dat, game, rom, inputFile);
    const ext = this.getExt(options, dat, game, rom, inputFile);
    const basename = name + ext;

    return new OutputPath({
      root: '',
      dir: this.getDir(options, dat, game, release, inputFile, basename, romBasenames),
      base: '',
      name,
      ext,
      entryPath: this.getEntryPath(options, dat, game, rom, inputFile),
    });
  }

  /**
   **************************
   *
   *     File directory     *
   *
   * *************************
   */

  public static getDir(
    options: Options,
    dat: DAT,
    game?: Game,
    release?: Release,
    inputFile?: File,
    romBasename?: string,
    romBasenames?: string[],
  ): string {
    let output = options.getOutput();

    // Replace all {token}s in the output path
    output = fsPoly.makeLegal(OutputFactory.replaceTokensInOutputPath(
      output,
      dat,
      inputFile?.getFilePath(),
      game,
      release,
      romBasename,
    ));

    if (options.getDirMirror() && inputFile?.getFilePath()) {
      const mirroredDir = path.dirname(inputFile.getFilePath())
        .replace(/[\\/]/g, path.sep)
        .split(path.sep)
        .splice(1)
        .join(path.sep);
      output = path.join(output, mirroredDir);
    }

    if (options.getDirDatName() && dat.getNameShort()) {
      output = path.join(output, dat.getNameShort());
    }
    if (options.getDirDatDescription() && dat.getDescription()) {
      output = path.join(output, dat.getDescription() as string);
    }

    const dirLetter = this.getDirLetterParsed(options, romBasename, romBasenames);
    if (dirLetter) {
      output = path.join(output, dirLetter);
    }

    return fsPoly.makeLegal(output);
  }

  private static replaceTokensInOutputPath(
    outputPath: string,
    dat: DAT,
    inputRomPath?: string,
    game?: Game,
    release?: Release,
    outputRomFilename?: string,
  ): string {
    let result = outputPath;
    // NOTE(cemmer): order here is important! They should go most specific to least
    result = this.replaceReleaseTokens(result, release);
    result = this.replaceGameTokens(result, game);
    result = this.replaceDatTokens(result, dat);
    result = this.replaceInputTokens(result, inputRomPath);
    result = this.replaceOutputTokens(result, outputRomFilename);
    result = this.replaceOutputGameConsoleTokens(result, dat, outputRomFilename);

    const leftoverTokens = result.match(/\{[a-zA-Z]+\}/g);
    if (leftoverTokens !== null && leftoverTokens.length) {
      throw new Error(`failed to replace output token${leftoverTokens.length !== 1 ? 's' : ''}: ${leftoverTokens.join(', ')}`);
    }

    return result;
  }

  private static replaceReleaseTokens(input: string, release?: Release): string {
    if (!release) {
      return input;
    }

    let output = input;
    output = output.replace('{gameRegion}', release.getRegion());
    output = output.replace('{datReleaseRegion}', release.getRegion()); // deprecated

    const releaseLanguage = release.getLanguage();
    if (releaseLanguage) {
      output = output.replace('{gameLanguage}', releaseLanguage);
      output = output.replace('{datReleaseLanguage}', releaseLanguage); // deprecated
    }

    return output;
  }

  private static replaceGameTokens(input: string, game?: Game): string {
    if (!game) {
      return input;
    }

    let output = input;
    output = output.replace('{gameType}', game.getGameType());

    const gameRegion = game.getRegions().find(() => true);
    if (gameRegion) {
      output = output.replace('{gameRegion}', gameRegion);
    }

    const gameLanguage = game.getLanguages().find(() => true);
    if (gameLanguage) {
      output = output.replace('{gameLanguage}', gameLanguage);
    }

    return output;
  }

  private static replaceDatTokens(input: string, dat: DAT): string {
    let output = input;
    output = output.replace('{datName}', dat.getName().replace(/[\\/]/g, '_'));

    const description = dat.getDescription();
    if (description) {
      output = output.replace('{datDescription}', description.replace(/[\\/]/g, '_'));
    }

    return output;
  }

  private static replaceInputTokens(input: string, inputRomPath?: string): string {
    if (!inputRomPath) {
      return input;
    }

    return input.replace('{inputDirname}', path.parse(inputRomPath).dir);
  }

  private static replaceOutputTokens(input: string, outputRomFilename?: string): string {
    if (!outputRomFilename) {
      return input;
    }

    const outputRom = path.parse(outputRomFilename);
    return input
      .replace('{outputBasename}', outputRom.base)
      .replace('{outputName}', outputRom.name)
      .replace('{outputExt}', outputRom.ext.replace(/^\./, ''));
  }

  private static replaceOutputGameConsoleTokens(
    input: string,
    dat?: DAT,
    outputRomFilename?: string,
  ): string {
    if (!outputRomFilename) {
      return input;
    }

    const gameConsole = GameConsole.getForDatName(dat?.getName() ?? '')
        ?? GameConsole.getForFilename(outputRomFilename);
    if (!gameConsole) {
      return input;
    }

    let output = input;

    const pocket = gameConsole.getPocket();
    if (pocket) {
      output = output.replace('{pocket}', pocket);
    }

    const mister = gameConsole.getMister();
    if (mister) {
      output = output.replace('{mister}', mister);
    }

    const onion = gameConsole.getOnion();
    if (onion) {
      output = output.replace('{onion}', onion);
    }

    const batocera = gameConsole.getBatocera();
    if (batocera) {
      output = output.replace('{batocera}', batocera);
    }
    return output;
  }

  private static getDirLetterParsed(
    options: Options,
    romBasename?: string,
    romBasenames?: string[],
  ): string | undefined {
    if (!romBasename || !options.getDirLetter()) {
      return undefined;
    }

    // Find the letter for every ROM filename
    let lettersToFilenames = (romBasenames ?? [romBasename]).reduce((map, filename) => {
      let letter = filename[0].toUpperCase();
      if (letter.match(/[^A-Z]/)) {
        letter = '#';
      }

      const existing = map.get(letter) ?? new Set();
      existing.add(filename);
      map.set(letter, existing);
      return map;
    }, new Map<string, Set<string>>());

    // Split the letter directories, if needed
    if (options.getDirLetterLimit()) {
      lettersToFilenames = [...lettersToFilenames.entries()]
        .reduce((lettersMap, [letter, filenames]) => {
          if (filenames.size <= options.getDirLetterLimit()) {
            lettersMap.set(letter, new Set(filenames));
            return lettersMap;
          }

          // ROMs may have been grouped together into a subdirectory. For example, when a game has
          // multiple ROMs, they get grouped by their game name. Therefore, we have to understand
          // what the "sub-path" should be within the letter directory: the dirname if the ROM has a
          // subdir, or just the ROM's basename otherwise.
          const subPathsToFilenames = [...filenames]
            .reduce((subPathMap, filename) => {
              const subPath = filename.replace(/[\\/].+$/, '');
              subPathMap.set(subPath, [...subPathMap.get(subPath) ?? [], filename]);
              return subPathMap;
            }, new Map<string, string[]>());

          const subPaths = [...subPathsToFilenames.keys()].sort();
          const chunkSize = options.getDirLetterLimit();
          for (let i = 0; i < subPaths.length; i += chunkSize) {
            const chunk = subPaths
              .slice(i, i + chunkSize)
              .flatMap((subPath) => subPathsToFilenames.get(subPath) ?? []);

            const newLetter = `${letter}${i / chunkSize + 1}`;
            lettersMap.set(newLetter, new Set(chunk));
          }

          return lettersMap;
        }, new Map<string, Set<string>>());
    }

    const foundEntry = [...lettersToFilenames.entries()]
      .find(([, filenames]) => filenames.has(romBasename));
    return foundEntry ? foundEntry[0] : undefined;
  }

  /**
   ***********************************
   *
   *     File name and extension     *
   *
   * *********************************
   */

  private static getName(
    options: Options,
    dat: DAT,
    game: Game,
    rom: ROM,
    inputFile: File,
  ): string {
    const { dir, name, ext } = path.parse(this.getOutputFileBasename(
      options,
      dat,
      game,
      rom,
      inputFile,
    ));

    let output = name;
    if (dir.trim() !== '') {
      output = path.join(dir, output);
    }

    if (game && (
      (options.getDirGameSubdir() === GameSubdirMode.MULTIPLE
        && game.getRoms().length > 1
        && !FileFactory.isArchive(ext))
      || options.getDirGameSubdir() === GameSubdirMode.ALWAYS
    )) {
      output = path.join(game.getName(), output);
    }

    return output;
  }

  private static getExt(options: Options, dat: DAT, game: Game, rom: ROM, inputFile: File): string {
    const { ext } = path.parse(this.getOutputFileBasename(options, dat, game, rom, inputFile));
    return ext;
  }

  private static getOutputFileBasename(
    options: Options,
    dat: DAT,
    game: Game,
    rom: ROM,
    inputFile: File,
  ): string {
    // Determine the output path of the file
    if (options.shouldZip(rom.getName())) {
      // Should zip, generate the zip name from the game name
      return `${game.getName()}.zip`;
    }

    const romBasename = this.getRomBasename(options, dat, rom, inputFile);

    if (
      !(inputFile instanceof ArchiveEntry || FileFactory.isArchive(inputFile.getFilePath()))
            || options.shouldExtract()
    ) {
      // Should extract (if needed), generate the file name from the ROM name
      return romBasename;
    }

    // Should leave archived, generate the archive name from the game name, but use the input
    // file's extension
    const extMatch = inputFile.getFilePath().match(/[^.]+((\.[a-zA-Z0-9]+)+)$/);
    const ext = extMatch !== null ? extMatch[1] : '';
    return game.getName() + ext;
  }

  private static getEntryPath(
    options: Options,
    dat: DAT,
    game: Game,
    rom: ROM,
    inputFile: File,
  ): string {
    const romBasename = this.getRomBasename(options, dat, rom, inputFile);
    if (!options.shouldZip(rom.getName())) {
      return romBasename;
    }

    // The file structure from HTGD SMDBs ends up in both the Game and ROM names. If we're
    // zipping, then the Game name will end up in the filename, we don't need it duplicated in
    // the entry path.
    const gameNameSanitized = game.getName().replace(/[\\/]/g, path.sep);
    return romBasename
      .replace(/[\\/]/g, path.sep)
      .replace(`${path.dirname(gameNameSanitized)}${path.sep}`, '');
  }

  private static getRomBasename(
    options: Options,
    dat: DAT,
    rom: ROM,
    inputFile: File,
  ): string {
    let romNameSanitized = rom.getName();
    if (!dat.getRomNamesContainDirectories()) {
      romNameSanitized = romNameSanitized?.replace(/[\\/]/g, '_');
    }

    const { base, ...parsedRomPath } = path.parse(romNameSanitized);

    // Alter the output extension of the file
    const fileHeader = inputFile.getFileHeader();
    if (parsedRomPath.ext && fileHeader) {
      // If the ROM has a header, then we're going to ignore the file extension from the DAT
      if (options.canRemoveHeader(dat, parsedRomPath.ext)) {
        parsedRomPath.ext = fileHeader.getUnheaderedFileExtension();
      } else {
        parsedRomPath.ext = fileHeader.getHeaderedFileExtension();
      }
    }

    return path.format(parsedRomPath);
  }
}
