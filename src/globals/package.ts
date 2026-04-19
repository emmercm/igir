// @ts-expect-error This will get erased, it's fine
import type packageJsonType from '../../package.json' with { type: 'json' };

let packageJson: typeof packageJsonType;
try {
  // @ts-expect-error This will exist after bundling, because dist/ adds an extra layer
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment,@typescript-eslint/no-unsafe-member-access
  packageJson = (await import('../../../package.json', { with: { type: 'json' } })).default;
} catch {
  packageJson = (await import('../../package.json', { with: { type: 'json' } })).default;
}

/**
 * A static class of globals that are parsed from `package.json` at startup, to be used widely.
 */
export default class Package {
  static readonly JSON = packageJson;

  static readonly NAME = packageJson.name;

  static readonly HOMEPAGE = packageJson.homepage;

  static readonly VERSION = packageJson.version;

  static readonly AUTHOR = packageJson.author;

  static readonly ENGINES_NODE = packageJson.engines.node;
}
