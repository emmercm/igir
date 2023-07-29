import path from 'path';

import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import ArchiveEntry from '../types/files/archives/archiveEntry.js';
import File from '../types/files/file.js';
import DAT from '../types/logiqx/dat.js';
import Game from '../types/logiqx/game.js';
import Parent from '../types/logiqx/parent.js';
import Release from '../types/logiqx/release.js';
import ROM from '../types/logiqx/rom.js';
import Options from '../types/options.js';
import Patch from '../types/patches/patch.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

export default class PatchCandidateGenerator extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, PatchCandidateGenerator.name);
    this.options = options;
  }

  async generate(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
    patches: Patch[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    this.progressBar.logInfo(`${dat.getNameShort()}: generating patched candidates`);

    if (!parentsToCandidates.size) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no parents to make patched candidates for`);
      return parentsToCandidates;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.GENERATING);
    await this.progressBar.reset(parentsToCandidates.size);

    const crcToPatches = PatchCandidateGenerator.indexPatchesByCrcBefore(patches);
    this.progressBar.logDebug(`${dat.getNameShort()}: ${crcToPatches.size} unique patches found`);

    const patchedParentsToCandidates = this.build(dat, parentsToCandidates, crcToPatches);
    this.progressBar.logInfo(`${dat.getNameShort()}: done generating patched candidates`);

    return patchedParentsToCandidates;
  }

  private static indexPatchesByCrcBefore(patches: Patch[]): Map<string, Patch[]> {
    return patches.reduce((map, patch) => {
      map.set(patch.getCrcBefore(), [
        ...(map.get(patch.getCrcBefore()) ?? []),
        patch,
      ]);
      return map;
    }, new Map<string, Patch[]>());
  }

  private async build(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
    crcToPatches: Map<string, Patch[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    // For every parent
    return new Map((await Promise.all([...parentsToCandidates.entries()]
      // For every Parent's ReleaseCandidates
      .map(async ([parent, releaseCandidates]): Promise<[Parent, ReleaseCandidate[]][]> => {
        // ReleaseCandidates exist for every Release of a Game, but we only want to create one new
        //  ReleaseCandidate for each Game, so remember which Games we've seen for this Parent
        const seenGames = new Map<Game, boolean>();

        const parentsAndReleaseCandidates: [Parent, ReleaseCandidate[]][] = [
          [parent, releaseCandidates],
        ];

        // Possibly generate multiple new Parents for the ReleaseCandidates
        /* eslint-disable no-await-in-loop */
        for (let i = 0; i < releaseCandidates.length; i += 1) {
          const releaseCandidate = releaseCandidates[i];
          if (seenGames.has(releaseCandidate.getGame())) {
            // eslint-disable-next-line no-continue
            continue;
          }

          const patchedParents = await this.buildPatchedParentsForReleaseCandidate(
            dat,
            releaseCandidate,
            crcToPatches,
          );
          seenGames.set(releaseCandidate.getGame(), true);

          if (patchedParents) {
            parentsAndReleaseCandidates.push(...patchedParents);
          }
        }

        return parentsAndReleaseCandidates;
      })))
      .flatMap((entries) => entries));
  }

  private async buildPatchedParentsForReleaseCandidate(
    dat: DAT,
    unpatchedReleaseCandidate: ReleaseCandidate,
    crcToPatches: Map<string, Patch[]>,
  ): Promise<[Parent, ReleaseCandidate[]][] | undefined> {
    // Get all patch files relevant to any ROM in the ReleaseCandidate
    const releaseCandidatePatches = unpatchedReleaseCandidate.getRomsWithFiles()
      .map((romWithFiles) => crcToPatches.get(romWithFiles.getInputFile().getCrc32()))
      .flatMap((patches) => patches)
      .filter((patch) => patch) as Patch[];

    // No relevant patches found, no new candidates generated
    if (!releaseCandidatePatches.length) {
      return undefined;
    }

    // Generate new, patched candidates for the parent
    return Promise.all(releaseCandidatePatches.map(async (patch) => {
      const patchedRomName = patch.getRomName();

      const romsWithFiles = await Promise.all(unpatchedReleaseCandidate.getRomsWithFiles()
        .map(async (romWithFiles) => {
          // Apply the new filename
          let rom = romWithFiles.getRom();
          let inputFile = romWithFiles.getInputFile();
          let outputFile = romWithFiles.getOutputFile();

          // Apply the patch to the appropriate file
          if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
            // Attach the patch to the input file
            inputFile = await inputFile.withPatch(patch);

            // Build a new output file
            const extMatch = romWithFiles.getRom().getName().match(/[^.]+((\.[a-zA-Z0-9]+)+)$/);
            const extractedFileName = patchedRomName + (extMatch !== null ? extMatch[1] : '');
            if (outputFile instanceof ArchiveEntry) {
              outputFile = await ArchiveEntry.entryOf(
                await outputFile.getArchive().withFilePath(patchedRomName),
                // Output is an archive of a single file, the entry path should also change
                unpatchedReleaseCandidate.getRomsWithFiles().length === 1
                  ? extractedFileName
                  : outputFile.getEntryPath(),
                patch.getSizeAfter() ?? 0,
                patch.getCrcAfter() ?? '00000000',
                outputFile.getFileHeader(),
                outputFile.getPatch(),
              );
            } else {
              const dirName = path.dirname(outputFile.getFilePath());
              outputFile = await File.fileOf(
                path.join(dirName, extractedFileName),
                patch.getSizeAfter() ?? 0,
                patch.getCrcAfter() ?? '00000000',
                outputFile.getFileHeader(),
                outputFile.getPatch(),
              );
            }

            // Build a new ROM from the output file's info
            let romName = path.basename(outputFile.getExtractedFilePath());
            if (dat.getRomNamesContainDirectories()) {
              romName = path.join(
                path.dirname(rom.getName().replace(/[\\/]/g, path.sep)),
                romName,
              );
            }
            rom = new ROM(
              romName,
              outputFile.getSize(),
              outputFile.getCrc32(),
            );

            this.progressBar.logTrace(`${dat.getNameShort()}: ${inputFile.toString()}: patch candidate generated: ${outputFile.toString()}`);
          }

          return new ROMWithFiles(rom, inputFile, outputFile);
        }));

      // Build a new Game from the ROM's info
      let gameName = patchedRomName;
      if (dat.getRomNamesContainDirectories()) {
        gameName = path.join(
          path.dirname(unpatchedReleaseCandidate.getGame().getName().replace(/[\\/]/g, path.sep)),
          gameName,
        );
      }
      const patchedGame = new Game({
        ...unpatchedReleaseCandidate.getGame(),
        name: gameName,
      });

      const parent = new Parent(patchedRomName, [patchedGame]);

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

      const releaseCandidate = new ReleaseCandidate(
        patchedGame,
        patchedRelease,
        romsWithFiles,
      );

      return [parent, [releaseCandidate]];
    }));
  }
}
