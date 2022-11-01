import Parent from '../types/logiqx/parent.js';
import Patch from '../types/patches/patch.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import ROMWithFiles from '../types/romWithFiles.js';

export default class PatchedCandidateGenerator {
  static async generate(
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
    patches: Patch[],
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    const crcToPatches = PatchedCandidateGenerator.indexPatchesByCrcBefore(patches);

    return new Map(
      await Promise.all([...parentsToCandidates.entries()]
        .map(async ([parent, releaseCandidates]) => {
          const patchedReleaseCandidates = (await Promise.all(releaseCandidates
            .map(async (releaseCandidate) => PatchedCandidateGenerator.buildPatchedReleaseCandidate(
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
          const inputFile = romWithFiles.getInputFile();
          let outputFile = await romWithFiles.getOutputFile().withFileName(patchedRomName);

          // Apply the patch
          if (patch.getCrcBefore() === romWithFiles.getRom().getCrc32()) {
            outputFile = await outputFile.withPatch(patch);
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
