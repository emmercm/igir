export default class Release {
  private name!: string;

  private region!: string;

  private language?: string;

  private date?: string;

  private default: 'yes' | 'no' = 'no';

  getRegion(): string {
    // TODO(cemmer): when the region isn't set but it can be parsed from release name
    return this.region;
  }
}
