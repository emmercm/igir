import { parse } from '@fast-csv/parse';
import async, { AsyncResultCallback } from 'async';
import path from 'path';
import robloachDatfile from 'robloach-datfile';
import xml2js from 'xml2js';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import ArrayPoly from '../polyfill/arrayPoly.js';
import bufferPoly from '../polyfill/bufferPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import FileFactory from '../types/files/fileFactory.js';
import DAT from '../types/logiqx/dat.js';
import DataFile from '../types/logiqx/dataFile.js';
import Game from '../types/logiqx/game.js';
import Header from '../types/logiqx/header.js';
import ROM from '../types/logiqx/rom.js';
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
    if (!datFilePaths.length) {
      return [];
    }
    this.progressBar.logDebug(`found ${datFilePaths.length.toLocaleString()} DAT file${datFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(datFilePaths.length);

    this.progressBar.logDebug('enumerating DAT archives');
    const datFiles = await this.getFilesFromPaths(datFilePaths, Constants.DAT_SCANNER_THREADS);
    await this.progressBar.reset(datFiles.length);

    const downloadedDats = await this.downloadDats(datFiles);
    const parsedDats = await this.parseDatFiles(downloadedDats);

    this.progressBar.logInfo('done scanning DAT files');
    return parsedDats;
  }

  private async downloadDats(datFiles: File[]): Promise<File[]> {
    this.progressBar.logDebug('downloading DATs from URLs');

    return (await Promise.all(datFiles.map(async (datFile) => {
      if (!datFile.isURL()) {
        return datFile;
      }

      try {
        this.progressBar.logTrace(`${datFile.toString()}: downloading`);
        const downloadedDatFile = await datFile.downloadToTempPath('dat');
        this.progressBar.logTrace(`${datFile.toString()}: downloaded to ${downloadedDatFile.toString()}`);
        return await FileFactory.filesFrom(downloadedDatFile.getFilePath());
      } catch (e) {
        this.progressBar.logWarn(`${datFile.toString()}: failed to download: ${e}`);
        return [];
      }
    }))).flatMap((d) => d);
  }

  // Parse each file into a DAT
  private async parseDatFiles(datFiles: File[]): Promise<DAT[]> {
    this.progressBar.logDebug(`parsing ${datFiles.length.toLocaleString()} DAT file${datFiles.length !== 1 ? 's' : ''}`);

    const results = (await async.mapLimit(
      datFiles,
      Constants.DAT_SCANNER_THREADS,
      async (datFile: File, callback: AsyncResultCallback<DAT | undefined, Error>) => {
        await this.progressBar.incrementProgress();
        const waitingMessage = `${datFile.toString()} ...`;
        this.progressBar.addWaitingMessage(waitingMessage);

        const dat = await this.parseDatFile(datFile);

        await this.progressBar.incrementDone();
        this.progressBar.removeWaitingMessage(waitingMessage);
        return callback(null, dat);
      },
    )).filter(ArrayPoly.filterNotNullish);

    return results
      .filter((dat) => {
        const datRegex = this.options.getDatRegex();
        return !datRegex || dat.getName().match(datRegex) !== null;
      })
      .filter((dat) => {
        const datRegexExclude = this.options.getDatRegexExclude();
        return !datRegexExclude || dat.getName().match(datRegexExclude) === null;
      })
      .sort((a, b) => a.getNameShort().localeCompare(b.getNameShort()));
  }

  private async parseDatFile(datFile: File): Promise<DAT | undefined> {
    let dat = await datFile.createReadStream(async (stream) => {
      const fileContents = (await bufferPoly.fromReadable(stream)).toString();

      const xmlDat = await this.parseXmlDat(datFile, fileContents);
      if (xmlDat) {
        return xmlDat;
      }

      const cmproDatParsed = await this.parseCmproDat(datFile, fileContents);
      if (cmproDatParsed) {
        return cmproDatParsed;
      }

      const smdbParsed = await this.parseSourceMaterialDatabase(datFile, fileContents);
      if (smdbParsed) {
        return smdbParsed;
      }

      this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT file`);
      return undefined;
    });
    if (!dat) {
      return dat;
    }

    // Special case: if the DAT has only one game but a large number of ROMs, assume each of those
    //  ROMs should be a separate game. This is to help parse the libretro BIOS System.dat file
    //  which only has one game for every BIOS file, even though there are 90+ consoles.
    if (dat.getGames().length === 1 && dat.getGames()[0].getRoms().length > 10) {
      const game = dat.getGames()[0];
      dat = new DAT(dat.getHeader(), dat.getGames()[0].getRoms().map((rom) => new Game({
        ...game,
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

  private async parseXmlDat(datFile: File, fileContents: string): Promise<DAT | undefined> {
    this.progressBar.logTrace(`${datFile.toString()}: attempting to parse ${fsPoly.sizeReadable(fileContents.length)} of XML`);

    let xmlObject: DataFile;
    try {
      xmlObject = await xml2js.parseStringPromise(fileContents, {
        emptyTag: undefined,
        mergeAttrs: true,
        explicitArray: false,
      });
    } catch (e) {
      const message = (e as Error).message.split('\n').join(', ');
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT XML: ${message}`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed XML, deserializing to DAT`);

    try {
      return DAT.fromObject(xmlObject.datafile);
    } catch (e) {
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT object: ${e}`);
      return undefined;
    }
  }

  private async parseCmproDat(datFile: File, fileContents: string): Promise<DAT | undefined> {
    /**
     * Sanity check that this might be a CMPro file, otherwise {@link robloachDatfile} has a chance
     * to throw fatal errors.
     */
    if (fileContents.match(/^(clrmamepro|game|resource) \(\r?\n(\t.+\r?\n)+\)$/m) === null) {
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: attempting to parse CMPro DAT`);

    let cmproDat;
    try {
      cmproDat = await robloachDatfile.parse(fileContents);
    } catch (e) {
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse CMPro DAT: ${e}`);
      return undefined;
    }
    if (!cmproDat.length) {
      this.progressBar.logWarn(`${datFile.toString()}: failed to parse CMPro DAT, no header or games found`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed CMPro DAT, deserializing to DAT`);

    const header = new Header(cmproDat[0]);

    const cmproGames = cmproDat.slice(1);
    const games = cmproGames.flatMap((obj) => {
      const game = obj as DatfileGame;
      const roms = game.entries
        .filter((rom) => rom.name) // we need ROM filenames
        .map((entry) => new ROM(
          entry.name ?? '',
          parseInt(entry.size ?? '0', 10),
          entry.crc ?? '',
          entry.md5,
          entry.sha1,
        ));

      return new Game({
        ...game,
        rom: roms,
      });
    });

    return new DAT(header, games);
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
    } catch (e) {
      this.progressBar.logDebug(`${datFile.toString()}: failed to parse SMDB: ${e}`);
      return undefined;
    }

    if (!rows.length) {
      this.progressBar.logTrace(`${datFile.toString()}: failed to parse SMDB, file has no rows`);
      return undefined;
    }

    if (rows.some((row) => !row.size)) {
      this.progressBar.logWarn(`${datFile.toString()}: SMDB doesn't specify ROM file sizes, can't use`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed SMDB, deserializing to DAT`);

    const games = rows.map((row) => {
      const rom = new ROM(
        row.name,
        parseInt(row.size ?? '', 10),
        row.crc,
        row.md5,
        row.sha1,
      );
      const gameName = row.name.replace(/\.[^\\/]+$/, '');
      return new Game({
        name: gameName,
        description: gameName,
        rom,
      });
    });

    return new DAT(new Header({
      name: path.parse(datFile.getExtractedFilePath()).name,
      romNamesContainDirectories: true,
    }), games);
  }

  private static async parseSourceMaterialTsv(fileContents: string): Promise<SmdbRow[]> {
    return new Promise((resolve, reject) => {
      const rows: SmdbRow[] = [];

      const stream = parse<SmdbRow, SmdbRow>({
        delimiter: '\t',
        quote: null,
        headers: ['sha256', 'name', 'sha1', 'md5', 'crc', 'size'],
      })
        .validate((row: SmdbRow) => row.name
          && row.crc
          && row.crc.length === 8
          && (!row.size || Number.isInteger(parseInt(row.size, 10))))
        .on('error', reject)
        .on('data', (row) => {
          rows.push(row);
        })
        .on('end', () => resolve(rows));
      stream.write(fileContents);
      stream.end();
    });
  }
}
