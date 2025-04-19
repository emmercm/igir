import Game, { GameProps } from './game.js';

export interface SingleValueGameProps
  extends Omit<GameProps, 'regions' | 'languages' | 'categories'> {
  region?: string;
  language?: string;
  category?: string;
}

/**
 * A {@link Game} that
 */
export default class SingleValueGame extends Game implements SingleValueGameProps {
  readonly region?: string;
  readonly language?: string;
  readonly category?: string;

  constructor(props: SingleValueGameProps) {
    super(props);
    this.region = props.region;
    this.language = props.language;
    this.category = props.category;
  }

  getRegion(): string | undefined {
    return this.region;
  }

  getRegions(): string[] {
    return this.region ? [this.region] : [];
  }

  getLanguage(): string | undefined {
    return this.language;
  }

  getLanguages(): string[] {
    return this.language ? [this.language] : [];
  }

  getCategory(): string | undefined {
    return this.category;
  }

  getCategories(): string[] {
    return this.category ? [this.category] : [];
  }

  withProps(props: SingleValueGameProps): SingleValueGame {
    return new SingleValueGame({
      ...this,
      ...props,
    });
  }
}
