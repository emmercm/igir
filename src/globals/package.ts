import packageJson from '../../package.json' with { type: 'json' };

/**
 * A static class of globals that are parsed from `package.json` at startup, to be used widely.
 */
export default class Package {
  static readonly NAME = packageJson.name;

  static readonly HOMEPAGE = packageJson.homepage;

  static readonly VERSION = packageJson.version;

  static readonly ENGINES_NODE = packageJson.engines?.node ?? '*';
}
