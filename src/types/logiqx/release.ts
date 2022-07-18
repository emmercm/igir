import { Expose } from 'class-transformer';

export default class Release {
  @Expose({ name: 'name' })
  private readonly name!: string;

  @Expose({ name: 'region' })
  private readonly region!: string;

  @Expose({ name: 'language' })
  private readonly language?: string;

  @Expose({ name: 'date' })
  private readonly date?: string;

  @Expose({ name: 'default' })
  private readonly default: 'yes' | 'no' = 'no';

  getName(): string {
    return this.name;
  }

  getRegion(): string {
    return this.region.toUpperCase();
  }

  getLanguage(): string | null {
    if (this.language) {
      return this.language.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.substring(1).toLowerCase());
    }
    return null;
  }
}
