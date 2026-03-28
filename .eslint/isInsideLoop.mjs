/**
 * Shared helper: returns true when `node` is nested inside any loop construct,
 * including both loop statements and callbacks passed to array iteration methods.
 *
 * Loop statements recognised:
 *   for, for...in, for...of, while, do...while
 *
 * Iteration-method callbacks recognised (treated as implicit loops):
 *   forEach, map, filter, flatMap, reduce, reduceRight,
 *   some, every, find, findIndex, findLast, findLastIndex
 *
 * Traversal stops at a function boundary UNLESS that function is itself a
 * callback to one of the iteration methods above, in which case it is treated
 * as a loop context and traversal continues upward.
 * @param {import('eslint').SourceCode} sourceCode
 * @param {import('eslint').Rule.Node} node
 * @returns {boolean}
 * @example isInsideLoop(sourceCode, node)
 */

const loopStatementTypes = new Set([
  'ForStatement',
  'ForInStatement',
  'ForOfStatement',
  'WhileStatement',
  'DoWhileStatement',
]);

const functionBoundaryTypes = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
]);

const iterationMethods = new Set([
  'forEach',
  'map',
  'filter',
  'flatMap',
  'reduce',
  'reduceRight',
  'some',
  'every',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
]);

/**
 * Returns true if `node` is inside a loop construct (statement or iteration-method callback).
 */
export function isInsideLoop(sourceCode, node) {
  const ancestors = sourceCode.getAncestors(node);
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const ancestor = ancestors[i];

    if (loopStatementTypes.has(ancestor.type)) {
      return true;
    }

    if (functionBoundaryTypes.has(ancestor.type)) {
      // Don't treat as a hard boundary if this function is a callback to an
      // array iteration method — treat the iteration call itself as the loop.
      const parent = ancestors[i - 1];
      if (
        parent?.type === 'CallExpression' &&
        parent.callee.type === 'MemberExpression' &&
        parent.callee.property.type === 'Identifier' &&
        iterationMethods.has(parent.callee.property.name) &&
        parent.arguments.includes(ancestor)
      ) {
        return true;
      }
      // True function boundary — stop scanning.
      return false;
    }
  }
  return false;
}
