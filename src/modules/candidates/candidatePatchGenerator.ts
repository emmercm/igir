import path from 'node:path';

import type ProgressBar from '../../console/progressBar.js';
import { ProgressBarSymbol } from '../../console/progressBar.js';
import type DAT from '../../types/dats/dat.js';
import ROM from '../../types/dats/rom.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import File from '../../types/files/file.js';
import type Patch from '../../types/patches/patch.js';
import ROMWithFiles from '../../types/romWithFiles.js';
import WriteCandidate from '../../types/writeCandidate.js';
import Module from '../module.js';

/**
 * For each {@link Patch} that matches a {@link ROM}, generate a new {@link Game} and
 * {@link WriteCandidate} of that {@link Game}.
 */
export default class CandidatePatchGenerator extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, CandidatePatchGenerator.name);
  }

  /**
   * Generate the patched candidates.
   */
  async generate(
    dat: DAT,
    candidates: WriteCandidate[],
    patches: Patch[],
  ): Promise<WriteCandidate[]> {
    if (candidates.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no candidates to make patched candidates for`);
      return candidates;
    }

    if (patches.length === 0) {
      this.progressBar.logTrace(`${dat.getName()}: no patches to make patched candidates for`);
      return candidates;
    }

    this.progressBar.logTrace(`${dat.getName()}: generating patched candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_GENERATING);
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
      const key = patch.getCrcBefore();
      if (map.has(key)) {
        map.get(key)?.push(patch);
      } else {
        map.set(key, [patch]);
      }
      return map;
    }, new Map<string, Patch[]>());
  }

  private async build(
    dat: DAT,
    candidates: WriteCandidate[],
    crcToPatches: Map<string, Patch[]>,
  ): Promise<WriteCandidate[]> {
    return (
      await Promise.all(
        candidates.map(async (unpatchedCandidate) => {
          // Possibly generate multiple new patched candidates for the ReleaseCandidates
          const patchedCandidates = await this.buildPatchedCandidates(
            dat,
            unpatchedCandidate,
            crcToPatches,
          );
          return [unpatchedCandidate, ...patchedCandidates];
        }),
      )
    ).flat();
  }

  private async buildPatchedCandidates(
    dat: DAT,
    unpatchedCandidate: WriteCandidate,
    crcToPatches: Map<string, Patch[]>,
  ): Promise<WriteCandidate[]> {
    // Get all patch files relevant to any ROM in the ReleaseCandidate
    const candidatePatches = unpatchedCandidate
      .getRomsWithFiles()
      .flatMap((romWithFiles) => romWithFiles.getInputFile())
      .flatMap((inputFile) => {
        const inputFileCrc32 = inputFile.getCrc32();
        if (inputFileCrc32 === undefined) {
          return [];
        }
        return crcToPatches.get(inputFileCrc32);
      })
      .filter((patch) => patch !== undefined);

    // No relevant patches found, no new candidates generated
    if (candidatePatches.length === 0) {
      return [];
    }

    // Generate new, patched candidates for each patch
    return Promise.all(
      candidatePatches.map(async (patch) => {
        const patchedRomName = patch.getRomName();

        const romsWithFiles = await Promise.all(
          unpatchedCandidate.getRomsWithFiles().map(async (romWithFiles) => {
            // Apply the new filename
            let rom = romWithFiles.getRom();
            let inputFile = romWithFiles.getInputFile();
            let outputFile = romWithFiles.getOutputFile();

            // Apply the patch to the appropriate file
            if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
              // Attach the patch to the input file
              inputFile = inputFile.withPatch(patch);

              // Build a new output file
              const extMatch = /[^.]+((\.[a-zA-Z0-9]+)+)$/.exec(romWithFiles.getRom().getName());
              const extractedFileName = patchedRomName + (extMatch === null ? '' : extMatch[1]);
              if (outputFile instanceof ArchiveEntry) {
                outputFile = await ArchiveEntry.entryOf({
                  archive: outputFile.getArchive().withFilePath(patchedRomName),
                  // Output is an archive of a single file, the entry path should also change
                  entryPath:
                    unpatchedCandidate.getRomsWithFiles().length === 1
                      ? extractedFileName
                      : outputFile.getEntryPath(),
                  size: patch.getSizeAfter(),
                  crc32: patch.getCrcAfter(),
                  fileHeader: outputFile.getFileHeader(),
                  patch: outputFile.getPatch(),
                });
              } else {
                const dirName = path.dirname(outputFile.getFilePath());
                outputFile = await File.fileOf({
                  filePath: path.join(dirName, extractedFileName),
                  size: patch.getSizeAfter(),
                  crc32: patch.getCrcAfter(),
                  fileHeader: outputFile.getFileHeader(),
                  patch: outputFile.getPatch(),
                });
              }

              // Build a new ROM from the output file's info
              const romName = path.join(
                path.dirname(rom.getName().replaceAll(/[\\/]/g, path.sep)),
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
          }),
        );

        // Build a new Game from the ROM's info
        const gameName = path.join(
          path.dirname(unpatchedCandidate.getGame().getName().replaceAll(/[\\/]/g, path.sep)),
          patchedRomName,
        );
        const patchedGame = unpatchedCandidate.getGame().withProps({
          name: gameName,
        });
        return new WriteCandidate(patchedGame, romsWithFiles);
      }),
    );
  }
}
