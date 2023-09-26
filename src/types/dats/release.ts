import { Expose } from 'class-transformer';

import Internationalization from '../internationalization.js';

/**
 * A region release of a {@link Game}.
 */
export default class Release {
  @Expose({ name: 'name' })
  private readonly name: string;

  @Expose({ name: 'region' })
  private readonly region: string;

  @Expose({ name: 'language' })
  private readonly language?: string;

  constructor(name: string, region: string, language?: string) {
    this.name = name;
    this.region = region;
    this.language = language;
  }

  /**
   * Create an XML object, to be used by the owning {@link Game}.
   */
  toXmlDatObj(): object {
    return {
      $: {
        name: this.name,
        region: this.region,
        language: this.language,
      },
    };
  }

  // Property getters

  getName(): string {
    return this.name;
  }

  getRegion(): string {
    return this.region.toUpperCase();
  }

  getLanguage(): string | undefined {
    return this.getLanguageUnformatted()?.toUpperCase();
  }

  private getLanguageUnformatted(): string | undefined {
    if (this.language) {
      return this.language;
    }

    for (let i = 0; i < Internationalization.REGION_OPTIONS.length; i += 1) {
      const regionOption = Internationalization.REGION_OPTIONS[i];
      if (regionOption.region === this.getRegion()) {
        return regionOption.language;
      }
    }

    return undefined;
  }
}
