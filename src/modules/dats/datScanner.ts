import child_process from 'node:child_process';
import path from 'node:path';

import { parse } from '@fast-csv/parse';
import async from 'async';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DriveSemaphore from '../../driveSemaphore.js';
import GameGrouper from '../../gameGrouper.js';
import Defaults from '../../globals/defaults.js';
import bufferPoly from '../../polyfill/bufferPoly.js';
import FsPoly from '../../polyfill/fsPoly.js';
import CMProParser, { DATProps, GameProps, ROMProps } from '../../types/dats/cmpro/cmProParser.js';
import DAT from '../../types/dats/dat.js';
import DATObject, { DATObjectProps } from '../../types/dats/datObject.js';
import Disk from '../../types/dats/disk.js';
import Game from '../../types/dats/game.js';
import Header from '../../types/dats/logiqx/header.js';
import LogiqxDAT from '../../types/dats/logiqx/logiqxDat.js';
import MameDAT from '../../types/dats/mame/mameDat.js';
import ROM from '../../types/dats/rom.js';
import SoftwareListDAT from '../../types/dats/softwarelist/softwareListDat.js';
import SoftwareListsDAT from '../../types/dats/softwarelist/softwareListsDat.js';
import IgirException from '../../types/exceptions/igirException.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import File from '../../types/files/file.js';
import { ChecksumBitmask } from '../../types/files/fileChecksums.js';
import FileFactory from '../../types/files/fileFactory.js';
import Options from '../../types/options.js';
import Scanner from '../scanner.js';

interface SmdbRow {
  sha256: string;
  name: string;
  sha1: string;
  md5: string;
  crc: string;
  size?: string;
}

/**
 * Scan the {@link OptionsProps.dat} input directory for DAT files and return the internal model
 * representation.
 */
export default class DATScanner extends Scanner {
  constructor(options: Options, progressBar: ProgressBar, fileFactory: FileFactory) {
    super(options, progressBar, fileFactory, DATScanner.name);
  }

  /**
   * Scan files and parse {@link DAT}s.
   */
  async scan(): Promise<DAT[]> {
    this.progressBar.logTrace('scanning DAT files');
    this.progressBar.setSymbol(ProgressBarSymbol.FILE_SCANNING);
    this.progressBar.resetProgress(0);

    const datFilePaths = await this.options.scanDatFilesWithoutExclusions((increment) => {
      this.progressBar.incrementTotal(increment);
    });
    if (datFilePaths.length === 0) {
      return [];
    }
    this.progressBar.logTrace(
      `found ${datFilePaths.length.toLocaleString()} DAT file${datFilePaths.length === 1 ? '' : 's'}`,
    );
    this.progressBar.resetProgress(datFilePaths.length);

    this.progressBar.logTrace('enumerating DAT archives');
    const datFiles = await this.getUniqueFilesFromPaths(
      datFilePaths,
      this.options.getReaderThreads(),
      ChecksumBitmask.CRC32,
    );
    this.progressBar.resetProgress(datFiles.length);

    const downloadedDats = await this.downloadDats(datFiles);
    this.progressBar.resetProgress(downloadedDats.length);
    const parsedDats = await this.parseDatFiles(downloadedDats);

    this.progressBar.logTrace('done scanning DAT files');
    return parsedDats;
  }

