import { Expose } from 'class-transformer';

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

  getName(): string {
    return this.name;
  }

  getRegion(): string {
    return this.region.toUpperCase();
  }

  getLanguage(): string | undefined {
    if (this.language) {
      return this.language.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase());
    }
    return undefined;
  }
}
