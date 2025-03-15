import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DriveSemaphore from '../../driveSemaphore.js';
import DAT from '../../types/dats/dat.js';
import Parent from '../../types/dats/parent.js';
import ArchiveFile from '../../types/files/archives/archiveFile.js';
import FileFactory from '../../types/files/fileFactory.js';
import Options from '../../types/options.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import Module from '../module.js';

/**
 * Calculate checksums for {@link ArchiveFile}s (which were skipped in {@link CandidateGenerator}).
 * This deferral is done to prevent calculating checksums for files that will be filtered out by
 * {@link CandidatePreferer}.
 */
export default class CandidateArchiveFileHasher extends Module {
  private static readonly DRIVE_SEMAPHORE = new DriveSemaphore(Number.MAX_SAFE_INTEGER);

  private readonly options: Options;

  private readonly fileFactory: FileFactory;

  constructor(options: Options, progressBar: ProgressBar, fileFactory: FileFactory) {
    super(progressBar, CandidateArchiveFileHasher.name);
    this.options = options;
    this.fileFactory = fileFactory;

    // This will be the same value globally, but we can't know the value at file import time
    if (options.getReaderThreads() < CandidateArchiveFileHasher.DRIVE_SEMAPHORE.getValue()) {
      CandidateArchiveFileHasher.DRIVE_SEMAPHORE.setValue(options.getReaderThreads());
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
      this.progressBar.logTrace(`${dat.getName()}: no parents to hash ArchiveFiles for`);
      return parentsToCandidates;
    }

    if (!this.options.shouldTest() && !this.options.getOverwriteInvalid()) {
      this.progressBar.logTrace(
        `${dat.getName()}: not testing or overwriting invalid files, no need`,
      );
      return parentsToCandidates;
    }

    const archiveFileCount = [...parentsToCandidates.values()]
      .flat()
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .filter((romWithFiles) => romWithFiles.getInputFile() instanceof ArchiveFile).length;
    if (archiveFileCount === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no ArchiveFiles to hash`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(
      `${dat.getName()}: generating ${archiveFileCount.toLocaleString()} hashed ArchiveFile candidate${archiveFileCount !== 1 ? 's' : ''}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_HASHING);
    this.progressBar.reset(archiveFileCount);

    const hashedParentsToCandidates = this.hashArchiveFiles(dat, parentsToCandidates);

    this.progressBar.logTrace(`${dat.getName()}: done generating hashed ArchiveFile candidates`);
    return hashedParentsToCandidates;
  }

  private async hashArchiveFiles(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    return new Map(
      await Promise.all(
        [...parentsToCandidates.entries()].map(
          async ([parent, releaseCandidates]): Promise<[Parent, ReleaseCandidate[]]> => {
            const hashedReleaseCandidates = await Promise.all(
              releaseCandidates.map(async (releaseCandidate) => {
                const hashedRomsWithFiles = await Promise.all(
                  releaseCandidate.getRomsWithFiles().map(async (romWithFiles) => {
                    const inputFile = romWithFiles.getInputFile();
                    if (!(inputFile instanceof ArchiveFile)) {
                      return romWithFiles;
                    }

                    const outputFile = romWithFiles.getOutputFile();
                    if (inputFile.equals(outputFile)) {
                      // There's no need to calculate the checksum, {@link CandidateWriter} will skip
                      // writing over itself
                      return romWithFiles;
                    }

                    return CandidateArchiveFileHasher.DRIVE_SEMAPHORE.runExclusive(
                      inputFile,
                      async () => {
                        this.progressBar.incrementProgress();
                        const waitingMessage = `${inputFile.toString()} ...`;
                        this.progressBar.addWaitingMessage(waitingMessage);
                        this.progressBar.logTrace(
                          `${dat.getName()}: ${parent.getName()}: calculating checksums for: ${inputFile.toString()}`,
                        );

                        const hashedInputFile = await this.fileFactory.archiveFileFrom(
                          inputFile.getArchive(),
                          inputFile.getChecksumBitmask(),
                        );
                        // {@link CandidateGenerator} would have copied undefined values from the input
                        //  file, so we need to modify the expected output file as well for testing
                        const hashedOutputFile = outputFile.withProps({
                          size: hashedInputFile.getSize(),
                          crc32: hashedInputFile.getCrc32(),
                          md5: hashedInputFile.getMd5(),
                          sha1: hashedInputFile.getSha1(),
                          sha256: hashedInputFile.getSha256(),
                        });
                        const hashedRomWithFiles = romWithFiles
                          .withInputFile(hashedInputFile)
                          .withOutputFile(hashedOutputFile);

                        this.progressBar.removeWaitingMessage(waitingMessage);
                        this.progressBar.incrementDone();
                        return hashedRomWithFiles;
                      },
                    );
                  }),
                );

                return releaseCandidate.withRomsWithFiles(hashedRomsWithFiles);
              }),
            );

            return [parent, hashedReleaseCandidates];
          },
        ),
      ),
    );
  }
}
