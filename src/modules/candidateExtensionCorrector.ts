import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import ROMSignature from '../types/files/romSignature.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

/**
 * TODO
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
   * TODO
   */
  async correct(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents to correct extensions for`);
      return parentsToCandidates;
    }

    const romsWithNullishNamesCount = [...parentsToCandidates.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .filter((romWithFiles) => this.romNeedsCorrecting(romWithFiles))
      .length;
    if (romsWithNullishNamesCount === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: all DAT ROMs have filenames`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: correcting ${romsWithNullishNamesCount.toLocaleString()} output file extension${romsWithNullishNamesCount !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(romsWithNullishNamesCount);

    const correctedParentsToCandidates = await this.correctExtensions(dat, parentsToCandidates);

    this.progressBar.logTrace(`${dat.getNameShort()}: done correcting output file extensions`);
    return correctedParentsToCandidates;
  }

  private romNeedsCorrecting(romWithFiles: ROMWithFiles): boolean {
    return true;
    return !this.options.usingDats()
      || romWithFiles.getRom().getName().trim() === '';
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
                      const romSignature = await ROMSignature.signatureFromFileStream(stream);
                      if (!romSignature) {
                      // We don't know this signature, don't correct anything
                        return romWithFiles;
                      }

                      // TODO: correct the extension

                      return romWithFiles;
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
