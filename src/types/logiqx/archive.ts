import { Expose } from 'class-transformer';

/**
 * An archive?
 */
export default class Archive {
  @Expose({ name: 'name' })
  private readonly name!: string;
}
