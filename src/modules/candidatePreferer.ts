import ProgressBar, { ProgressBarSymbol } from '../console/progressBar.js';
import fsPoly from '../polyfill/fsPoly.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
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

  async prefer(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    this.progressBar.logInfo(`${dat.getNameShort()}: filtering candidates`);

    if (!parentsToCandidates.size) {
      this.progressBar.logDebug(`${dat.getNameShort()}: no parents, so no candidates to filter`);
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
      .flatMap((releaseCandidates) => releaseCandidates)
      .flatMap((releaseCandidate) => releaseCandidate.getRomsWithFiles())
      .reduce((sum, romWithFiles) => sum + romWithFiles.getRom().getSize(), 0);
    const filteredCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    this.progressBar.logDebug(`${dat.getNameShort()}: filtered to ${fsPoly.sizeReadable(size)} of ${filteredCandidates.toLocaleString()} candidate${filteredCandidates !== 1 ? 's' : ''} for ${output.size.toLocaleString()} parent${output.size !== 1 ? 's' : ''}`);

    this.progressBar.logInfo(`${dat.getNameShort()}: done filtering candidates`);
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
      this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: ${releaseCandidates.length.toLocaleString()} candidate${releaseCandidates.length !== 1 ? 's' : ''} before filtering`);

      const filteredReleaseCandidates = releaseCandidates
        .sort((a, b) => this.sort(a, b))
        .filter((rc, idx) => this.filter(idx));
      this.progressBar.logTrace(`${dat.getNameShort()}: ${parent.getName()}: ${filteredReleaseCandidates.length.toLocaleString()} candidate${filteredReleaseCandidates.length !== 1 ? 's' : ''} after filtering`);
      output.set(parent, filteredReleaseCandidates);

      await this.progressBar.incrementDone();
    }

    return output;
  }

  /** ****************
   *                 *
   *     Sorting     *
   *                 *
   ***************** */

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
    if (this.options.getPreferLanguages().length) {
      return this.preferLanguageSortValue(a) - this.preferLanguageSortValue(b);
    }
    return 0;
  }

  private preferLanguageSortValue(releaseCandidate: ReleaseCandidate): number {
    return releaseCandidate.getLanguages()
      .map((lang) => {
        const priority = this.options.getPreferLanguages().indexOf(lang);
        return priority !== -1 ? priority : Number.MAX_SAFE_INTEGER;
      })
      .reduce((min, idx) => Math.min(min, idx), Number.MAX_SAFE_INTEGER);
  }

  private preferRegionsSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferRegions().length) {
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

  /** ***************
   *                *
   *     Filter     *
   *                *
   **************** */

  private filter(idx: number): boolean {
    if (this.options.getSingle()) {
      return idx === 0;
    }
    return true;
  }
}
