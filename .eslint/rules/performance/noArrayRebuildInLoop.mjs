/**
 * Bans array rebuilding patterns inside loops that copy the entire array on every iteration (O(n²) behavior).
 *
 * The patterns:
 *
 *   for (...) {
 *     result = [...result, ...chunk];
 *     result = result.concat(chunk);
 *   }
 *
 * both create a brand-new array on every iteration by copying all existing elements
 * plus the new ones. If the final array has N elements spread across K iterations,
 * the total number of element copies is roughly N²/2 — O(n²). For large datasets
 * this will be orders of magnitude slower than the equivalent push loop, and will
 * also put significant pressure on the garbage collector (each intermediate array
 * is immediately discarded).
 *
 * Prefer accumulating with push() inside the loop instead:
 *
 *   // Bad
 *   for (const chunk of chunks) {
 *     result = [...result, ...chunk];
 *     result = result.concat(chunk);
 *   }
 *
 *   // Good
 *   for (const chunk of chunks) {
 *     for (const item of chunk) {
 *       result.push(item);
 *     }
 *   }
 *
 * Or, if you only need to combine a fixed set of arrays once (outside of a loop),
 * the spread or concat form is fine.
 */

import { isInsideLoop } from '../../isInsideLoop.mjs';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow array rebuilding patterns inside loops that copy the entire array on every iteration (O(n²) performance hazard)',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      AssignmentExpression(node) {
        if (node.operator !== '=') {
          return;
        }
        if (node.left.type !== 'Identifier') {
          return;
        }

        const assignedName = node.left.name;

        // `x = [...x, ...]` — spread accumulation
        if (node.right.type === 'ArrayExpression') {
          const selfSpread = node.right.elements.some(
            (el) =>
              el !== null &&
              el.type === 'SpreadElement' &&
              el.argument.type === 'Identifier' &&
              el.argument.name === assignedName,
          );
          if (selfSpread && isInsideLoop(sourceCode, node)) {
            context.report({
              node,
              message: `'${assignedName} = [...${assignedName}, ...]' inside a loop creates a new array on every iteration (O(n²)); accumulate with push() instead.`,
            });
          }
          return;
        }

        // `x = x.concat(...)` — concat accumulation
        if (
          node.right.type === 'CallExpression' &&
          node.right.callee.type === 'MemberExpression' &&
          node.right.callee.object.type === 'Identifier' &&
          node.right.callee.object.name === assignedName &&
          node.right.callee.property.type === 'Identifier' &&
          node.right.callee.property.name === 'concat' &&
          isInsideLoop(sourceCode, node)
        ) {
          context.report({
            node,
            message: `'${assignedName} = ${assignedName}.concat(...)' inside a loop creates a new array on every iteration (O(n²)); accumulate with push() instead.`,
          });
        }
      },
    };
  },
};
