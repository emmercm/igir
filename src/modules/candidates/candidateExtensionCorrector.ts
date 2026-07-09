import path from 'node:path';

import type { Semaphore } from 'async-mutex';

import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import FileFactory from '../../factories/fileFactory.js';
import type DAT from '../../models/dats/dat.js';
import type ROM from '../../models/dats/rom.js';
import ArchiveEntry from '../../models/files/archives/archiveEntry.js';
import Chd from '../../models/files/archives/chd/chd.js';
import type File from '../../models/files/file.js';
import type FileSignature from '../../models/files/fileSignature.js';
import ZeroSizeFile from '../../models/files/zeroSizeFile.js';
import type Options from '../../models/options.js';
import { FixExtension } from '../../models/options.js';
import type ROMWithFiles from '../../models/romWithFiles.js';
import type WriteCandidate from '../../models/writeCandidate.js';
import OutputFactory from '../../modules/candidates/utils/outputFactory.js';
import ArrayUtil from '../../utils/arrayUtil.js';
import IntlUtil from '../../utils/intlUtil.js';
import Module from '../module.js';

/**
 * Correct the extensions of output {@link File}s when:
 *  1. Not using any DATs (i.e. there's no correction already happening elsewhere)
 *  2. The DAT-supplied ROM name is falsey
 */
export default class CandidateExtensionCorrector extends Module {
  private readonly options: Options;
  private readonly fileFactory: FileFactory;
  private readonly readerSemaphore: Semaphore;

  constructor(
    options: Options,
    progressBar: ProgressBar,
    fileFactory: FileFactory,
    readerSemaphore: Semaphore,
  ) {
    super(progressBar, CandidateExtensionCorrector.name);
    this.options = options;
    this.fileFactory = fileFactory;
    this.readerSemaphore = readerSemaphore;
  }

  /**
   * Correct the file extensions.
   */
  async correct(dat: DAT, candidates: WriteCandidate[]): Promise<WriteCandidate[]> {
    if (candidates.length === 0) {
      this.prefixedLogger.trace(`${dat.getName()}: no candidates to correct extensions for`);
      return candidates;
    }

    const romsThatNeedCorrecting = candidates
      .flatMap((candidate) => candidate.getRomsWithFiles())
      .filter((romWithFiles) => this.romNeedsCorrecting(romWithFiles)).length;
    if (romsThatNeedCorrecting === 0) {
      this.prefixedLogger.trace(`${dat.getName()}: no output files need their extension corrected`);
      return candidates;
    }

    this.prefixedLogger.trace(
      `${dat.getName()}: correcting ${IntlUtil.toLocaleString(romsThatNeedCorrecting)} output file extension${romsThatNeedCorrecting === 1 ? '' : 's'}`,
    );
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_EXTENSION_CORRECTION);
    this.progressBar.resetProgress(romsThatNeedCorrecting);

    const correctedCandidates = await this.correctExtensions(dat, candidates);

