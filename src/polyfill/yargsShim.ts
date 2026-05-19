import module from 'node:module';
import path from 'node:path';
import util from 'node:util';

import type { Argv } from 'yargs';

/**
 * Igir ships as a single self-contained binary (Bun-compiled). Nothing in the
 * application — neither igir nor its dependencies — may rely on files being
 * present on disk relative to the executable. Every asset that the runtime
 * needs must be a static `import` so the bundler embeds it into the binary.
 *
 * yargs' default ESM platform shim violates this: it resolves its locale
 * directory at runtime via `path.resolve(__dirname, '../../../locales')` and
 * reads the matching JSON with `fs.readFileSync`. In a Bun-compiled Windows
 * binary, that path lands on a virtual mount on the `B:` drive; if the user
 * has a real `B:` drive (e.g., a DVD drive), the read returns `EUNKNOWN`
 * instead of `ENOENT`, and y18n rethrows — crashing every igir invocation.
 */

type YargsConstructor = (processArgs?: readonly string[] | string, cwd?: string) => Argv;
type YargsFactoryFn = (shim: object) => YargsConstructor;
type LocaleEntry = string | { one: string; other: string };

// yargs doesn't expose the files that we need, we have to import by file path
const require = module.createRequire(import.meta.url);
const yargsRoot = path.dirname(require.resolve('yargs/package.json'));
/* eslint-disable @typescript-eslint/no-unsafe-assignment -- yargs ships no types for these internals */
const { YargsFactory: YargsFactoryRaw } = require(`${yargsRoot}/build/lib/yargs-factory.js`);
const { default: esmShimRaw } = require(`${yargsRoot}/lib/platform-shims/esm.mjs`);
const enLocaleRaw: Record<string, LocaleEntry> = require(`${yargsRoot}/locales/en.json`);

const YargsFactory: YargsFactoryFn = YargsFactoryRaw;
const esmShim: object = esmShimRaw;
const enLocale = enLocaleRaw;

/**
 * Apply `util.format` to `template` and `args`, dropping any function-valued
 * arguments. y18n's public API treats a trailing callback as a write-completion
 * notifier rather than a substitution value; this stub never performs writes,
 * so those callbacks are silently discarded.
 */
const format = (template: string, ...args: unknown[]): string =>
  util.format(template, ...args.filter((arg) => typeof arg !== 'function'));

/**
 * Build a y18n-compatible translation object seeded with yargs' English locale.
 * The returned object exposes `__`, `__n`, `setLocale`, `getLocale`, and
 * `updateLocale`, performs `util.format`-style substitution, and resolves
 * unknown keys to the key itself. No filesystem access is ever performed.
 */
const makeY18n = (): object => {
  const translations: Record<string, LocaleEntry> = { ...enLocale };
  return {
    __: (...args: unknown[]): string => {
      const [key, ...rest] = args;
      if (typeof key !== 'string') {
        return util.inspect(key);
      }
      const entry = translations[key];
      return format(typeof entry === 'string' ? entry : key, ...rest);
    },
    __n: (singular: string, plural: string, count: number, ...args: unknown[]): string => {
      const entry = translations[singular];
      const template =
        typeof entry === 'object'
          ? entry[count === 1 ? 'one' : 'other']
          : count === 1
            ? singular
            : plural;
      return format(template, ...(template.includes('%d') ? [count, ...args] : args));
    },
    setLocale: (): void => undefined,
    getLocale: (): string => 'en',
    updateLocale: (obj: Record<string, LocaleEntry>): void => {
      Object.assign(translations, obj);
    },
  };
};

/**
 * Drop-in replacement for the default `yargs` export. Accepts the same
 * `processArgs` and `cwd` arguments and returns a fresh {@link Argv} instance.
 *
 * - Locale strings resolve without any filesystem access.
 * - Only English is available; `.locale()` calls are silently ignored.
 * - Each call produces an independent instance, so `.updateStrings()` on one
 *   {@link Argv} does not affect any other.
 */
const yargs = (processArgs?: readonly string[] | string, cwd?: string): Argv =>
  YargsFactory({ ...esmShim, y18n: makeY18n() })(processArgs, cwd);
export default yargs;
