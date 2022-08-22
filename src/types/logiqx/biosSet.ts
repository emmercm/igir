import { Expose } from 'class-transformer';

export default class BIOSSet {
  @Expose({ name: 'name' })
  private readonly name!: string;

  @Expose({ name: 'description' })
  private readonly description!: string;

  @Expose({ name: 'default' })
  private readonly default: 'yes' | 'no' = 'no';
}
