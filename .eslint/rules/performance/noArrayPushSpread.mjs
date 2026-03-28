/**
 * Bans Array#push(...array).
 *
 * The spread operator in a function call position converts an array into individual
 * arguments, which are placed on the JavaScript call stack. V8's argument limit is
 * roughly 65k–500k elements depending on the environment; exceeding it throws:
 *
 *   RangeError: Maximum call stack size exceeded
 *
 * This is a silent runtime hazard — the code works fine for small arrays in tests
 * but can crash in production when arrays are large. Prefer a for...of loop instead:
 *
 *   // Bad
 *   target.push(...source);
 *
 *   // Good
 *   for (const item of source) {
 *     target.push(item);
 *   }
 */

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Array#push() with spread arguments (call stack overflow risk)',
    },
  },
  create(context) {
    return {
      'CallExpression[callee.property.name="push"]'(node) {
        const hasSpread = node.arguments.some((arg) => arg.type === 'SpreadElement');
        if (!hasSpread) {
          return;
        }
        context.report({
          node,
          message:
            'Array#push(...array) can overflow the call stack for large arrays; use a for...of loop instead.',
        });
      },
    };
  },
};
