/**
 * Bans subpath imports from node: built-in modules (e.g. 'node:fs/promises').
 *
 * Subpath imports create an extra module reference for what is really just a
 * property access on the base module's default export. They also fragment
 * imports: code ends up with both `import fs from 'node:fs'` and
 * `import { readFile } from 'node:fs/promises'`, which refer to the same
 * underlying module in two different ways. Using the base default import
 * and accessing sub-namespaces through it is cleaner and consistent:
 *
 *   // Bad
 *   import { readFile } from 'node:fs/promises';
 *
 *   // Good
 *   import fs from 'node:fs';
 *   await fs.promises.readFile(...);
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Avoid subpath imports from node: modules',
    },
    fixable: 'code',
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string' || !source.startsWith('node:')) {
          return;
        }
        const withoutPrefix = source.slice('node:'.length);
        if (!withoutPrefix.includes('/')) {
          return;
        }
        const parts = withoutPrefix.split('/');
        const baseModule = `node:${parts[0]}`;
        const subAccessChain = parts.slice(1).join('.');
        const isTypeOnly = node.importKind === 'type';

        // Find existing default imports of the base module
        let existingValueDefaultName;
        let existingTypeDefaultName;
        for (const stmt of sourceCode.ast.body) {
          if (
            stmt.type !== 'ImportDeclaration' ||
            stmt.source.value !== baseModule ||
            stmt === node
          ) {
            continue;
          }
          const defSpec = stmt.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
          if (!defSpec) {
            continue;
          }
          if (stmt.importKind === 'type') {
            existingTypeDefaultName = defSpec.local.name;
          } else {
            existingValueDefaultName = defSpec.local.name;
          }
        }

        // For type-only imports, a type default is sufficient
        const existingDefaultName = isTypeOnly
          ? (existingValueDefaultName ?? existingTypeDefaultName)
          : existingValueDefaultName;
        const defaultName = existingDefaultName ?? parts[0];
        const needsNewDefault = existingDefaultName === undefined;

        // Capture scope while in the visitor (required for ESLint v9)
        const moduleScope = sourceCode.getScope(node);

        context.report({
          node,
          message: `Avoid subpath import '${source}'. Import '${baseModule}' and use its properties instead.`,
          *fix(fixer) {
            // Replace all specifier references
            for (const specifier of node.specifiers) {
              const localName = specifier.local.name;
              const variable = moduleScope.variables.find((v) => v.name === localName);
              if (!variable) {
                return;
              }
              let replacement;
              if (specifier.type === 'ImportDefaultSpecifier') {
                // `import sub from 'node:M/sub'` → refs become `M.sub`
                replacement = `${defaultName}.${subAccessChain}`;
              } else if (specifier.type === 'ImportSpecifier') {
                const importedName =
                  specifier.imported.type === 'Identifier'
                    ? specifier.imported.name
                    : specifier.imported.value;
                // `import { X } from 'node:M/sub'` → refs become `M.sub.X`
                replacement = `${defaultName}.${subAccessChain}.${importedName}`;
              } else {
                // `import * as ns from 'node:M/sub'` → refs become `M.sub`
                replacement = `${defaultName}.${subAccessChain}`;
              }
              for (const ref of variable.references) {
                yield fixer.replaceText(ref.identifier, replacement);
              }
            }

            // Replace or remove the import declaration
            if (needsNewDefault) {
              const keyword = isTypeOnly ? 'import type' : 'import';
              yield fixer.replaceText(node, `${keyword} ${defaultName} from '${baseModule}';`);
            } else {
              yield fixer.remove(node);
            }
          },
        });
      },
    };
  },
};
