import ProgressBar from '../console/progressBar.js';
import DAT from '../types/logiqx/dat.js';
import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

export default class CandidateFilter {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async filter(
    dat: DAT,
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    await this.progressBar.logInfo(`${dat.getName()}: Filtering candidates`);
    const output = new Map<Parent, ReleaseCandidate[]>();

    if (!parentsToCandidates.size) {
      return output;
    }

    await this.progressBar.setSymbol('⚙️️');
    await this.progressBar.reset(parentsToCandidates.size);

    parentsToCandidates.forEach((releaseCandidates: ReleaseCandidate[], parent: Parent) => {
      this.progressBar.increment();

      const filteredReleaseCandidates = releaseCandidates
        .filter((rc) => this.preFilter(rc))
        .sort((a, b) => this.sort(a, b))
        .filter((rc, idx) => this.postFilter(idx));
      output.set(parent, filteredReleaseCandidates);
    });

    const filteredCandidates = [...output.values()].reduce((sum, rc) => sum + rc.length, 0);
    await this.progressBar.logInfo(`${dat.getName()} | ${filteredCandidates} candidate${filteredCandidates !== 1 ? 's' : ''} after filtering`);

    return output;
  }

  private preFilter(releaseCandidate: ReleaseCandidate): boolean {
    if (this.options.getLanguageFilter().length) {
      const langs = this.options.getLanguageFilter();
      if (!releaseCandidate.getLanguages().some((lang) => langs.indexOf(lang) !== -1)) {
        return false;
      }
    }
    if (this.options.getRegionFilter().length
        && releaseCandidate.getRegion()
        && this.options.getRegionFilter().indexOf(releaseCandidate.getRegion() as string) === -1) {
      return false;
    }

    if ((this.options.getOnlyBios() && !releaseCandidate.getGame().isBios())
        || (this.options.getNoBios() && releaseCandidate.getGame().isBios())
        || (this.options.getNoUnlicensed() && releaseCandidate.getGame().isUnlicensed())
        || (this.options.getOnlyRetail() && !releaseCandidate.getGame().isRetail())
        || (this.options.getNoDemo() && releaseCandidate.getGame().isDemo())
        || (this.options.getNoBeta() && releaseCandidate.getGame().isBeta())
        || (this.options.getNoSample() && releaseCandidate.getGame().isSample())
        || (this.options.getNoPrototype() && releaseCandidate.getGame().isPrototype())
        || (this.options.getNoTestRoms() && releaseCandidate.getGame().isTest())
        || (this.options.getNoAftermarket() && releaseCandidate.getGame().isAftermarket())
        || (this.options.getNoHomebrew() && releaseCandidate.getGame().isHomebrew())
        || (this.options.getNoBad() && releaseCandidate.getGame().isBad())) {
      return false;
    }

    return true;
  }

  private sort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    return this.preferGoodSort(a, b)
        || this.preferLanguagesSort(a, b)
        || this.preferRegionsSort(a, b)
        || this.preferRevisionSort(a, b)
        || this.preferRetailSort(a, b)
        || this.preferParentSort(a, b);
  }

  private preferGoodSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferGood()) {
      return (b.getGame().isBad() ? 0 : 1) - (a.getGame().isBad() ? 0 : 1);
    }
    return 0;
  }

  private preferLanguagesSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferLanguages().length) {
      const aMinLang = this.preferLanguageSortValue(a);
      const bMinLang = this.preferLanguageSortValue(b);
      return aMinLang - bMinLang;
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
      const aRegionIdx = a.getRegion()
        ? this.options.getPreferRegions().indexOf(a.getRegion() as string)
        : -1;
      const bRegionIdx = b.getRegion()
        ? this.options.getPreferRegions().indexOf(b.getRegion() as string)
        : -1;
      const regionSort = (aRegionIdx !== -1 ? aRegionIdx : Number.MAX_SAFE_INTEGER)
          - (bRegionIdx !== -1 ? bRegionIdx : Number.MAX_SAFE_INTEGER);
      if (regionSort !== 0) {
        return regionSort;
      }
    }
    return 0;
  }

  private preferRevisionSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferRevisionNewer()) {
      return b.getRevision() - a.getRevision();
    } if (this.options.getPreferRevisionOlder()) {
      return a.getRevision() - b.getRevision();
    }
    return 0;
  }

  private preferRetailSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferRetail()) {
      return (a.getGame().isRetail() ? 0 : 1) - (b.getGame().isRetail() ? 0 : 1);
    }
    return 0;
  }

  private preferParentSort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    if (this.options.getPreferParent()) {
      return (a.getGame().isParent() ? 0 : 1) - (b.getGame().isParent() ? 0 : 1);
    }
    return 0;
  }

  private postFilter(idx: number): boolean {
    if (this.options.getSingle()) {
      return idx === 0;
    }
    return true;
  }
}
