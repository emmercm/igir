import ProgressBar, { Symbols } from '../console/progressBar.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Patch from '../types/patches/patch.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';

export default class PatchCandidateGenerator {
  private readonly progressBar: ProgressBar;

  constructor(progressBar: ProgressBar) {
    this.progressBar = progressBar;
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
    await this.progressBar.logInfo(`${crcToPatches.size} unique patches found`);

    return new Map(
      await Promise.all([...parentsToCandidates.entries()]
        .map(async ([parent, releaseCandidates]) => {
          const patchedReleaseCandidates = (await Promise.all(releaseCandidates
            .map(async (releaseCandidate) => PatchCandidateGenerator.buildPatchedReleaseCandidate(
              releaseCandidate,
              crcToPatches,
            )))).flatMap((rcs) => rcs);

          return [parent, [...releaseCandidates, ...patchedReleaseCandidates]];
        })) as [Parent, ReleaseCandidate[]][],
    );
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

  private static async buildPatchedReleaseCandidate(
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
          const outputFile = await romWithFiles.getOutputFile().withFileName(patchedRomName);

          // Apply the patch
          if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
            inputFile = await inputFile.withPatch(patch);
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
