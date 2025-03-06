import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

/**
 * Search for a {@link fileName} in {@link filePath} or any of its parent directories.
 */
function scanUpPathForFile(filePath: string, fileName: string): string | undefined {
  const fullPath = path.join(filePath, fileName);
  if (fs.existsSync(fullPath)) {
    return fullPath;
  }

  const parentPath = path.dirname(filePath);
  if (parentPath !== filePath) {
    return scanUpPathForFile(path.dirname(filePath), fileName);
  }

  return undefined;
}

const PACKAGE_JSON_PATH = path.resolve(
  scanUpPathForFile(url.fileURLToPath(new URL('.', import.meta.url)), 'package.json') as string,
);
const PACKAGE_JSON = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH).toString()) as {
  name: string;
  homepage: string;
  version: string;
  engines: {
    node: string;
  };
};

/**
 * A static class of globals that are parsed from `package.json` at startup, to be used widely.
 */
export default class Package {
  static readonly DIRECTORY = path.dirname(PACKAGE_JSON_PATH);

  static readonly NAME = PACKAGE_JSON.name;

  static readonly HOMEPAGE = PACKAGE_JSON.homepage;

  static readonly VERSION = PACKAGE_JSON.version;

  static readonly ENGINES_NODE = PACKAGE_JSON.engines?.node ?? '*';
}
