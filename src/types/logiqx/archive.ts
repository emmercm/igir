import { Expose } from 'class-transformer';

export default class Archive {
  @Expose({ name: 'name' })
  private readonly name!: string;
}
