import Parent from '../types/logiqx/parent.js';
import Options from '../types/options.js';
import ProgressBar from '../types/progressBar.js';
import ReleaseCandidate from '../types/releaseCandidate.js';

export default class CandidateFilter {
  private readonly options: Options;

  private readonly progressBar: ProgressBar;

  constructor(options: Options, progressBar: ProgressBar) {
    this.options = options;
    this.progressBar = progressBar;
  }

  async filter(
    parentsToCandidates: Map<Parent, ReleaseCandidate[]>,
  ): Promise<Map<Parent, ReleaseCandidate[]>> {
    const output = new Map<Parent, ReleaseCandidate[]>();

    this.progressBar.reset(parentsToCandidates.size).setSymbol('⚙️️');

    parentsToCandidates.forEach((releaseCandidates: ReleaseCandidate[], parent: Parent) => {
      this.progressBar.increment();

      const filteredReleaseCandidates = releaseCandidates
        .filter((rc) => this.preFilter(rc))
        .sort((a, b) => this.sort(a, b))
        .filter((rc, idx) => this.postFilter(rc, idx));
      output.set(parent, filteredReleaseCandidates);
    });

    return output;
  }

  private preFilter(
    releaseCandidate: ReleaseCandidate,
  ): boolean {
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

    if (this.options.getOnlyBios() && !releaseCandidate.getGame().isBios()) {
      return false;
    }
    if (this.options.getNoBios() && releaseCandidate.getGame().isBios()) {
      return false;
    }
    if (this.options.getNoUnlicensed() && releaseCandidate.getGame().isUnlicensed()) {
      return false;
    }
    if (this.options.getNoDemo() && releaseCandidate.getGame().isDemo()) {
      return false;
    }
    if (this.options.getNoBeta() && releaseCandidate.getGame().isBeta()) {
      return false;
    }
    if (this.options.getNoSample() && releaseCandidate.getGame().isSample()) {
      return false;
    }
    if (this.options.getNoPrototype() && releaseCandidate.getGame().isPrototype()) {
      return false;
    }
    if (this.options.getNoTest() && releaseCandidate.getGame().isTest()) {
      return false;
    }
    if (this.options.getNoAftermarket() && releaseCandidate.getGame().isAftermarket()) {
      return false;
    }
    if (this.options.getNoHomebrew() && releaseCandidate.getGame().isHomebrew()) {
      return false;
    }
    if (this.options.getNoBad() && releaseCandidate.getGame().isBad()) {
      return false;
    }

    return true;
  }

  private sort(a: ReleaseCandidate, b: ReleaseCandidate): number {
    // Sort by good releases
    if (this.options.getPreferGood()) {
      const goodSort = (b.getGame().isBad() ? 0 : 1) - (a.getGame().isBad() ? 0 : 1);
      if (goodSort !== 0) {
        return goodSort;
      }
    }

    // Sort by language
    if (this.options.getLanguagePriority().length) {
      const aMinLang = a.getLanguages()
        .map((lang) => {
          const priority = this.options.getLanguagePriority().indexOf(lang);
          return priority !== -1 ? priority : Number.MAX_SAFE_INTEGER;
        })
        .reduce((min, idx) => Math.min(min, idx), Number.MAX_SAFE_INTEGER);
      const bMinLang = b.getLanguages()
        .map((lang) => {
          const priority = this.options.getLanguagePriority().indexOf(lang);
          return priority !== -1 ? priority : Number.MAX_SAFE_INTEGER;
        })
        .reduce((min, idx) => Math.min(min, idx), Number.MAX_SAFE_INTEGER);
      const languageSort = aMinLang - bMinLang;
      if (languageSort !== 0) {
        return languageSort;
      }
    }

    // Sort by region
    if (this.options.getRegionPriority().length) {
      const aRegionIdx = a.getRegion()
        ? this.options.getRegionPriority().indexOf(a.getRegion() as string)
        : -1;
      const bRegionIdx = b.getRegion()
        ? this.options.getRegionPriority().indexOf(b.getRegion() as string)
        : -1;
      const regionSort = (aRegionIdx !== -1 ? aRegionIdx : Number.MAX_SAFE_INTEGER)
          - (bRegionIdx !== -1 ? bRegionIdx : Number.MAX_SAFE_INTEGER);
      if (regionSort !== 0) {
        return regionSort;
      }
    }

    // Sort by revision (higher first)
    let revisionSort = 0;
    if (this.options.getPreferRevisionsNewer()) {
      revisionSort = b.getRevision() - a.getRevision();
    } else if (this.options.getPreferRevisionsOlder()) {
      revisionSort = a.getRevision() - b.getRevision();
    }
    if (revisionSort !== 0) {
      return revisionSort;
    }

    // Prefer releases
    if (this.options.getPreferReleases()) {
      const releaseSort = (a.isRelease() ? 0 : 1) - (b.isRelease() ? 0 : 1);
      if (releaseSort !== 0) {
        return releaseSort;
      }
    }

    // Prefer parents
    if (this.options.getPreferParents()) {
      const parentSort = (a.getGame().isParent() ? 0 : 1) - (b.getGame().isParent() ? 0 : 1);
      if (parentSort !== 0) {
        return parentSort;
      }
    }

    return 0;
  }

  private postFilter(
    releaseCandidate: ReleaseCandidate,
    idx: number,
  ): boolean {
    if (this.options.get1G1R()) {
      return idx === 0;
    }
    return true;
  }
}
