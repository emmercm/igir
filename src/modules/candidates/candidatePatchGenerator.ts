import path from 'node:path';

import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type DAT from '../../types/dats/dat.js';
import ROM from '../../types/dats/rom.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import ArchiveFile from '../../types/files/archives/archiveFile.js';
import Zip from '../../types/files/archives/zip.js';
import type Options from '../../types/options.js';
import type Patch from '../../types/patches/patch.js';
import ROMWithFiles from '../../types/romWithFiles.js';
import WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

/**
 * For each {@link Patch} that matches a {@link ROM}, generate a new {@link Game} and
 * {@link WriteCandidate} of that {@link Game}.
 */
export default class CandidatePatchGenerator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidatePatchGenerator.name);
    this.options = options;
  }

  /**
   * Generate the patched candidates.
   */
  generate(dat: DAT, candidates: WriteCandidate[], patches: Patch[]): WriteCandidate[] {
    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to make patched candidates for`);
      return candidates;
    }

    if (patches.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no patches to make patched candidates for`);
      return candidates;
    }

    this.progressBar.logTrace(`${dat.getName()}: generating patched candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_PATCHING);
    this.progressBar.resetProgress(candidates.length);

    const crcToPatches = CandidatePatchGenerator.indexPatchesByCrcBefore(patches);
    this.progressBar.logTrace(
      `${dat.getName()}: ${crcToPatches.size} unique patch${crcToPatches.size === 1 ? '' : 'es'} found`,
    );

    const patchedCandidates = this.build(dat, candidates, crcToPatches);
    this.progressBar.logTrace(`${dat.getName()}: done generating patched candidates`);

    return patchedCandidates;
  }

  private static indexPatchesByCrcBefore(patches: Patch[]): Map<string, Patch[]> {
    return patches.reduce((map, patch) => {
      const key = patch.getCrcBefore().toLowerCase();
      if (map.has(key)) {
        map.get(key)?.push(patch);
      } else {
        map.set(key, [patch]);
      }
      return map;
    }, new Map<string, Patch[]>());
  }

  private build(
    dat: DAT,
    candidates: WriteCandidate[],
    crcToPatches: Map<string, Patch[]>,
  ): WriteCandidate[] {
    if (this.options.getPatchOnly()) {
      this.progressBar.logTrace(`${dat.getName()}: only returning patched candidates`);
    }

    return candidates.flatMap((unpatchedCandidate) => {
      // Possibly generate multiple new patched candidates for the WriteCandidates
      const patchedCandidates = this.buildPatchedCandidates(dat, unpatchedCandidate, crcToPatches);
      if (this.options.getPatchOnly()) {
        return patchedCandidates;
      }
      return [unpatchedCandidate, ...patchedCandidates];
    });
  }

  private buildPatchedCandidates(
    dat: DAT,
    unpatchedCandidate: WriteCandidate,
    crcToPatches: Map<string, Patch[]>,
  ): WriteCandidate[] {
    // If the WriteCandidate has any ArchiveFile input files, then we must not be extracting; and
    // therefore we can only patch it if we can zip every ROM
    if (
      unpatchedCandidate
        .getRomsWithFiles()
        .some(
          (romWithFiles) =>
            romWithFiles.getInputFile() instanceof ArchiveFile &&
            !this.options.shouldZipRom(romWithFiles.getRom()),
        )
    ) {
      return [];
    }

    // Get all patch files relevant to any ROM in the WriteCandidate
    const candidatePatches = unpatchedCandidate.getRomsWithFiles().flatMap((romWithFiles) => {
      const inputFile = romWithFiles.getInputFile();

      // Match against ArchiveFile's underlying ArchiveEntry
      if (inputFile instanceof ArchiveFile) {
        const entryCrc32 = inputFile.getArchiveEntry().getCrc32();
        if (entryCrc32 === undefined) {
          return [];
        }
        return crcToPatches.get(entryCrc32) ?? [];
      }

      const inputFileCrc32 = inputFile.getCrc32();
      if (inputFileCrc32 === undefined) {
        return [];
      }
      return crcToPatches.get(inputFileCrc32) ?? [];
    });

    // No relevant patches found, no new candidates generated
    if (candidatePatches.length === 0) {
      return [];
    }

    // Generate new, patched candidates for each patch
    return candidatePatches.map((patch) => {
      const patchedRomName = patch.getRomName();

      const romsWithFiles = unpatchedCandidate.getRomsWithFiles().map((romWithFiles) => {
        // Apply the new filename
        let rom = romWithFiles.getRom();
        let inputFile = romWithFiles.getInputFile();
        let outputFile = romWithFiles.getOutputFile();

        if (inputFile instanceof ArchiveFile) {
          // Convert ArchiveFile inputs to their underlying ArchiveEntry
          const archiveEntry = inputFile.getArchiveEntry();
          inputFile = archiveEntry;

          // The only reason we can patch a ArchiveFile is if we're zipping
          outputFile = archiveEntry.withProps({
            archive: new Zip(outputFile.getFilePath()),
            entryPath: archiveEntry.getEntryPath(),
          });
        }

        // Apply the patch to the appropriate file
        if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
          // Attach the patch to the input file
          inputFile = inputFile.withPatch(patch);

          // Build a new output file
          const extMatch = /[^.]+((\.[a-zA-Z0-9]+)+)$/.exec(romWithFiles.getRom().getName());
          const extractedFileName = patchedRomName + (extMatch === null ? '' : extMatch[1]);
          if (outputFile instanceof ArchiveEntry) {
            outputFile = outputFile.withProps({
              archive: outputFile
                .getArchive()
                .withFilePath(
                  path.join(path.dirname(outputFile.getFilePath()), patchedRomName) +
                    outputFile.getArchive().getExtension(),
                ),
              // Output is an archive of a single file, the entry path should also change
              entryPath:
                unpatchedCandidate.getRomsWithFiles().length === 1
                  ? extractedFileName
                  : outputFile.getEntryPath(),
              size: patch.getSizeAfter(),
              crc32: patch.getCrcAfter(),
              md5: undefined,
              sha1: undefined,
              sha256: undefined,
            });
          } else {
            const dirName = path.dirname(outputFile.getFilePath());
            outputFile = outputFile.withFilePath(path.join(dirName, extractedFileName)).withProps({
              size: patch.getSizeAfter(),
              crc32: patch.getCrcAfter(),
              md5: undefined,
              sha1: undefined,
              sha256: undefined,
            });
          }

          // Build a new ROM from the output file's info
          const romName = path.join(
            path.dirname(rom.getName().replaceAll('/', path.sep)),
            path.basename(outputFile.getExtractedFilePath()),
          );
          rom = new ROM({
            name: romName,
            size: outputFile.getSize(),
            crc32: outputFile.getCrc32(),
          });

          this.progressBar.logTrace(
            `${dat.getName()}: ${inputFile.toString()}: patch candidate generated: ${outputFile.toString()}`,
          );
        }

        return new ROMWithFiles(rom, inputFile, outputFile);
      });

      // Build a new Game from the ROM's info
      const gameName = path.join(
        path.dirname(unpatchedCandidate.getGame().getName().replaceAll(/[\\/]/g, path.sep)),
        patchedRomName,
      );
      const patchedGame = unpatchedCandidate.getGame().withProps({
        name: gameName,
      });
      return new WriteCandidate(patchedGame, romsWithFiles);
    });
  }
}
