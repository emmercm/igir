import path from 'node:path';

import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import ROM from '../types/dats/rom.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import Chd from '../types/files/archives/chd/chd.js';
import FileSignature from '../types/files/fileSignature.js';
import Options, { FixExtension } from '../types/options.js';
import OutputFactory from '../types/outputFactory.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

/**
 * Correct the extensions of output {@link File}s when:
 *  1. Not using any DATs (i.e. there's no correction already happening elsewhere)
 *  2. The DAT-supplied ROM name is falsey
 */
export default class CandidateExtensionCorrector extends Module {
  private static readonly THREAD_SEMAPHORE = new Semaphore(Number.MAX_SAFE_INTEGER);

  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateExtensionCorrector.name);
    this.options = options;

    // This will be the same value globally, but we can't know the value at file import time
    if (options.getReaderThreads() < CandidateExtensionCorrector.THREAD_SEMAPHORE.getValue()) {
      CandidateExtensionCorrector.THREAD_SEMAPHORE.setValue(options.getReaderThreads());
    }
  }

  /**
   * Correct the file extensions.
   */
  async correct(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents to correct extensions for`);
      return parentsToCandidates;
    }

    const romsThatNeedCorrecting = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .filter((romWithFiles) => this.romNeedsCorrecting(romWithFiles))
      .length;
    this.progressBar.logTrace(`${dat.getNameShort()}: correcting ${romsThatNeedCorrecting.toLocaleString()} output file extension${romsThatNeedCorrecting !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(romsThatNeedCorrecting);

    const correctedParentsToCandidates = await this.correctExtensions(dat, parentsToCandidates);

    this.progressBar.logTrace(`${dat.getNameShort()}: done correcting output file extensions`);
    return correctedParentsToCandidates;
  }

  private romNeedsCorrecting(romWithFiles: ROMWithFiles): boolean {
    const inputFile = romWithFiles.getInputFile();
    if (inputFile instanceof ArchiveEntry && inputFile.getArchive() instanceof Chd) {
      // Files within CHDs never need extension correction
      return false;
    }

    return this.options.getFixExtension() === FixExtension.ALWAYS
      || (this.options.getFixExtension() === FixExtension.AUTO && (
        !this.options.usingDats()
          || romWithFiles.getRom().getName().trim() === ''
      ));
  }

  private async correctExtensions(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    return new Map((await Promise.all([...parentsToCandidates.entries()]
      .map(async ([parent, releaseCandidates]): Promise<[Parent, ReleaseCandidate[]]> => {
        const hashedReleaseCandidates = await Promise.all(releaseCandidates
          .map(async (releaseCandidate) => {
            const hashedRomsWithFiles = await Promise.all(releaseCandidate.getRomsWithFiles()
              .map(async (romWithFiles) => {
                const correctedRom = await this.buildCorrectedRom(
                  dat,
                  parent,
                  releaseCandidate,
                  romWithFiles,
                );

                // Using the corrected ROM name, build a new output path
                const correctedOutputPath = OutputFactory.getPath(
                  this.options,
                  dat,
                  releaseCandidate.getGame(),
                  releaseCandidate.getRelease(),
                  correctedRom,
                  romWithFiles.getInputFile(),
                );
                let correctedOutputFile = romWithFiles.getOutputFile()
                  .withFilePath(correctedOutputPath.format());
                if (correctedOutputFile instanceof ArchiveEntry) {
                  correctedOutputFile = correctedOutputFile
                    .withEntryPath(correctedOutputPath.entryPath);
                }

                return new ROMWithFiles(
                  correctedRom,
                  romWithFiles.getInputFile(),
                  correctedOutputFile,
                );
              }));

            return new ReleaseCandidate(
              releaseCandidate.getGame(),
              releaseCandidate.getRelease(),
              hashedRomsWithFiles,
            );
          }));

        return [parent, hashedReleaseCandidates];
      }))));
  }

  private async buildCorrectedRom(
    dat: DAT,
    parent: Parent,
    releaseCandidate: ReleaseCandidate,
    romWithFiles: ROMWithFiles,
  ): Promise<ROM> {
    let correctedRom = romWithFiles.getRom();

    if (correctedRom.getName().trim() === '') {
      // The ROM doesn't have any filename, default it. Because we never knew a file extension,
      // doing this isn't considered "correction".
      const romWithFilesIdx = releaseCandidate.getRomsWithFiles().indexOf(romWithFiles);
      correctedRom = correctedRom.withName(`${releaseCandidate.getGame()
        .getName()}${releaseCandidate.getRomsWithFiles().length > 1 ? ` (File ${romWithFilesIdx + 1})` : ''}.rom`);
    }

    if (!this.romNeedsCorrecting(romWithFiles)) {
      // Do no further processing if we're not correcting the extension
      return correctedRom;
    }

    await CandidateExtensionCorrector.THREAD_SEMAPHORE.runExclusive(async () => {
      await this.progressBar.incrementProgress();
      const waitingMessage = `${releaseCandidate.getName()} ...`;
      this.progressBar.addWaitingMessage(waitingMessage);
      this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: correcting extension for: ${romWithFiles.getInputFile()
        .toString()}`);

      try {
        await romWithFiles.getInputFile().createReadStream(async (stream) => {
          const romSignature = await FileSignature.signatureFromFileStream(stream);
          if (!romSignature) {
            // No signature was found, so we can't perform any correction
            return;
          }

          // ROM file signature found, use the appropriate extension
          const { dir, name } = path.parse(correctedRom.getName());
          const correctedRomName = path.format({
            dir,
            name: name + romSignature.getExtension(),
          });
          correctedRom = correctedRom.withName(correctedRomName);
        });
      } catch (error) {
        this.progressBar.logError(`${dat.getNameShort()}: failed to correct file extension for '${romWithFiles.getInputFile()}': ${error}`);
      }

      this.progressBar.removeWaitingMessage(waitingMessage);
      await this.progressBar.incrementDone();
    });

    return correctedRom;
  }
}
