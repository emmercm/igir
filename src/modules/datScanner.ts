import * as child_process from 'node:child_process';
import path from 'node:path';

import { parse } from '@fast-csv/parse';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DriveSemaphore from '../driveSemaphore.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import bufferPoly from '../polyfill/bufferPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import CMProParser, { DATProps, GameProps, ROMProps } from '../types/dats/cmpro/cmProParser.js';
import DAT from '../types/dats/dat.js';
import DATObject, { DATObjectProps } from '../types/dats/datObject.js';
import Game from '../types/dats/game.js';
import Header from '../types/dats/logiqx/header.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import MameDAT from '../types/dats/mame/mameDat.js';
import ROM from '../types/dats/rom.js';
import File from '../types/files/file.js';
import { ChecksumBitmask } from '../types/files/fileChecksums.js';
import FileFactory from '../types/files/fileFactory.js';
import Options from '../types/options.js';
import Scanner from './scanner.js';

type SmdbRow = {
  sha256: string;
  name: string;
  sha1: string;
  md5: string;
  crc: string;
  size?: string;
};

/**
 * Scan the {@link OptionsProps.dat} input directory for DAT files and return the internal model
 * representation.
 *
 * This class will not be run concurrently with any other class.
 */
export default class DATScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar) {
    super(options, progressBar, DATScanner.name);
  }

  /**
   * Scan files and parse {@link DAT}s.
   */
  async scan(): Promise<DAT[]> {
    this.progressBar.logInfo('scanning DAT files');
    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(0);

    const datFilePaths = await this.options.scanDatFilesWithoutExclusions(async (increment) => {
      await this.progressBar.incrementTotal(increment);
    });
    if (datFilePaths.length === 0) {
      return [];
    }
    this.progressBar.logDebug(`found ${datFilePaths.length.toLocaleString()} DAT file${datFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(datFilePaths.length);

    this.progressBar.logDebug('enumerating DAT archives');
    const datFiles = await this.getUniqueFilesFromPaths(
      datFilePaths,
      this.options.getReaderThreads(),
      ChecksumBitmask.NONE,
    );
    await this.progressBar.reset(datFiles.length);

    const downloadedDats = await this.downloadDats(datFiles);
    const parsedDats = await this.parseDatFiles(downloadedDats);

    this.progressBar.logInfo('done scanning DAT files');
    return parsedDats;
  }

  private async downloadDats(datFiles: File[]): Promise<File[]> {
    if (!datFiles.some((datFile) => datFile.isURL())) {
      return datFiles;
    }

    this.progressBar.logDebug('downloading DATs from URLs');
    await this.progressBar.setSymbol(ProgressBarSymbol.DOWNLOADING);

    return (await Promise.all(datFiles.map(async (datFile) => {
      if (!datFile.isURL()) {
        return datFile;
      }

      try {
        this.progressBar.logTrace(`${datFile.toString()}: downloading`);
        const downloadedDatFile = await datFile.downloadToTempPath('dat');
        this.progressBar.logTrace(`${datFile.toString()}: downloaded to ${downloadedDatFile.toString()}`);
        return await FileFactory.filesFrom(downloadedDatFile.getFilePath(), ChecksumBitmask.NONE);
      } catch (error) {
        this.progressBar.logWarn(`${datFile.toString()}: failed to download: ${error}`);
        return [];
      }
    }))).flat();
  }

  // Parse each file into a DAT
  private async parseDatFiles(datFiles: File[]): Promise<DAT[]> {
    this.progressBar.logDebug(`parsing ${datFiles.length.toLocaleString()} DAT file${datFiles.length !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.PARSING_CONTENTS);

    return (await new DriveSemaphore(this.options.getReaderThreads()).map(
      datFiles,
      async (datFile) => {
        await this.progressBar.incrementProgress();
        const waitingMessage = `${datFile.toString()} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        let dat: DAT | undefined;
        try {
          dat = await this.parseDatFile(datFile);
        } catch (error) {
          this.progressBar.logWarn(`${datFile.toString()}: failed to parse DAT file: ${error}`);
        }

        await this.progressBar.incrementDone();
        this.progressBar.removeWaitingMessage(waitingMessage);

        if (dat && this.shouldFilterOut(dat)) {
          return undefined;
        }
        return dat;
      },
    ))
      .filter(ArrayPoly.filterNotNullish)
      .map((dat) => this.sanitizeDat(dat))
      .sort((a, b) => a.getNameShort().localeCompare(b.getNameShort()));
  }

  private async parseDatFile(datFile: File): Promise<DAT | undefined> {
    let dat: DAT | undefined;

    if (!dat && await fsPoly.isExecutable(datFile.getFilePath())) {
      dat = await this.parseMameListxml(datFile);
    }

    if (!dat) {
      dat = await datFile.createReadStream(async (stream) => {
        const fileContents = (await bufferPoly.fromReadable(stream)).toString();
        return this.parseDatContents(datFile, fileContents);
      });
    }

    if (!dat) {
      return dat;
    }

    // Special case: if the DAT has only one game but a large number of ROMs, assume each of those
    //  ROMs should be a separate game. This is to help parse the libretro BIOS System.dat file
    //  which only has one game for every BIOS file, even though there are 90+ consoles.
    if (dat.getGames().length === 1 && dat.getGames()[0].getRoms().length > 10) {
      const game = dat.getGames()[0];
      dat = new LogiqxDAT(dat.getHeader(), dat.getGames()[0].getRoms().map((rom) => game.withProps({
        name: rom.getName(),
        rom: [rom],
      })));
    }

    const size = dat.getGames()
      .flatMap((game) => game.getRoms())
      .reduce((sum, rom) => sum + rom.getSize(), 0);
    this.progressBar.logTrace(`${datFile.toString()}: ${fsPoly.sizeReadable(size)} of ${dat.getGames().length.toLocaleString()} game${dat.getGames().length !== 1 ? 's' : ''}, ${dat.getParents().length.toLocaleString()} parent${dat.getParents().length !== 1 ? 's' : ''} parsed`);

    return dat;
  }

  private async parseMameListxml(mameExecutable: File): Promise<DAT | undefined> {
    this.progressBar.logTrace(`${mameExecutable.toString()}: attempting to get ListXML from MAME executable`);

    let fileContents: string;
    try {
      fileContents = await new Promise((resolve, reject) => {
        const proc = child_process.spawn(mameExecutable.getFilePath(), ['-listxml'], { windowsHide: true });

        let output = '';
        proc.stdout.on('data', (chunk) => {
          output += chunk.toString();
        });
        proc.stderr.on('data', (chunk) => {
          output += chunk.toString();
        });

        proc.on('exit', (code) => {
          if (code !== null && code > 0) {
            reject(new Error(`exit code ${code}`));
            return;
          }
          resolve(output);
        });

        proc.on('error', reject);
      });
    } catch (error) {
      this.progressBar.logDebug(`${mameExecutable.toString()}: failed to get ListXML from MAME executable: ${error}`);
      return undefined;
    }

    return this.parseDatContents(mameExecutable, fileContents);
  }

  private async parseDatContents(datFile: File, fileContents: string): Promise<DAT | undefined> {
    if (!fileContents) {
      this.progressBar.logDebug(`${datFile.toString()}: file is empty`);
      return undefined;
    }

    const xmlDat = this.parseXmlDat(datFile, fileContents);
    if (xmlDat) {
      return xmlDat;
    }

    const cmproDatParsed = this.parseCmproDat(datFile, fileContents);
    if (cmproDatParsed) {
      return cmproDatParsed;
    }

    const smdbParsed = await this.parseSourceMaterialDatabase(datFile, fileContents);
    if (smdbParsed) {
      return smdbParsed;
    }

    this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT file`);
    return undefined;
  }

  private parseXmlDat(datFile: File, fileContents: string): DAT | undefined {
    this.progressBar.logTrace(`${datFile.toString()}: attempting to parse ${fsPoly.sizeReadable(fileContents.length)} of XML`);

    let datObject: DATObjectProps;
    try {
      datObject = DATObject.fromXmlString(fileContents);
    } catch (error) {
      const message = (error as Error).message.split('\n').join(', ');
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT XML: ${message}`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed XML, deserializing to DAT`);

    if (datObject.datafile) {
      try {
        return LogiqxDAT.fromObject(datObject.datafile);
      } catch (error) {
        this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT object: ${error}`);
        return undefined;
      }
    }

    if (datObject.mame) {
      try {
        return MameDAT.fromObject(datObject.mame);
      } catch (error) {
        this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT object: ${error}`);
        return undefined;
      }
    }

    this.progressBar.logDebug(`${datFile.toString()}: parsed XML, but failed to find a known DAT root`);
    return undefined;
  }

  private parseCmproDat(datFile: File, fileContents: string): DAT | undefined {
    /**
     * Validation that this might be a CMPro file.
     */
    if (fileContents.match(/^(clrmamepro|game|resource) \(\r?\n(\t.+\r?\n)+\)$/m) === null) {
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: attempting to parse CMPro DAT`);

    let cmproDat: DATProps;
    try {
      cmproDat = new CMProParser(fileContents).parse();
    } catch (error) {
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse CMPro DAT: ${error}`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed CMPro DAT, deserializing to DAT`);

    const header = new Header({
      name: cmproDat.clrmamepro?.name,
      description: cmproDat.clrmamepro?.description,
      version: cmproDat.clrmamepro?.version,
      date: cmproDat.clrmamepro?.date,
      author: cmproDat.clrmamepro?.author,
      url: cmproDat.clrmamepro?.url,
      comment: cmproDat.clrmamepro?.comment,
    });

    let cmproDatGames: GameProps[] = [];
    if (cmproDat.game) {
      if (Array.isArray(cmproDat.game)) {
        cmproDatGames = cmproDat.game;
      } else {
        cmproDatGames = [cmproDat.game];
      }
    }

    const games = cmproDatGames.flatMap((game) => {
      let gameRoms: ROMProps[] = [];
      if (game.rom) {
        if (Array.isArray(game.rom)) {
          gameRoms = game.rom;
        } else {
          gameRoms = [game.rom];
        }
      }

      const roms = gameRoms
        .filter((rom) => rom.name) // we need ROM filenames
        .map((entry) => new ROM({
          name: entry.name ?? '',
          size: Number.parseInt(entry.size ?? '0', 10),
          crc: entry.crc ?? '',
          md5: entry.md5,
          sha1: entry.sha1,
        }));

      return new Game({
        name: game.name,
        category: undefined,
        description: game.description,
        bios: undefined,
        device: undefined,
        cloneOf: game.cloneof,
        romOf: game.romof,
        sampleOf: undefined,
        release: undefined,
        rom: roms,
      });
    });

    return new LogiqxDAT(header, games);
  }

  /**
   * @see https://github.com/frederic-mahe/Hardware-Target-Game-Database
   */
  private async parseSourceMaterialDatabase(
    datFile: File,
    fileContents: string,
  ): Promise<DAT | undefined> {
    this.progressBar.logTrace(`${datFile.toString()}: attempting to parse SMDB`);

    let rows: SmdbRow[] = [];
    try {
      rows = await DATScanner.parseSourceMaterialTsv(fileContents);
    } catch (error) {
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse SMDB: ${error}`);
      return undefined;
    }

    if (rows.length === 0) {
      this.progressBar.logTrace(`${datFile.toString()}: failed to parse SMDB, file has no rows`);
      return undefined;
    }

    if (rows.some((row) => row.size === undefined || row.size.length === 0)) {
      this.progressBar.logWarn(`${datFile.toString()}: SMDB doesn't specify ROM file sizes, can't use`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed SMDB, deserializing to DAT`);

    const games = rows.map((row) => {
      const rom = new ROM({
        name: row.name,
        size: Number.parseInt(row.size ?? '', 10),
        crc: row.crc,
        md5: row.md5,
        sha1: row.sha1,
      });
      const gameName = row.name.replace(/\.[^\\/]+$/, '');
      return new Game({
        name: gameName,
        description: gameName,
        rom,
      });
    });

    const datName = path.parse(datFile.getExtractedFilePath()).name;
    return new LogiqxDAT(new Header({
      name: datName,
      description: datName,
      romNamesContainDirectories: true,
    }), games);
  }

  private static async parseSourceMaterialTsv(fileContents: string): Promise<SmdbRow[]> {
    return new Promise((resolve, reject) => {
      const rows: SmdbRow[] = [];

      const stream = parse<SmdbRow, SmdbRow>({
        delimiter: '\t',
        quote: undefined,
        headers: ['sha256', 'name', 'sha1', 'md5', 'crc', 'size'],
      })
        .validate((row: SmdbRow) => row.name
          && row.crc
          && row.crc.length === 8
          && (row.size === undefined
            || row.size.length === 0
            || Number.isInteger(Number.parseInt(row.size, 10))
          ))
        .on('error', reject)
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => resolve(rows));
      stream.write(fileContents);
      stream.end();
    });
  }

  private shouldFilterOut(dat: DAT): boolean {
    const datNameRegex = this.options.getDatNameRegex();
    if (datNameRegex && !datNameRegex.some((regex) => regex.test(dat.getName()))) {
      return true;
    }

    const datNameRegexExclude = this.options.getDatNameRegexExclude();
    if (datNameRegexExclude && datNameRegexExclude.some((regex) => regex.test(dat.getName()))) {
      return true;
    }

    const datDescription = dat.getDescription();

    const datDescriptionRegex = this.options.getDatDescriptionRegex();
    if (datDescription
      && datDescriptionRegex
      && !datDescriptionRegex.some((regex) => regex.test(datDescription))
    ) {
      return true;
    }

    const datDescriptionRegexExclude = this.options.getDatDescriptionRegexExclude();
    if (datDescription
      && datDescriptionRegexExclude
      && datDescriptionRegexExclude.some((regex) => regex.test(datDescription))
    ) {
      return true;
    }

    return false;
  }

  private sanitizeDat(dat: DAT): DAT {
    const games = dat.getGames()
      .map((game) => {
        const roms = game.getRoms()
          // ROMs have to have filenames and sizes
          .filter((rom) => this.options.shouldDir2Dat() || (rom.name && rom.size > 0));
        return game.withProps({ rom: roms });
      });

    return new LogiqxDAT(dat.getHeader(), games);
  }
}
