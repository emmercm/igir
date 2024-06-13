import { Semaphore } from 'async-mutex';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import ArchiveFile from '../types/files/archives/archiveFile.js';
import FileFactory from '../types/files/fileFactory.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

/**
 * Calculate checksums for {@link ArchiveFile}s (which were skipped in {@link CandidateGenerator}).
 * This deferral is done to prevent calculating checksums for files that will be filtered out by
 * {@link CandidatePreferer}.
 */
export default class CandidateArchiveFileHasher extends Module {
  private static readonly THREAD_SEMAPHORE = new Semaphore(Number.MAX_SAFE_INTEGER);

  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidateArchiveFileHasher.name);
    this.options = options;

    // This will be the same value globally, but we can't know the value at file import time
    if (options.getReaderThreads() < CandidateArchiveFileHasher.THREAD_SEMAPHORE.getValue()) {
      CandidateArchiveFileHasher.THREAD_SEMAPHORE.setValue(options.getReaderThreads());
    }
  }

  /**
   * Hash the {@link ArchiveFile}s.
   */
  async hash(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents to hash ArchiveFiles for`);
      return parentsToCandidates;
    }

    if (!this.options.shouldTest() && !this.options.getOverwriteInvalid()) {
      this.progressBar.logTrace(`${dat.getNameShort()}: not testing or overwriting invalid files, no need`);
      return parentsToCandidates;
    }

    const archiveFileCount = [...parentsToCandidates.values()]
      .flat()
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .filter((romWithFiles) => romWithFiles.getInputFile() instanceof ArchiveFile)
      .length;
    if (archiveFileCount === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no ArchiveFiles to hash`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: generating ${archiveFileCount.toLocaleString()} hashed ArchiveFile candidate${archiveFileCount !== 1 ? 's' : ''}`);
    await this.progressBar.setSymbol(ProgressBarSymbol.HASHING);
    await this.progressBar.reset(archiveFileCount);

    const hashedParentsToCandidates = this.hashArchiveFiles(parentsToCandidates);

    this.progressBar.logTrace(`${dat.getNameShort()}: done generating hashed ArchiveFile candidates`);
    return hashedParentsToCandidates;
  }

  private async hashArchiveFiles(
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    return new Map((await Promise.all([...parentsToCandidates.entries()]
      .map(async ([parent, releaseCandidates]): Promise<[Parent, ReleaseCandidate[]]> => {
        const hashedReleaseCandidates = await Promise.all(releaseCandidates
          .map(async (releaseCandidate) => {
            const hashedRomsWithFiles = await Promise.all(releaseCandidate.getRomsWithFiles()
              .map(async (romWithFiles) => {
                const inputFile = romWithFiles.getInputFile();
                if (!(inputFile instanceof ArchiveFile)) {
                  return romWithFiles;
                }

                return CandidateArchiveFileHasher.THREAD_SEMAPHORE.runExclusive(async () => {
                  await this.progressBar.incrementProgress();
                  const waitingMessage = `${inputFile.toString()} ...`;
                  this.progressBar.addWaitingMessage(waitingMessage);

                  const hashedInputFile = await FileFactory.archiveFileFrom(
                    inputFile.getArchive(),
                    inputFile.getChecksumBitmask(),
                  );
                  // {@link CandidateGenerator} would have copied undefined values from the input
                  //  file, so we need to modify the expected output file as well for testing
                  const hashedOutputFile = romWithFiles.getOutputFile().withProps({
                    size: hashedInputFile.getSize(),
                    crc32: hashedInputFile.getCrc32(),
                    md5: hashedInputFile.getMd5(),
                    sha1: hashedInputFile.getSha1(),
                    sha256: hashedInputFile.getSha256(),
                  });
                  const hashedRomWithFiles = new ROMWithFiles(
                    romWithFiles.getRom(),
                    hashedInputFile,
                    hashedOutputFile,
                  );

                  this.progressBar.removeWaitingMessage('');
                  await this.progressBar.incrementDone();
                  return hashedRomWithFiles;
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
