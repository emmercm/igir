/**
 * Bans util.promisify(fs.*) in favour of the native fs.promises namespace.
 *
 * Node.js has shipped fs.promises since v10 LTS. Using util.promisify() to
 * wrap the older callback-style fs methods is redundant, adds an extra
 * function call on every invocation, and makes imports harder to follow
 * because it requires importing both 'node:util' and 'node:fs'. The native
 * fs.promises API is always available, better typed, and is the idiomatic
 * modern style:
 *
 *   // Bad
 *   import { promisify } from 'node:util';
 *   import fs from 'node:fs';
 *   const readFile = promisify(fs.readFile);
 *
 *   // Good
 *   import fs from 'node:fs';
 *   await fs.promises.readFile(...);
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Use native fs.promises instead of util.promisify(fs.*)',
    },
    fixable: 'code',
  },
  create(context) {
    return {
      // Target: util.promisify(fs.someMethod)
      'CallExpression[callee.object.name="util"][callee.property.name="promisify"][arguments.0.object.name="fs"]'(
        node,
      ) {
        const fsMethodIdentifier = node.arguments[0].property;
        const methodName = fsMethodIdentifier.name;
        context.report({
          node,
          message: `Replace util.promisify(fs.${methodName}) with fs.promises.${methodName}.`,
          fix(fixer) {
            // Replaces the entire 'util.promisify(fs.method)' with 'fs.promises.method'
            return fixer.replaceText(node, `fs.promises.${methodName}`);
          },
        });
      },
    };
  },
};
