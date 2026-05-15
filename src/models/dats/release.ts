import { Expose } from 'class-transformer';

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
    return this.language;
  }
}
