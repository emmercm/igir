/**
 * Bans path.resolve() in favor of PathUtil.resolve().
 *
 * `path.resolve()` always builds a new string, even when its input is already resolved. V8 keeps
 * that string as a chain of concatenated pieces, so a 67-character path costs ~448 B until it's
 * flattened, and ~88 B after. Objects that resolve a shared path (e.g. every `ArchiveEntry` of an
 * `Archive`) then each hold their own copy of it.
 *
 * `PathUtil.resolve()` (`src/utils/pathUtil.ts`) takes the same arguments, but returns its last
 * argument when resolving wouldn't change it, so those objects share one string.
 *
 *   // Bad
 *   path.resolve(filePath)
 *   path.resolve(dir, fileName)
 *
 *   // Good
 *   PathUtil.resolve(filePath)
 *   PathUtil.resolve(dir, fileName)
 *
 * Every call is autofixed, and the `PathUtil` import is added if it's missing.
 */

import path from 'node:path';

const PATH_UTIL_FILE_PATH = path.join(import.meta.dirname, '..', '..', '..', 'src', 'utils', 'pathUtil.js');

/**
 * Whether {@link identifier} refers to the default import of 'node:path' or 'path'.
 */
function isPathModule(scope, identifier) {
  let currentScope = scope;
  while (currentScope) {
    const variable = currentScope.set.get(identifier.name);
    if (variable) {
      return variable.defs.some(
        (def) =>
          def.type === 'ImportBinding' &&
          def.node.type === 'ImportDefaultSpecifier' &&
          (def.parent.source.value === 'node:path' || def.parent.source.value === 'path'),
      );
    }
    currentScope = currentScope.upper;
  }
  return false;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow path.resolve() — use PathUtil.resolve() to reuse already-resolved path strings',
    },
    fixable: 'code',
  },
  create(context) {
    const sourceCode = context.sourceCode;
    return {
      'CallExpression[callee.type="MemberExpression"][callee.computed=false][callee.object.type="Identifier"][callee.property.name="resolve"]'(
        node,
      ) {
        if (!isPathModule(sourceCode.getScope(node), node.callee.object)) {
          return;
        }

        context.report({
          node,
          message: 'Use PathUtil.resolve() instead of path.resolve() to reuse already-resolved path strings.',
          *fix(fixer) {
            const imports = sourceCode.ast.body.filter((stmt) => stmt.type === 'ImportDeclaration');
            const existingImport = imports.find(
              (stmt) =>
                stmt.importKind !== 'type' &&
                typeof stmt.source.value === 'string' &&
                stmt.source.value.endsWith('/pathUtil.js'),
            );
            const existingName = existingImport?.specifiers.find(
              (specifier) => specifier.type === 'ImportDefaultSpecifier',
            )?.local.name;
            const pathUtilName = existingName ?? 'PathUtil';

            yield fixer.replaceText(node.callee, `${pathUtilName}.resolve`);

            if (existingName === undefined) {
              let importPath = path
                .relative(path.dirname(context.filename), PATH_UTIL_FILE_PATH)
                .replaceAll('\\', '/');
              if (!importPath.startsWith('.')) {
                importPath = `./${importPath}`;
              }
              const importText = `import ${pathUtilName} from '${importPath}';`;
              const lastImport = imports.at(-1);
              yield lastImport === undefined
                ? fixer.insertTextBefore(sourceCode.ast.body[0], `${importText}\n`)
                : fixer.insertTextAfter(lastImport, `\n${importText}`);
            }
          },
        });
      },
    };
  },
};
