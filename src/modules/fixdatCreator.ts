import path from 'node:path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import FsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import IgirHeader from '../types/dats/igirHeader.js';
import LogiqxDAT from '../types/dats/logiqx/logiqxDat.js';
import Parent from '../types/dats/parent.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Create a "fixdat" that contains every {@link Game} that has at least one {@link ROM} that wasn't
 * found, and therefore the {@link Game} was not written to the output.
 */
export default class FixdatCreator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, FixdatCreator.name);
    this.options = options;
  }

  /**
   * Create & write a fixdat.
   */
  async create(
    originalDat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<string | undefined> {
    if (!this.options.shouldFixdat()) {
      return undefined;
    }

    this.progressBar.logTrace(`${originalDat.getName()}: generating a fixdat`);
    this.progressBar.setSymbol(ProgressBarSymbol.WRITING);
    this.progressBar.reset(1);

    // Create an easily searchable index of every ROM that has a ReleaseCandidate
    const writtenRomHashCodes = new Set(
      [...parentsToCandidates.values()]
        .flat()
        .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
        .map((romWithFiles) => romWithFiles.getRom())
        .map((rom) => rom.hashCode()),
    );
    // Find all the games that have at least one missing ROM
    const gamesWithMissingRoms = originalDat
      .getGames()
      .filter((game) => !game.getRoms().every((rom) => writtenRomHashCodes.has(rom.hashCode())));
    if (gamesWithMissingRoms.length === 0) {
      this.progressBar.logDebug(
        `${originalDat.getName()}: not creating a fixdat, all games were found`,
      );
      return undefined;
    }

    const fixdatDir = this.options.getFixdatOutput();
    if (!(await FsPoly.exists(fixdatDir))) {
      await FsPoly.mkdir(fixdatDir, { recursive: true });
    }

    // Construct a new DAT and write it to the output dir
    const header = new IgirHeader('fixdat', originalDat, this.options);
    const fixdat = new LogiqxDAT(header, gamesWithMissingRoms);
    const fixdatContents = fixdat.toXmlDat();
    const fixdatPath = path.join(fixdatDir, fixdat.getFilename());
    this.progressBar.logInfo(`${originalDat.getName()}: writing fixdat to '${fixdatPath}'`);
    await FsPoly.writeFile(fixdatPath, fixdatContents);

    this.progressBar.logTrace(`${originalDat.getName()}: done generating a fixdat`);
    return fixdatPath;
  }
}