  private async downloadDats(datFiles: File[]): Promise<File[]> {
    const datUrlFiles = datFiles.filter((datFile) => datFile.isURL());
    if (datUrlFiles.length === 0) {
      return datFiles;
    }

    this.progressBar.logTrace(
      `downloading ${datUrlFiles.length.toLocaleString()} DAT${datUrlFiles.length === 1 ? '' : 's'} from URL${datUrlFiles.length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_DOWNLOADING);

    return (
      await async.mapLimit(datFiles, Defaults.MAX_FS_THREADS, async (datFile: File) => {
        try {
          this.progressBar.logTrace(`${datFile.toString()}: downloading`);
          // TODO(cemmer): these never get deleted?
          const downloadedDatFile = await datFile.downloadToTempPath();
          this.progressBar.logTrace(
            `${datFile.toString()}: downloaded to '${downloadedDatFile.toString()}'`,
          );
          return await this.getFilesFromPaths(
            [downloadedDatFile.getFilePath()],
            this.options.getReaderThreads(),
            ChecksumBitmask.NONE,
          );
        } catch (error) {
          throw new IgirException(`failed to download '${datFile.toString()}': ${error}`);
        }
      })
    ).flat();
  }

  // Parse each file into a DAT
  private async parseDatFiles(datFiles: File[]): Promise<DAT[]> {
    this.progressBar.logTrace(
      `parsing ${datFiles.length.toLocaleString()} DAT file${datFiles.length === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.DAT_PARSING);

    return (
      await new DriveSemaphore(this.options.getReaderThreads()).map(datFiles, async (datFile) => {
        this.progressBar.incrementInProgress();
        const childBar = this.progressBar.addChildBar({
          name: datFile.toString(),
        });

        let dat: DAT | undefined;
        try {
          dat = await this.parseDatFile(datFile);
        } catch (error) {
          this.progressBar.logWarn(`${datFile.toString()}: failed to parse DAT file: ${error}`);
          childBar.delete();
        }

        this.progressBar.incrementCompleted();

        if (dat && this.shouldFilterOut(dat)) {
          return undefined;
        }
        return dat;
      })
    )
      .filter((dat) => dat !== undefined)
      .map((dat) => this.sanitizeDat(dat))
      .sort((a, b) => a.getName().localeCompare(b.getName()));
  }

  private async parseDatFile(datFile: File): Promise<DAT | undefined> {
    let dat: DAT | undefined;

    if (
      !dat &&
      !(datFile instanceof ArchiveEntry) &&
      (await FsPoly.isExecutable(datFile.getFilePath()))
    ) {
      dat = await this.parseMameListxml(datFile);
    }

    dat ??= await datFile.createReadStream(async (readable) => {
      const fileContents = (await bufferPoly.fromReadable(readable)).toString();
      return this.parseDatContents(datFile, fileContents);
    });

    if (!dat) {
      return dat;
    }

    // Special case: if the DAT has only one BIOS game with a large number of ROMs, assume each of
    //  those ROMs should be a separate game. This is to help parse the libretro BIOS System.dat
    //  file which only has one game for every BIOS file, even though there are 90+ consoles.
    if (
      dat.getGames().length === 1 &&
      dat.getGames()[0].getIsBios() &&
      dat.getGames()[0].getRoms().length > 10
    ) {
      const game = dat.getGames()[0];
      dat = dat.withGames(
        dat
          .getGames()[0]
          .getRoms()
          .map((rom) => {
            // Use the ROM's filename without its extension as the game name
            const { dir, name } = path.parse(rom.getName());
            const gameName = path.format({
              dir,
              name,
            });
            return game.withProps({
              name: gameName,
              roms: [rom],
            });
          }),
      );
    }

    const size = dat
      .getGames()
      .flatMap((game) => game.getRoms())
      .reduce((sum, rom) => sum + rom.getSize(), 0);
    this.progressBar.logTrace(
      `${datFile.toString()}: ${FsPoly.sizeReadable(size)} of ${dat.getGames().length.toLocaleString()} game${dat.getGames().length === 1 ? '' : 's'}, ${dat.getParents().length.toLocaleString()} parent${dat.getParents().length === 1 ? '' : 's'} parsed`,
    );

    return dat;
  }

  private async parseMameListxml(mameExecutable: File): Promise<DAT | undefined> {
    this.progressBar.logTrace(
      `${mameExecutable.toString()}: attempting to get ListXML from MAME executable`,
    );

    let fileContents: string;
    try {
      fileContents = await new Promise((resolve, reject) => {
        const proc = child_process.spawn(mameExecutable.getFilePath(), ['-listxml'], {
          windowsHide: true,
        });

        let output = '';
        proc.stdout.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });
        proc.stderr.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });

        proc.on('close', (code) => {
          if (code !== null && code > 0) {
            reject(new Error(`exit code ${code}`));
            return;
          }
          resolve(output);
        });

        proc.on('error', reject);
      });
    } catch (error) {
      this.progressBar.logTrace(
        `${mameExecutable.toString()}: failed to get ListXML from MAME executable: ${error}`,
      );
      return undefined;
    }

    return this.parseDatContents(mameExecutable, fileContents);
  }

  private async parseDatContents(datFile: File, fileContents: string): Promise<DAT | undefined> {
    if (!fileContents) {
      this.progressBar.logTrace(`${datFile.toString()}: file is empty`);
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

    this.progressBar.logTrace(`${datFile.toString()}: failed to parse DAT file`);
    return undefined;
  }

  private parseXmlDat(datFile: File, fileContents: string): DAT | undefined {
    this.progressBar.logTrace(
      `${datFile.toString()}: attempting to parse ${FsPoly.sizeReadable(fileContents.length)} of XML`,
    );

    let datObject: DATObjectProps;
    try {
      datObject = DATObject.fromXmlString(fileContents);
    } catch (error) {
      const message = (error as Error).message.split('\n').join(', ');
      this.progressBar.logTrace(`${datFile.toString()}: failed to parse DAT XML: ${message}`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed XML, deserializing to DAT`);

    if (datObject.datafile) {
      try {
        return LogiqxDAT.fromObject(datObject.datafile, { filePath: datFile.getFilePath() });
      } catch (error) {
        this.progressBar.logTrace(`${datFile.toString()}: failed to parse DAT object: ${error}`);
        return undefined;
      }
    }

    if (datObject.mame) {
      try {
        return MameDAT.fromObject(datObject.mame, { filePath: datFile.getFilePath() });
      } catch (error) {
        this.progressBar.logTrace(
          `${datFile.toString()}: failed to parse MAME DAT object: ${error}`,
        );
        return undefined;
      }
    }

    if (datObject.softwarelists) {
      try {
        return SoftwareListsDAT.fromObject(datObject.softwarelists, {
          filePath: datFile.getFilePath(),
        });
      } catch (error) {
        this.progressBar.logTrace(
          `${datFile.toString()}: failed to parse software list DAT object: ${error}`,
        );
        return undefined;
      }
    }

    if (datObject.softwarelist) {
      try {
        return SoftwareListDAT.fromObject(datObject.softwarelist);
      } catch (error) {
        this.progressBar.logTrace(
          `${datFile.toString()}: failed to parse software list DAT object: ${error}`,
        );
        return undefined;
      }
    }

    this.progressBar.logTrace(
      `${datFile.toString()}: parsed XML, but failed to find a known DAT root`,
    );
    return undefined;
  }

  private parseCmproDat(datFile: File, fileContents: string): DAT | undefined {
    /**
     * Validation that this might be a CMPro file.
     */
    if (!/^(clrmamepro|game|resource) \(\r?\n(\s.+\r?\n)+\)$/m.test(fileContents)) {
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: attempting to parse CMPro DAT`);

    let cmproDat: DATProps;
    try {
      cmproDat = new CMProParser(fileContents).parse();
    } catch (error) {
      this.progressBar.logTrace(`${datFile.toString()}: failed to parse CMPro DAT: ${error}`);
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
      const gameName = game.name ?? game.comment;

      let gameRoms: ROMProps[] = [];
      if (game.rom) {
        if (Array.isArray(game.rom)) {
          gameRoms = game.rom;
        } else {
          gameRoms = [game.rom];
        }
      }
      const roms = gameRoms.map(
        (entry) =>
          new ROM({
            name: entry.name ?? '',
            size: Number.parseInt(entry.size ?? '0', 10),
            crc32: entry.crc,
            md5: entry.md5,
            sha1: entry.sha1,
          }),
      );

      let gameDisks: ROMProps[] = [];
      if (game.disk) {
        if (Array.isArray(game.disk)) {
          gameDisks = game.disk;
        } else {
          gameDisks = [game.disk];
        }
      }
      const disks = gameDisks.map(
        (entry) =>
          new Disk({
            name: entry.name ?? '',
            size: Number.parseInt(entry.size ?? '0', 10),
            crc32: entry.crc,
            md5: entry.md5,
            sha1: entry.sha1,
          }),
      );

      return new Game({
        name: gameName,
        categories: undefined,
        description: game.description,
        isBios:
          cmproDat.clrmamepro?.author?.toLowerCase() === 'libretro' &&
          cmproDat.clrmamepro.name?.toLowerCase() === 'system'
            ? 'yes'
            : 'no',
        isDevice: undefined,
        cloneOf: game.cloneof,
        romOf: game.romof,
        genre: game.genre?.toString(),
        release: undefined,
        roms: roms,
        disks: disks,
      });
    });

    return new LogiqxDAT({ filePath: datFile.getFilePath(), header, games });
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
      this.progressBar.logTrace(`${datFile.toString()}: failed to parse SMDB: ${error}`);
      return undefined;
    }

    if (rows.length === 0) {
      this.progressBar.logTrace(`${datFile.toString()}: failed to parse SMDB, file has no rows`);
      return undefined;
    }

    this.progressBar.logTrace(`${datFile.toString()}: parsed SMDB, deserializing to DAT`);

    const rowNamesToRows = GameGrouper.groupMultiDiscGames(rows, (row) =>
      row.name.replace(/\.[^.]*$/, ''),
    );
    const games = [...rowNamesToRows.entries()].map(([gameName, rows]) => {
      const roms = rows.map(
        (row) =>
          new ROM({
            name: row.name,
            size: Number.parseInt(
              row.size !== undefined && row.size.length > 0 ? row.size : '0',
              10,
            ),
            crc32: row.crc,
            md5: row.md5,
            sha1: row.sha1,
            sha256: row.sha256,
          }),
      );
      return new Game({
        name: gameName,
        description: gameName,
        roms,
      });
    });

    const datName = path.parse(datFile.getExtractedFilePath()).name;
    return new LogiqxDAT({
      filePath: datFile.getFilePath(),
      header: new Header({
        name: datName,
        description: datName,
      }),
      games,
    });
  }

  private static async parseSourceMaterialTsv(fileContents: string): Promise<SmdbRow[]> {
    return new Promise((resolve, reject) => {
      const rows: SmdbRow[] = [];

      const stream = parse<SmdbRow, SmdbRow>({
        delimiter: '\t',
        quote: undefined,
        headers: ['sha256', 'name', 'sha1', 'md5', 'crc', 'size'],
      })
        .validate(
          (row: SmdbRow) =>
            row.name &&
            (/^[0-9a-f]{8}$/.test(row.crc) ||
              /^[0-9a-f]{32}$/.test(row.md5) ||
              /^[0-9a-f]{40}$/.test(row.sha1) ||
              /^[0-9a-f]{64}$/.test(row.sha256)),
        )
        .on('error', reject)
        .on('data', (row: SmdbRow) => {
          rows.push(row);
        })
        .on('end', () => {
          resolve(rows);
        });
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
    if (datNameRegexExclude?.some((regex) => regex.test(dat.getName()))) {
      return true;
    }

    const datDescription = dat.getDescription();

    const datDescriptionRegex = this.options.getDatDescriptionRegex();
    if (
      datDescription &&
      datDescriptionRegex &&
      !datDescriptionRegex.some((regex) => regex.test(datDescription))
    ) {
      return true;
    }

    const datDescriptionRegexExclude = this.options.getDatDescriptionRegexExclude();
    if (datDescription && datDescriptionRegexExclude?.some((regex) => regex.test(datDescription))) {
      return true;
    }

    return false;
  }

  private sanitizeDat(dat: DAT): DAT {
    const games = dat.getGames().map((game) => {
      const roms = game
        .getRoms()
        // Games have to have at least one ROM with a non-empty checksum
        .filter(
          (rom) =>
            this.options.shouldDir2Dat() ||
            ((rom.getCrc32() === undefined || rom.getCrc32() !== '00000000') &&
              (rom.getMd5() === undefined || rom.getMd5() !== 'd41d8cd98f00b204e9800998ecf8427e') &&
              (rom.getSha1() === undefined ||
                rom.getSha1() !== 'da39a3ee5e6b4b0d3255bfef95601890afd80709') &&
              (rom.getSha256() === undefined ||
                rom.getSha256() !==
                  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')),
        );
      return game.withProps({ roms: roms });
    });

    return dat.withGames(games);
  }
}
