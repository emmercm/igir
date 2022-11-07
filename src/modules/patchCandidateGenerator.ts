import ProgressBar, { Symbols } from '../console/progressBar.js';
import FileFactory from '../types/archives/fileFactory.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Patch from '../types/patches/patch.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';
import Module from './module.js';

export default class PatchCandidateGenerator extends Module {
  constructor(progressBar: ProgressBar) {
    super(progressBar, PatchCandidateGenerator.name);
  }

  async generate(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
    patches: Patch[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    await this.progressBar.logInfo(`${dat.getName()}: Generating patched candidates`);

    if (!parentsToCandidates.size) {
      await this.progressBar.logDebug(`${dat.getName()}: No parents to make patched candidates for`);
      return parentsToCandidates;
    }

    await this.progressBar.setSymbol(Symbols.GENERATING);
    await this.progressBar.reset(dat.getParents().length);

    const crcToPatches = PatchCandidateGenerator.indexPatchesByCrcBefore(patches);
    await this.progressBar.logDebug(`${dat.getName()}: ${crcToPatches.size} unique patches found`);

    const patchedParentsToCandidates = new Map(
      await Promise.all([...parentsToCandidates.entries()]
        .map(async ([parent, releaseCandidates]) => {
          const patchedReleaseCandidates = (await Promise.all(releaseCandidates
            .map(async (releaseCandidate) => this.buildPatchedReleaseCandidate(
              dat,
              releaseCandidate,
              crcToPatches,
            )))).flatMap((rcs) => rcs);

          return [parent, [...releaseCandidates, ...patchedReleaseCandidates]];
        })) as [Parent, ReleaseCandidate[]][],
    );

    await this.progressBar.logInfo(`${dat.getName()}: Done generating patched candidates`);
    return patchedParentsToCandidates;
  }

  private static indexPatchesByCrcBefore(patches: Patch[]): Map<string, Patch[]> {
    return patches.reduce((map, patch) => {
      map.set(patch.getCrcBefore(), [
        ...(map.get(patch.getCrcBefore()) || []),
        patch,
      ]);
      return map;
    }, new Map<string, Patch[]>());
  }

  private async buildPatchedReleaseCandidate(
    dat: DAT,
    unpatchedReleaseCandidate: ReleaseCandidate,
    crcToPatches: Map<string, Patch[]>,
  ): Promise<ReleaseCandidate[]> {
    const releaseCandidatePatches = unpatchedReleaseCandidate.getRomsWithFiles()
      .map((romWithFiles) => crcToPatches.get(romWithFiles.getRom().getCrc32()))
      .flatMap((patches) => patches)
      .filter((patch) => patch) as Patch[];

    // No relevant patches found, no new candidates generated
    if (!releaseCandidatePatches.length) {
      return [];
    }

    // Generate new, patched candidates for the parent
    return Promise.all(releaseCandidatePatches.map(async (patch) => {
      const patchedRomName = patch.getRomName();

      const romsWithFiles = await Promise.all(unpatchedReleaseCandidate.getRomsWithFiles()
        .map(async (romWithFiles) => {
          // Apply the new filename
          const rom = romWithFiles.getRom();
          let inputFile = romWithFiles.getInputFile();
          let outputFile = await romWithFiles.getOutputFile().withFileName(patchedRomName);

          // Apply the patch
          if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
            inputFile = await inputFile.withPatch(patch);
            outputFile = await outputFile.withFileName(patchedRomName);

            if (FileFactory.isArchive(outputFile.getFilePath())
              && unpatchedReleaseCandidate.getRomsWithFiles().length === 1
            ) {
              // Output is an archive of a single file, the entry path should also change
              outputFile = await outputFile.withExtractedFilePath(patchedRomName);
            }

            await this.progressBar.logTrace(`${dat.getName()}: ${inputFile.toString()}: patch candidate generated: ${outputFile.toString()}`);
          }

          return new ROMWithFiles(rom, inputFile, outputFile);
        }));

      return new ReleaseCandidate(
        unpatchedReleaseCandidate.getGame(),
        unpatchedReleaseCandidate.getRelease(),
        romsWithFiles,
      );
    }));
  }
}
