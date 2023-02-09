import async, { AsyncResultCallback } from 'async';
import robloachDatfile from 'robloach-datfile';
import xml2js from 'xml2js';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import Constants from '../constants.js';
import bufferPoly from '../polyfill/bufferPoly.js';
import fsPoly from '../polyfill/fsPoly.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import DataFile from '../types/logiqx/dataFile.js';
import Game from '../types/logiqx/game.js';
import Header from '../types/logiqx/header.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import Scanner from './scanner.js';

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

  async scan(): Promise<DAT[]> {
    await this.progressBar.logInfo('Scanning DAT files');

    await this.progressBar.setSymbol(ProgressBarSymbol.SEARCHING);
    await this.progressBar.reset(this.options.getDatFileCount());

    const datFilePaths = await this.options.scanDatFilesWithoutExclusions();
    if (!datFilePaths.length) {
      return [];
    }
    await this.progressBar.logTrace(datFilePaths.map((file) => `Found DAT file: ${file}`).join('\n'));
    await this.progressBar.logDebug(`Found ${datFilePaths.length} DAT file${datFilePaths.length !== 1 ? 's' : ''}`);
    await this.progressBar.reset(datFilePaths.length);

    await this.progressBar.logDebug('Enumerating DAT archives');
    const datFiles = await this.getFilesFromPaths(datFilePaths, Constants.DAT_SCANNER_THREADS);
    await this.progressBar.reset(datFiles.length);

    await this.progressBar.logDebug('Deserializing DAT XML to objects');
    const dats = await this.parseDatFiles(datFiles);

    await this.progressBar.logTrace(dats.map((dat) => {
      const size = dat.getGames()
        .flatMap((game) => game.getRoms())
        .reduce((sum, rom) => sum + rom.getSize(), 0);
      return `${dat.getName()}: ${fsPoly.sizeReadable(size)} of ${dat.getGames().length.toLocaleString()} game${dat.getGames().length !== 1 ? 's' : ''}, ${dat.getParents().length.toLocaleString()} parent${dat.getParents().length !== 1 ? 's' : ''} parsed`;
    }).join('\n'));
    await this.progressBar.logInfo('Done scanning DAT files');
    return dats;
  }

  // Parse each file into a DAT
  private async parseDatFiles(datFiles: File[]): Promise<DAT[]> {
    await this.progressBar.logDebug('Parsing DAT files');
    const results = (await async.mapLimit(
      datFiles,
      Constants.DAT_SCANNER_THREADS,
      async (datFile: File, callback: AsyncResultCallback<DAT | undefined, Error>) => {
        const dat = await this.parseDatFile(datFile);
        await this.progressBar.increment();
        return callback(null, dat);
      },
    )).filter((xmlObject) => xmlObject) as DAT[];

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
    return datFile.createReadStream(async (stream) => {
      const fileContents = (await bufferPoly.fromReadable(stream)).toString();

      const xmlDat = await this.parseXmlDat(datFile, fileContents);
      if (xmlDat) {
        return xmlDat;
      }

      const cmproDatParsed = await this.parseCmproDat(datFile, fileContents);
      if (cmproDatParsed) {
        return cmproDatParsed;
      }

      await this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT file`);
      return undefined;
    });
  }

  private async parseXmlDat(datFile: File, fileContents: string): Promise<DAT | undefined> {
    await this.progressBar.logTrace(`${datFile.toString()}: parsing XML`);

    let xmlObject: DataFile;
    try {
      xmlObject = await xml2js.parseStringPromise(fileContents, {
        mergeAttrs: true,
        explicitArray: false,
      });
    } catch (e) {
      const message = (e as Error).message.split('\n').join(', ');
      await this.progressBar.logDebug(`${datFile.toString()}: failed to parse XML : ${message}`);
      return undefined;
    }

    try {
      return DAT.fromObject(xmlObject.datafile);
    } catch (e) {
      await this.progressBar.logDebug(`${datFile.toString()}: failed to parse DAT object : ${e}`);
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

    let datfile;
    try {
      datfile = await robloachDatfile.parse(fileContents);
    } catch (e) {
      await this.progressBar.logDebug(`${datFile.toString()}: failed to parse CMPro : ${e}`);
      return undefined;
    }
    if (!datfile.length) {
      throw new Error('invalid file');
    }

    const header = new Header(datfile[0]);

    const games = datfile.slice(1).map((obj) => {
      const game = obj as DatfileGame;
      const roms = game.entries
        .filter((rom) => rom.name) // we need ROM filenames
        .map((entry) => new ROM(
          entry.name || '',
          parseInt(entry.size || '0', 10),
          entry.crc || '',
        ));
      return new Game({
        ...game,
        rom: roms,
      });
    });

    return new DAT(header, games);
  }
}
