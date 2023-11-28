import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/dats/dat.js';
import Parent from '../types/dats/parent.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';
import Module from './module.js';

/**
 * Apply any specified preference options to the {@link ReleaseCandidate}s for each
 * {@link Parent}.
 *
 * This class may be run concurrently with other classes.
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
  async prefer(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    this.progressBar.logInfo(`${dat.getNameShort()}: preferring candidates`);

    if (parentsToCandidates.size === 0) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no parents, so no candidates to prefer`);
      return parentsToCandidates;
    }

    if (!this.options.getSingle()) {
      this.progressBar.logDebug(`${dat.getNameShort()}: not running in single/1G1R mode, not preferring candidates`);
      return parentsToCandidates;
    }

    // Return early if there aren't any candidates
    const totalReleaseCandidates = [...parentsToCandidates.values()]
      .reduce((sum, rcs) => sum + rcs.length, 0);
    if (!totalReleaseCandidates) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no parent has candidates`);
      return parentsToCandidates;
    }

    await this.progressBar.setSymbol(ProgressBarSymbol.FILTERING);
    await this.progressBar.reset(parentsToCandidates.size);

    const output = await this.sortAndFilter(dat, parentsToCandidates);

    const size = [...output.values()]
      .flat()
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    const filteredCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    this.progressBar.logDebug(`${dat.getNameShort()}: filtered to ${fsPoly.sizeReadable(size)} of ${filteredCandidates.toLocaleString()} candidate${filteredCandidates !== 1 ? 's' : ''} for ${output.size.toLocaleString()} parent${output.size !== 1 ? 's' : ''}`);

    this.progressBar.logInfo(`${dat.getNameShort()}: done preferring candidates`);
    return output;
  }

  private async sortAndFilter(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    const output = new Map<Parent, ReleaseCandidate[]>();

    for (let i = 0; i < [...parentsToCandidates.entries()].length; i += 1) {
      const [parent, releaseCandidates] = [...parentsToCandidates.entries()][i];
      await this.progressBar.incrementProgress();
      if (releaseCandidates.length > 1) {
        // Reduce log spam by only logging parents that can be changed
        this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''} before filtering`);
      }

      const preferredReleaseCandidate = releaseCandidates
        .sort((a, b) => this.sort(a, b))
        .find(() => true);
      if (preferredReleaseCandidate) {
        this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: preferred ${preferredReleaseCandidate.getName()}`);
        output.set(parent, [preferredReleaseCandidate]);
      } else {
        // The parent didn't have any candidates
        output.set(parent, []);
      }

      await this.progressBar.incrementDone();
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
    return this.preferVerifiedSort(a, b)
        || this.preferGoodSort(a, b)
        || this.preferLanguagesSort(a, b)
        || this.preferRegionsSort(a, b)
        || this.preferRevisionSort(a, b)
        || this.preferRetailSort(a, b)
        || this.preferNTSCSort(a, b)
        || this.preferPALSort(a, b)
        || this.preferParentSort(a, b);
  }

  private preferVerifiedSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferVerified()) {
      return (a.getGame().isVerified() ? 0 : 1) - (b.getGame().isVerified() ? 0 : 1);
    }
    return 0;
  }

  private preferGoodSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferGood()) {
      return (b.getGame().isBad() ? 0 : 1) - (a.getGame().isBad() ? 0 : 1);
    }
    return 0;
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
    if (this.options.getPreferRegions().length > 0) {
      return this.preferRegionSortValue(a) - this.preferRegionSortValue(b);
    }
    return 0;
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
    if (this.options.getPreferRevisionNewer()) {
      return b.getGame().getRevision() - a.getGame().getRevision();
    } if (this.options.getPreferRevisionOlder()) {
      return a.getGame().getRevision() - b.getGame().getRevision();
    }
    return 0;
  }

  private preferRetailSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferRetail()) {
      return (a.getGame().isRetail() ? 0 : 1) - (b.getGame().isRetail() ? 0 : 1);
    }
    return 0;
  }

  private preferNTSCSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferNTSC()) {
      return (a.getGame().isNTSC() ? 0 : 1) - (b.getGame().isNTSC() ? 0 : 1);
    }
    return 0;
  }

  private preferPALSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferPAL()) {
      return (a.getGame().isPAL() ? 0 : 1) - (b.getGame().isPAL() ? 0 : 1);
    }
    return 0;
  }

  private preferParentSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferParent()) {
      return (a.getGame().isParent() ? 0 : 1) - (b.getGame().isParent() ? 0 : 1);
    }
    return 0;
  }
}
