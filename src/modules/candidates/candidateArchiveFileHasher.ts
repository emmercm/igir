import type MappableSemaphore from '../../async/mappableSemaphore.js';
import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import ArrayPoly from '../../polyfill/arrayPoly.js';
import FsPoly from '../../polyfill/fsPoly.js';
import IntlPoly from '../../polyfill/intlPoly.js';
import type DAT from '../../types/dats/dat.js';
import ArchiveFile from '../../types/files/archives/archiveFile.js';
import type FileFactory from '../../types/files/fileFactory.js';
import type Options from '../../types/options.js';
import type ROMWithFiles from '../../types/romWithFiles.js';
import type WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

/**
 * Calculate checksums for {@link ArchiveFile}s (which were skipped in {@link CandidateGenerator}).
 * This deferral is done to prevent calculating checksums for files that are filtered out by a
 * candidate filtering module.
 */
export default class CandidateArchiveFileHasher extends Module {
  private readonly options: Options;
  private readonly fileFactory: FileFactory;
  private readonly mappableSemaphore: MappableSemaphore;

  constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    mappableSemaphore: MappableSemaphore,
  ) {
    super(progressBar, CandidateArchiveFileHasher.name);
    this.options = options;
    this.fileFactory = fileFactory;
    this.mappableSemaphore = mappableSemaphore;
  }

  /**
   * Hash the {@link ArchiveFile}s.
   */
  // TODO(cememr): this is unnecessary work for files that will be renamed and not copied; we
  //  probably want to delete this file and let CandidateWriter handle things
  async hash(dat: DAT, candidates: WriteCandidate[]): Promise<WriteCandidate[]> {
    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to hash ArchiveFiles for`);
      return candidates;
    }

    if (!this.options.shouldTest() && !this.options.getOverwriteInvalid()) {
      this.progressBar.logTrace(
        `${dat.getName()}: not testing or overwriting invalid files, no need`,
      );
      return candidates;
    }

    const archiveFileCount = candidates.reduce(
      (sum, candidate) =>
        sum +
        candidate
          .getRomsWithFiles()
          .filter((romWithFiles) => this.romWithFilesNeedsProcessing(romWithFiles))
          .filter((romWithFiles) => romWithFiles.getInputFile().getFilePath())
          .reduce(ArrayPoly.reduceUnique(), []).length,
      0,
    );
    if (archiveFileCount === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no ArchiveFiles to hash`);
      return candidates;
    }

    this.progressBar.logTrace(
      `${dat.getName()}: generating ${IntlPoly.toLocaleString(archiveFileCount)} hashed ArchiveFile candidate${archiveFileCount === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_HASHING);
    this.progressBar.resetProgress(archiveFileCount);

    const hashedCandidates = this.hashArchiveFiles(dat, candidates);

    this.progressBar.logTrace(`${dat.getName()}: done generating hashed ArchiveFile candidates`);
    return await hashedCandidates;
  }

  private async hashArchiveFiles(
    dat: DAT,
    candidates: WriteCandidate[],
  ): Promise<WriteCandidate[]> {
    return await Promise.all(
      candidates.map(async (candidate) => {
        // A WriteCandidate with multiple ROMs with have duplicate input files, so we de-duplicate them for semaphore
        // efficiency, and to provide a more accurate progress bar
        const uniqueInputArchiveFiles = candidate
          .getRomsWithFiles()
          .filter((rwf) => this.romWithFilesNeedsProcessing(rwf))
          .map((rwf) => rwf.getInputFile())
          .filter((inputFile): inputFile is ArchiveFile => inputFile instanceof ArchiveFile)
          .filter(ArrayPoly.filterUniqueMapped((inputFile) => inputFile.getFilePath()));
        const hashedArchiveFiles = await this.mappableSemaphore.map(
          uniqueInputArchiveFiles,
          async (archiveFile) => {
            this.progressBar.incrementInProgress();
            this.progressBar.logTrace(
              `${dat.getName()}: ${candidate.getName()}: calculating checksums for: ${archiveFile.toString()}`,
            );
            const childBar = this.progressBar.addChildBar({
              name: archiveFile.toString(),
              total: archiveFile.getSize(),
              progressFormatter: FsPoly.sizeReadable,
            });

            try {
              const hashedArchiveFile = await this.fileFactory.archiveFileFrom(
                archiveFile.getArchiveEntry(),
                archiveFile.getChecksumBitmask(),
                (progress) => {
                  childBar.setCompleted(progress);
                },
              );

              this.progressBar.incrementCompleted();
              return hashedArchiveFile;
            } finally {
              childBar.delete();
            }
          },
        );

        const filePathsToArchiveFiles = hashedArchiveFiles.reduce((map, archiveFile) => {
          map.set(archiveFile.getFilePath(), archiveFile);
          return map;
        }, new Map<string, ArchiveFile>());

        const hashedRomsWithFiles = candidate.getRomsWithFiles().map((romWithFiles) => {
          if (!this.romWithFilesNeedsProcessing(romWithFiles)) {
            return romWithFiles;
          }

          const hashedInputFile = filePathsToArchiveFiles.get(
            romWithFiles.getInputFile().getFilePath(),
          );
          if (hashedInputFile === undefined) {
            /// This won't happen, but it makes TypeScript happy
            return romWithFiles;
          }

          // {@link CandidateGenerator} would have copied undefined values from the input
          //  file, so we need to modify the expected output file as well for testing
          const hashedOutputFile = romWithFiles.getOutputFile().withProps({
            size: hashedInputFile.getSize(),
            crc32: hashedInputFile.getCrc32(),
            md5: hashedInputFile.getMd5(),
            sha1: hashedInputFile.getSha1(),
            sha256: hashedInputFile.getSha256(),
          });
          return romWithFiles.withInputFile(hashedInputFile).withOutputFile(hashedOutputFile);
        });

        return candidate.withRomsWithFiles(hashedRomsWithFiles);
      }),
    );
  }

  private romWithFilesNeedsProcessing(romWithFiles: ROMWithFiles): boolean {
    if (!(romWithFiles.getInputFile() instanceof ArchiveFile)) {
      return false;
    }

    if (romWithFiles.getInputFile().equals(romWithFiles.getOutputFile())) {
      /**
       * There's no need to calculate the checksum, {@link CandidateWriter} will skip
       * writing over itself
       */
      return false;
    }

    return true;
  }
}
