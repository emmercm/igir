import path from 'node:path';

import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import ROMSignature from '../types/files/romSignature.js';
import Options, { RomFixExtension } from '../types/options.js';
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
    if (this.options.getRomFixExtension() === RomFixExtension.NEVER) {
      this.progressBar.logTrace(`${dat.getNameShort()}: not correcting any ROM extensions`);
      return parentsToCandidates;
    }

    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents to correct extensions for`);
      return parentsToCandidates;
    }

    const romsThatNeedCorrecting = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .filter((romWithFiles) => this.romNeedsCorrecting(romWithFiles))
      .length;
    if (romsThatNeedCorrecting === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: all DAT ROMs have filenames`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: correcting ${romsThatNeedCorrecting.toLocaleString()} output file extension${romsThatNeedCorrecting !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(romsThatNeedCorrecting);

    const correctedParentsToCandidates = await this.correctExtensions(dat, parentsToCandidates);

    this.progressBar.logTrace(`${dat.getNameShort()}: done correcting output file extensions`);
    return correctedParentsToCandidates;
  }

  private romNeedsCorrecting(romWithFiles: ROMWithFiles): boolean {
    return this.options.getRomFixExtension() === RomFixExtension.ALWAYS
      || (this.options.getRomFixExtension() === RomFixExtension.AUTO && (
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
              .map(async (romWithFiles, romWithFilesIdx) => {
                if (!this.romNeedsCorrecting(romWithFiles)) {
                  return romWithFiles;
                }

                return CandidateExtensionCorrector.THREAD_SEMAPHORE.runExclusive(async () => {
                  await this.progressBar.incrementProgress();
                  const waitingMessage = `${releaseCandidate.getName()} ...`;
                  this.progressBar.addWaitingMessage(waitingMessage);
                  this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: correcting extension for: ${romWithFiles.getInputFile().toString()}`);

                  const correctedRomWithFiles = await romWithFiles.getInputFile()
                    .createReadStream(async (stream) => {
                      let correctedRom = romWithFiles.getRom();

                      if (correctedRom.getName().trim() === '') {
                        // The ROM doesn't have any filename, default it
                        correctedRom = correctedRom.withName(`${releaseCandidate.getGame().getName()}${releaseCandidate.getRomsWithFiles().length > 1 ? ` (File ${romWithFilesIdx + 1})` : ''}.rom`);
                      }

                      const romSignature = await ROMSignature.signatureFromFileStream(stream);
                      if (romSignature) {
                        // ROM file signature found, use the appropriate extension
                        const { dir, name } = path.parse(correctedRom.getName());
                        const correctedRomName = path.format({
                          dir,
                          name: name + romSignature.getExtension(),
                        });
                        correctedRom = correctedRom.withName(correctedRomName);
                      }

                      const correctedOutputPath = OutputFactory.getPath(
                        this.options,
                        dat,
                        releaseCandidate.getGame(),
                        releaseCandidate.getRelease(),
                        correctedRom,
                        romWithFiles.getInputFile(),
                      ).format();
                      const correctedOutputFile = romWithFiles.getOutputFile()
                        .withFilePath(correctedOutputPath);

                      return new ROMWithFiles(
                        correctedRom,
                        romWithFiles.getInputFile(),
                        correctedOutputFile,
                      );
                    });

                  this.progressBar.removeWaitingMessage(waitingMessage);
                  await this.progressBar.incrementDone();
                  return correctedRomWithFiles;
                });
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
}
