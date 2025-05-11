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
    return this.region ?? super.getRegions().at(0);
  }

  getRegions(): string[] {
    return this.region ? [this.region] : super.getRegions();
  }

  getLanguage(): string | undefined {
    return this.language ?? super.getLanguages().at(0);
  }

  getLanguages(): string[] {
    return this.language ? [this.language] : super.getLanguages();
  }

  getCategory(): string | undefined {
    return this.category ?? super.getCategories().at(0);
  }

  getCategories(): string[] {
    return this.category ? [this.category] : super.getCategories();
  }

  withProps(props: SingleValueGameProps): SingleValueGame {
    return new SingleValueGame({
      ...this,
      ...props,
    });
  }
}