    this.prefixedLogger.trace(`${dat.getName()}: done correcting output file extensions`);
    return correctedCandidates;
  }

  private romNeedsCorrecting(romWithFiles: ROMWithFiles): boolean {
    if (romWithFiles.getInputFile() instanceof ZeroSizeFile) {
      return false;
    }

    if (romWithFiles.getRom().getName().trim() === '') {
      return true;
    }

    const inputFile = romWithFiles.getInputFile();
    if (inputFile instanceof ArchiveEntry && inputFile.getArchive() instanceof Chd) {
      // Files within CHDs never need extension correction
      return false;
    }

    return (
      this.options.getFixExtension() === FixExtension.ALWAYS ||
      (this.options.getFixExtension() === FixExtension.AUTO &&
        !this.options.shouldDir2Dat() &&
        (!this.options.usingDats() || romWithFiles.getRom().getName().trim() === ''))
    );
  }

  private async correctExtensions(
    dat: DAT,
    candidates: WriteCandidate[],
  ): Promise<WriteCandidate[]> {
    return await Promise.all(
      candidates.map(async (candidate) => {
        // Correct the extension of ROMs
        const correctedRoms = (
          await Promise.all(
            candidate.getRomsWithFiles().map(async (romWithFiles) => {
              const correctedRom = await this.buildCorrectedRom(dat, candidate, romWithFiles);
              return romWithFiles.withRom(correctedRom);
            }),
          )
        )
          // Eliminate duplicate ROMs caused by extension correction
          .filter(ArrayUtil.filterUniqueMapped((romWithFiles) => romWithFiles.getRom().hashCode()));

        const correctedGame = candidate
          .getGame()
          .withProps({ roms: correctedRoms.map((romWithFiles) => romWithFiles.getRom()) });

        // Generate a new output path for every ROM; this must be done AFTER any duplicate ROMs
        // have been removed
        const correctedOutputPaths = correctedRoms.map((romWithFiles) => {
          const correctedOutputPath = OutputFactory.getPath(
            this.options,
            dat,
            correctedGame,
            romWithFiles.getRom(),
            romWithFiles.getInputFile(),
          );
          let correctedOutputFile = romWithFiles
            .getOutputFile()
            .withFilePath(correctedOutputPath.format());
          if (correctedOutputFile instanceof ArchiveEntry) {
            correctedOutputFile = correctedOutputFile.withEntryPath(correctedOutputPath.entryPath);
          }
          return romWithFiles.withOutputFile(correctedOutputFile);
        });

        return candidate.withGame(correctedGame).withRomsWithFiles(correctedOutputPaths);
      }),
    );
  }

  private async buildCorrectedRom(
    dat: DAT,
    candidate: WriteCandidate,
    romWithFiles: ROMWithFiles,
  ): Promise<ROM> {
    let correctedRom = romWithFiles.getRom();

    if (correctedRom.getName().trim() === '') {
      // The ROM doesn't have any filename, default it. Because we never knew a file extension,
      // doing this isn't considered a "correction".
      const romWithFilesIdx = candidate.getRomsWithFiles().indexOf(romWithFiles);
      correctedRom = correctedRom.withName(
        `${candidate
          .getGame()
          .getName()}${candidate.getRomsWithFiles().length > 1 ? ` (File ${romWithFilesIdx + 1})` : ''}.rom`,
      );
    }

    if (!this.romNeedsCorrecting(romWithFiles)) {
      // Do no further processing if we're not correcting the extension
      return correctedRom;
    }

    await this.readerSemaphore.runExclusive(async () => {
      this.progressBar.incrementInProgress();
      this.prefixedLogger.trace(
        `${dat.getName()}: ${candidate.getName()}: determining correct ROM extension for: ${romWithFiles
          .getInputFile()
          .toString()}`,
      );
      const childBar = this.progressBar.addChildBar({
        name: romWithFiles.getInputFile().toString(),
      });

      try {
        const correctedRomName = await this.correctFromFileSignature(
          dat,
          correctedRom,
          romWithFiles.getInputFile(),
        );
        if (correctedRomName === undefined) {
          this.prefixedLogger.trace(
            `${dat.getName()}: ${candidate.getName()}: didn't find correct ROM extension`,
          );
        } else if (correctedRomName !== correctedRom.getName()) {
          correctedRom = correctedRom.withName(correctedRomName);
          this.prefixedLogger.trace(
            `${dat.getName()}: ${candidate.getName()}: found correct ROM extension: ${path.posix.basename(correctedRomName)}`,
          );
        }
      } finally {
        childBar.delete();
      }

      this.progressBar.incrementCompleted();
    });

    return correctedRom;
  }

  private async correctFromFileSignature(
    dat: DAT,
    correctedRom: ROM,
    inputFile: File,
  ): Promise<string | undefined> {
    // Try to correct the name based on file signature
    let fileSignature: FileSignature | undefined;
    try {
      fileSignature = await this.fileFactory.signatureFrom(inputFile);
    } catch (error) {
      this.prefixedLogger.error(
        `${dat.getName()}: failed to correct file extension for '${inputFile.toString()}': ${error}`,
      );
    }
    if (fileSignature !== undefined) {
      // Replace the file's existing extension (if any) with the one detected from its signature.
      // A strict extension regex is used rather than path.parse(), which would mistake a period
      // inside the filename for an extension and truncate everything after it.
      const extensionRegex = /\.[a-zA-Z0-9]+$/;
      const oldExtension = extensionRegex.exec(correctedRom.getName())?.at(0);
      let newExtension = fileSignature.getExtension();
      // If the old extension was all uppercase, match that casing for the new extension
      if (oldExtension !== undefined && /[A-Z]/.test(oldExtension) && !/[a-z]/.test(oldExtension)) {
        newExtension = newExtension.toUpperCase();
      }
      return correctedRom.getName().replace(extensionRegex, '') + newExtension;
    }

    // Warn if we know the raw file doesn't have the correct extension, but we don't know what it should be
    if (!(inputFile instanceof ArchiveEntry)) {
      const dotSplit = correctedRom.getName().split('.');
      const archiveIndex = dotSplit.findIndex((_, idx) =>
        FileFactory.isExtensionArchive(dotSplit.slice(0, idx + 1).join('.')),
      );
      if (archiveIndex !== -1) {
        const archiveExtension = dotSplit.slice(archiveIndex).join('.');
        this.prefixedLogger.warn(
          `${dat.getName()}: ${inputFile.toString()}: file is not a ${archiveExtension} archive, but the correct extension isn't known`,
        );
      }
    }

    return undefined;
  }
}
