export default class Release {
  private readonly name!: string;

  private readonly region!: string;

  private readonly language?: string;

  private readonly date?: string;

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
