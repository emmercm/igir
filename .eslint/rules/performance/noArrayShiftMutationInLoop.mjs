/**
 * Bans Array#unshift() and Array#splice() inside loops (O(n²) behavior).
 *
 * Both methods mutate the array by shifting existing elements to fill or create
 * gaps. Each call is O(k) where k is the current length of the array. Inside a
 * loop that processes N elements total, the total work is
 * 0 + 1 + 2 + … + (N-1) = N(N-1)/2 — O(n²).
 *
 * Array#unshift(x)      — prepends x, shifting every element one index right
 * Array#splice(i, ...)  — inserts/removes at index i, shifting every element
 *                         after i (removing from or inserting at index 0 shifts
 *                         the entire array)
 *
 * For unshift, prefer push() inside the loop and reverse() once after:
 *
 *   // Bad
 *   for (const item of items) {
 *     result.unshift(item);
 *   }
 *
 *   // Good
 *   for (const item of items) {
 *     result.push(item);
 *   }
 *   result.reverse();
 *
 * For splice, restructure to avoid mid-array insertion in the loop entirely, or
 * collect indices/items and apply a single splice after the loop.
 */

import { isInsideLoop } from '../../isInsideLoop.mjs';

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Array#unshift() and Array#splice() inside loops (O(n²) shift-mutation hazard)',
    },
  },
  create(context) {
    const sourceCode = context.getSourceCode();

    return {
      'CallExpression[callee.property.name="unshift"]'(node) {
        if (!isInsideLoop(sourceCode, node)) {
          return;
        }
        context.report({
          node,
          message:
            'Array#unshift() inside a loop shifts all existing elements on every call (O(n²)); accumulate with push() and reverse() once after the loop.',
        });
      },

      'CallExpression[callee.property.name="splice"]'(node) {
        if (!isInsideLoop(sourceCode, node)) {
          return;
        }
        context.report({
          node,
          message:
            'Array#splice() inside a loop shifts elements on every call (O(n²)); restructure to avoid mid-array insertion/removal inside the loop.',
        });
      },
    };
  },
};
