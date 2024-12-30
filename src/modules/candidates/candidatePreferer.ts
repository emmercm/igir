import ProgressBar, { ProgressBarSymbol } from '../../console/progressBar.js';
import fsPoly from '../../polyfill/fsPoly.js';
import DAT from '../../types/dats/dat.js';
import Parent from '../../types/dats/parent.js';
import Options, { PreferRevision } from '../../types/options.js';
import ReleaseCandidate from '../../types/releaseCandidate.js';
import Module from '../module.js';

/**
 * Apply any specified preference options to the {@link ReleaseCandidate}s for each
 * {@link Parent}.
 */
export default class CandidatePreferer extends Module {
  private readonly options: Options;

  constructor(options: Options, progressBar: ProgressBar) {
    super(progressBar, CandidatePreferer.name);
    this.options = options;
  }

  /**
   * Prefer some candidates.
   */
  prefer(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ReleaseCandidate[]> {
    this.progressBar.logTrace(`${dat.getNameShort()}: preferring candidates`);

    if (parentsToCandidates.size === 0) {
      this.progressBar.logTrace(`${dat.getNameShort()}: no parents, so no candidates to prefer`);
      return parentsToCandidates;
    }

    if (!this.options.getSingle()) {
      this.progressBar.logTrace(
        `${dat.getNameShort()}: not running in single/1G1R mode, not preferring candidates`,
      );
      return parentsToCandidates;
    }

    // Return early if there aren't any candidates
    const totalReleaseCandidates = [...parentsToCandidates.values()].reduce(
      (sum, rcs) => sum + rcs.length,
      0,
    );
    if (!totalReleaseCandidates) {
      this.progressBar.logTrace(
        `${dat.getNameShort()}: no parent has candidates, not preferring candidates`,
      );
      return parentsToCandidates;
    }

    this.progressBar.setSymbol(ProgressBarSymbol.CANDIDATE_FILTERING);
    this.progressBar.reset(parentsToCandidates.size);

    const output = this.sortAndFilter(dat, parentsToCandidates);

    const size = [...output.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    const filteredCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    this.progressBar.logTrace(
      `${dat.getNameShort()}: filtered to ${fsPoly.sizeReadable(size)} of ${filteredCandidates.toLocaleString()} candidate${filteredCandidates !== 1 ? 's' : ''} for ${output.size.toLocaleString()} parent${output.size !== 1 ? 's' : ''}`,
    );

    this.progressBar.logTrace(`${dat.getNameShort()}: done preferring candidates`);
    return output;
  }

  private sortAndFilter(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Map<Parent, ReleaseCandidate[]> {
    const output = new Map<Parent, ReleaseCandidate[]>();

    for (let i = 0; i < [...parentsToCandidates.entries()].length; i += 1) {
      const [parent, releaseCandidates] = [...parentsToCandidates.entries()][i];
      this.progressBar.incrementProgress();
      if (releaseCandidates.length > 1) {
        // Reduce log spam by only logging parents that can be changed
        this.progressBar.logTrace(
          `${dat.getNameShort()}: ${parent.getName()} (parent): ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''} before filtering`,
        );
      }

      const preferredReleaseCandidate = releaseCandidates
        .sort((a, b) => this.sort(a, b))
        .find(() => true);
      if (preferredReleaseCandidate) {
        this.progressBar.logTrace(
          `${dat.getNameShort()}: ${parent.getName()}: preferred ${preferredReleaseCandidate.getName()}`,
        );
        output.set(parent, [preferredReleaseCandidate]);
      } else {
        // The parent didn't have any candidates
        output.set(parent, []);
      }

      this.progressBar.incrementDone();
    }

    return output;
  }

  /**
   *******************
   *
   *     Sorting     *
   *
   *******************
   */

  private sort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    return (
      this.preferGameRegexSort(a, b) ||
      this.preferRomRegexSort(a, b) ||
      this.preferVerifiedSort(a, b) ||
      this.preferGoodSort(a, b) ||
      this.preferLanguagesSort(a, b) ||
      this.preferRegionsSort(a, b) ||
      this.preferRevisionSort(a, b) ||
      this.preferRetailSort(a, b) ||
      this.preferParentSort(a, b)
    );
  }

  private preferGameRegexSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    const gameRegex = this.options.getPreferGameRegex();
    if (gameRegex === undefined || gameRegex.length === 0) {
      return 0;
    }

    const aMatched = gameRegex.some((regex) => regex.test(a.getGame().getName())) ? 0 : 1;
    const bMatched = gameRegex.some((regex) => regex.test(b.getGame().getName())) ? 0 : 1;
    return aMatched - bMatched;
  }

  private preferRomRegexSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    const romRegex = this.options.getPreferRomRegex();
    if (romRegex === undefined || romRegex.length === 0) {
      return 0;
    }

    const aMatched = romRegex.some((regex) =>
      a
        .getGame()
        .getRoms()
        .some((rom) => regex.test(rom.getName())),
    )
      ? 0
      : 1;
    const bMatched = romRegex.some((regex) =>
      b
        .getGame()
        .getRoms()
        .some((rom) => regex.test(rom.getName())),
    )
      ? 0
      : 1;
    return aMatched - bMatched;
  }

  private preferVerifiedSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (!this.options.getPreferVerified()) {
      return 0;
    }
    return (a.getGame().isVerified() ? 0 : 1) - (b.getGame().isVerified() ? 0 : 1);
  }

  private preferGoodSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (!this.options.getPreferGood()) {
      return 0;
    }
    return (b.getGame().isBad() ? 0 : 1) - (a.getGame().isBad() ? 0 : 1);
  }

  private preferLanguagesSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    const preferLanguages = this.options.getPreferLanguages();
    if (preferLanguages.length === 0) {
      return 0;
    }

    const aLangs = new Set(a.getLanguages());
    const bLangs = new Set(b.getLanguages());
    for (const preferredLang of preferLanguages) {
      if (aLangs.has(preferredLang) && !bLangs.has(preferredLang)) {
        return -1;
      }
      if (!aLangs.has(preferredLang) && bLangs.has(preferredLang)) {
        return 1;
      }
    }

    return 0;
  }

  private preferRegionsSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferRegions().length === 0) {
      return 0;
    }
    return this.preferRegionSortValue(a) - this.preferRegionSortValue(b);
  }

  private preferRegionSortValue(releaseCandidate: ReleaseCandidate): number {
    const region = releaseCandidate.getRegion();
    if (!region) {
      return Number.MAX_SAFE_INTEGER;
    }

    const regionIdx = this.options.getPreferRegions().indexOf(region);
    return regionIdx !== -1 ? regionIdx : Number.MAX_SAFE_INTEGER;
  }

  private preferRevisionSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferRevision() === PreferRevision.NEWER) {
      return b.getGame().getRevision() - a.getGame().getRevision();
    }
    if (this.options.getPreferRevision() === PreferRevision.OLDER) {
      return a.getGame().getRevision() - b.getGame().getRevision();
    }
    return 0;
  }

  private preferRetailSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (!this.options.getPreferRetail()) {
      return 0;
    }
    return (a.getGame().isRetail() ? 0 : 1) - (b.getGame().isRetail() ? 0 : 1);
  }

  private preferParentSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (!this.options.getPreferParent()) {
      return 0;
    }
    return (a.getGame().isParent() ? 0 : 1) - (b.getGame().isParent() ? 0 : 1);
  }
}
