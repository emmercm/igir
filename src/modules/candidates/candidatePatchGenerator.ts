import path from 'node:path';

import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import DAT from '../../types/dats/dat.js';
import Game from '../../types/dats/game.js';
import Parent from '../../types/dats/parent.js';
import Release from '../../types/dats/release.js';
import ROM from '../../types/dats/rom.js';
import ArchiveEntry from '../../types/files/archives/archiveEntry.js';
import File from '../../types/files/file.js';
import Patch from '../../types/patches/patch.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import ROMWithFiles from '../../types/romWithFiles.js';
import Module from '../module.js';

/**
 * For each {@link Patch} that matches a {@link ROM}, generate a new {@link Parent} and
 * {@link ReleaseCandidate} of that {@link Game}.
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
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
    patches: Patch[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents to make patched candidates for`);
      return parentsToCandidates;
    }

    this.progressBar.logTrace(`${dat.getNameShort()}: generating patched candidates`);
    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_GENERATING);
    this.progressBar.reset(parentsToCandidates.size);

    const crcToPatches = CandidatePatchGenerator.indexPatchesByCrcBefore(patches);
    this.progressBar.logTrace(
      `${dat.getNameShort()}: ${crcToPatches.size} unique patch${crcToPatches.size !== 1 ? 'es' : ''} found`,
    );

    const patchedParentsToCandidates = this.build(dat, parentsToCandidates, crcToPatches);
    this.progressBar.logTrace(`${dat.getNameShort()}: done generating patched candidates`);

    return patchedParentsToCandidates;
  }

  private static indexPatchesByCrcBefore(patches: Patch[]): Map<string, Patch[]> {
    return patches.reduce((map, patch) => {
      const key = patch.getCrcBefore();
      if (!map.has(key)) {
        map.set(key, [patch]);
      } else {
        map.get(key)?.push(patch);
      }
      return map;
    }, new Map<string, Patch[]>());
  }

  private async build(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
    crcToPatches: Map<string, Patch[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    // For every parent
    return new Map(
      (
        await Promise.all(
          [...parentsToCandidates.entries()]
            // For every Parent's ReleaseCandidates
            .map(async ([parent, releaseCandidates]): Promise<[Parent, ReleaseCandidate[]][]> => {
              // ReleaseCandidates exist for every Release of a Game, but we only want to create one new
              //  ReleaseCandidate for each Game, so remember which Games we've seen for this Parent
              const seenGames = new Set<Game>();

              let parentsAndReleaseCandidates: [Parent, ReleaseCandidate[]][] = [
                [parent, releaseCandidates],
              ];

              // Possibly generate multiple new Parents for the ReleaseCandidates
              for (const releaseCandidate of releaseCandidates) {
                if (seenGames.has(releaseCandidate.getGame())) {
                  continue;
                }

                const patchedParents = await this.buildPatchedParentsForReleaseCandidate(
                  dat,
                  releaseCandidate,
                  crcToPatches,
                );
                seenGames.add(releaseCandidate.getGame());

                if (patchedParents) {
                  parentsAndReleaseCandidates = [...parentsAndReleaseCandidates, ...patchedParents];
                }
              }

              return parentsAndReleaseCandidates;
            }),
        )
      ).flat(),
    );
  }

  private async buildPatchedParentsForReleaseCandidate(
    dat: DAT,
    unpatchedReleaseCandidate: ReleaseCandidate,
    crcToPatches: Map<string, Patch[]>,
  ): Promise<[Parent, ReleaseCandidate[]][] | undefined> {
    // Get all patch files relevant to any ROM in the ReleaseCandidate
    const releaseCandidatePatches = unpatchedReleaseCandidate
      .getRomsWithFiles()
      .flatMap((romWithFiles) => romWithFiles.getInputFile())
      .filter((inputFile) => inputFile.getCrc32() !== undefined)
      .flatMap((inputFile) => crcToPatches.get(inputFile.getCrc32() as string))
      .filter((patch) => patch !== undefined);

    // No relevant patches found, no new candidates generated
    if (releaseCandidatePatches.length === 0) {
      return undefined;
    }

    // Generate new, patched candidates for the parent
    return Promise.all(
      releaseCandidatePatches.map(async (patch) => {
        const patchedRomName = patch.getRomName();

        const romsWithFiles = await Promise.all(
          unpatchedReleaseCandidate.getRomsWithFiles().map(async (romWithFiles) => {
            // Apply the new filename
            let rom = romWithFiles.getRom();
            let inputFile = romWithFiles.getInputFile();
            let outputFile = romWithFiles.getOutputFile();

            // Apply the patch to the appropriate file
            if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
              // Attach the patch to the input file
              inputFile = inputFile.withPatch(patch);

              // Build a new output file
              const extMatch = romWithFiles
                .getRom()
                .getName()
                .match(/[^.]+((\.[a-zA-Z0-9]+)+)$/);
              const extractedFileName = patchedRomName + (extMatch !== null ? extMatch[1] : '');
              if (outputFile instanceof ArchiveEntry) {
                outputFile = await ArchiveEntry.entryOf({
                  archive: await outputFile.getArchive().withFilePath(patchedRomName),
                  // Output is an archive of a single file, the entry path should also change
                  entryPath:
                    unpatchedReleaseCandidate.getRomsWithFiles().length === 1
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
                path.dirname(rom.getName().replace(/[\\/]/g, path.sep)),
                path.basename(outputFile.getExtractedFilePath()),
              );
              rom = new ROM({
                name: romName,
                size: outputFile.getSize(),
                crc32: outputFile.getCrc32(),
              });

              this.progressBar.logTrace(
                `${dat.getNameShort()}: ${inputFile.toString()}: patch candidate generated: ${outputFile.toString()}`,
              );
            }

            return new ROMWithFiles(rom, inputFile, outputFile);
          }),
        );

        // Build a new Game from the ROM's info
        const gameName = path.join(
          path.dirname(unpatchedReleaseCandidate.getGame().getName().replace(/[\\/]/g, path.sep)),
          patchedRomName,
        );
        const patchedGame = unpatchedReleaseCandidate.getGame().withProps({
          name: gameName,
        });

        const parent = new Parent(patchedGame);

        let patchedRelease;
        const unpatchedRelease = unpatchedReleaseCandidate.getRelease();
        if (unpatchedRelease) {
          // If the original ROM has release info, continue to use that
          patchedRelease = new Release(
            patchedRomName,
            unpatchedRelease.getRegion(),
            unpatchedRelease.getLanguage(),
          );
        }

        const releaseCandidate = new ReleaseCandidate(patchedGame, patchedRelease, romsWithFiles);

        return [parent, [releaseCandidate]];
      }),
    );
  }
}
