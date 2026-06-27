/**
 * Bans Number#toLocaleString() with no arguments.
 *
 * `number.toLocaleString()` constructs a new `Intl.NumberFormat` object on
 * every call. `Intl.NumberFormat` construction involves locale resolution,
 * option parsing, and ICU data structure setup — each call costs roughly
 * 2–10 µs in V8 regardless of the number being formatted.
 *
 * `IntlUtil.toLocaleString()` (`src/utils/intlUtil.ts`) caches the
 * `Intl.NumberFormat` instance, so only the first call pays the construction
 * cost. Subsequent calls invoke `.format()` directly (~0.1–0.5 µs).
 *
 * Use `IntlUtil.toLocaleString(expr)` instead:
 *
 *   // Bad
 *   count.toLocaleString()
 *   files.length.toLocaleString()
 *
 *   // Good
 *   IntlUtil.toLocaleString(count)
 *   IntlUtil.toLocaleString(files.length)
 */

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description:
        'Disallow Number#toLocaleString() — use IntlUtil.toLocaleString() to reuse a cached Intl.NumberFormat instance',
    },
  },
  create(context) {
    return {
      'CallExpression[callee.type="MemberExpression"][callee.property.name="toLocaleString"][arguments.length=0]'(
        node,
      ) {
        const sourceCode = context.sourceCode;
        const object = sourceCode.getText(node.callee.object);
        context.report({
          node,
          message: `Use IntlUtil.toLocaleString(${object}) instead of ${object}.toLocaleString() to reuse a cached Intl.NumberFormat instance.`,
        });
      },
    };
  },
};
