/**
 * Bans named value imports from node: built-in modules in favour of the default import.
 *
 * Node.js built-in modules expose a default export (the module namespace object)
 * and also allow named imports for individual exports. Using named imports for
 * values creates a dependency on the specific binding name and splits the module
 * surface across multiple import styles. The default import is preferable because
 * it is explicit about the origin of every property, is consistent with how
 * non-Node modules are imported, and avoids accidental shadowing:
 *
 *   // Bad
 *   import { PassThrough } from 'node:stream';
 *   import { EventEmitter } from 'node:events';
 *
 *   // Good
 *   import stream from 'node:stream';
 *   import events from 'node:events';
 *   new stream.PassThrough();
 *   new events.EventEmitter();
 *
 * Type-only named imports are allowed because TypeScript erases them at runtime.
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Prefer default import from node: modules over named value imports',
    },
    fixable: 'code',
  },
  create(context) {
    const sourceCode = context.getSourceCode();
    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') {
          return;
        }
        const source = node.source.value;
        if (typeof source !== 'string' || !source.startsWith('node:')) {
          return;
        }

        // Subpath imports (node:fs/promises) are handled by no-node-subpath-imports
        const withoutNodePrefix = source.slice('node:'.length);
        if (withoutNodePrefix.includes('/')) {
          return;
        }

        const moduleName = withoutNodePrefix;

        const namedValueSpecifiers = node.specifiers.filter(
          (s) => s.type === 'ImportSpecifier' && s.importKind !== 'type',
        );

        if (namedValueSpecifiers.length === 0) {
          return;
        }

        // Scan for other ImportDeclarations with same source
        let hasTypeOnlyDefault = false;
        let existingValueDefaultName;
        for (const stmt of sourceCode.ast.body) {
          if (stmt.type !== 'ImportDeclaration' || stmt.source.value !== source || stmt === node) {
            continue;
          }
          if (stmt.importKind === 'type') {
            hasTypeOnlyDefault = true;
          } else {
            const defSpec = stmt.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
            if (defSpec) {
              existingValueDefaultName = defSpec.local.name;
            }
          }
        }

        const defaultName = existingValueDefaultName ?? moduleName;

        // Capture scope while in the visitor (required for ESLint v9)
        const moduleScope = sourceCode.getScope(node);

        for (const specifier of namedValueSpecifiers) {
          const localName = specifier.local.name;
          const importedName =
            specifier.imported.type === 'Identifier'
              ? specifier.imported.name
              : specifier.imported.value;

          context.report({
            node: specifier,
            message: `Use '${defaultName}.${importedName}' instead of named import '{ ${localName} }' from '${source}'.`,
            *fix(fixer) {
              if (hasTypeOnlyDefault && !existingValueDefaultName) {
                return;
              }

              const variable = moduleScope.variables.find((v) => v.name === localName);
              if (!variable) {
                return;
              }

              // Replace all references to localName with defaultName.importedName
              for (const ref of variable.references) {
                yield fixer.replaceText(ref.identifier, `${defaultName}.${importedName}`);
              }

              // Restructure the ImportDeclaration
              const defaultSpec = node.specifiers.find((s) => s.type === 'ImportDefaultSpecifier');
              const remainingNamedSpecs = node.specifiers.filter(
                (s) => s.type === 'ImportSpecifier' && s !== specifier,
              );
              const hasOtherSpecifiers =
                remainingNamedSpecs.length > 0 ||
                node.specifiers.some((s) => s.type === 'ImportNamespaceSpecifier');

              if (hasOtherSpecifiers) {
                const defPart =
                  defaultSpec?.local.name ?? (existingValueDefaultName ? undefined : defaultName);
                const namedPart =
                  remainingNamedSpecs.length > 0
                    ? `{ ${remainingNamedSpecs.map((s) => sourceCode.getText(s)).join(', ')} }`
                    : undefined;
                const parts = [defPart, namedPart].filter(Boolean);
                yield fixer.replaceText(
                  node,
                  `import ${parts.join(', ')} from ${sourceCode.getText(node.source)};`,
                );
              } else if (defaultSpec) {
                yield fixer.replaceText(
                  node,
                  `import ${defaultSpec.local.name} from ${sourceCode.getText(node.source)};`,
                );
              } else if (existingValueDefaultName) {
                yield fixer.remove(node);
              } else {
                yield fixer.replaceText(
                  node,
                  `import ${defaultName} from ${sourceCode.getText(node.source)};`,
                );
              }
            },
          });
        }
      },
    };
  },
};
