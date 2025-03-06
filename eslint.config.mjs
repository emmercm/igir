import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import jest from 'eslint-plugin-jest';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: ['dist/**/*'],
  },
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended-type-checked',
    'plugin:jsdoc/recommended-typescript-error',
    'plugin:jest/recommended',
    'plugin:prettier/recommended', // MUST BE LAST!
  ),

  // plugin:@typescript-eslint/recommended-type-checked
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'warn',
      '@typescript-eslint/unbound-method': [
        'error',
        {
          ignoreStatic: true,
        },
      ],
    },
  },
  {
    ignores: ['**/*.ts'],
    ...tseslint.configs.disableTypeChecked,
  },

  {
    files: ['**/*.ts'],

    plugins: {
      '@typescript-eslint': typescriptEslint,
      'simple-import-sort': simpleImportSort,
      jest,
      unicorn,
    },

    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      sourceType: 'module',

      globals: {
        ...jest.environments.globals.globals,
      },
    },

    rules: {
      // ***** Files *****
      'unicorn/no-empty-file': 'error',
      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
        },
      ],

      // ***** Imports *****
      'unicorn/prefer-node-protocol': 'error',
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',

      // ***** JSDoc *****
      'jsdoc/require-jsdoc': [
        'error',
        {
          // Require on public parts of classes
          checkConstructors: false,

          contexts: [
            'ClassDeclaration',
            // TODO(cemmer): require private methods as well
            'MethodDefinition[accessibility!=private][key.name!=/^(get|set|with)[A-Z][a-zA-Z]+/]',
          ],
        },
      ],
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/no-blank-blocks': 'error',

      // ***** Types *****
      'unicorn/no-null': 'error',

      // ***** Promises *****
      // Disallow awaiting a value that is not a Thenable.
      '@typescript-eslint/await-thenable': 'error',
      // Disallow async functions which have no `await` expression.
      '@typescript-eslint/require-await': 'error',
      // Enforce consistent returning of awaited values.
      '@typescript-eslint/return-await': 'error',
      // Require any function or method that returns a Promise to be marked async.
      '@typescript-eslint/promise-function-async': ['error'],

      // ***** Classes *****
      '@typescript-eslint/prefer-readonly': 'error',
      'unicorn/new-for-builtins': 'error',
      'unicorn/no-static-only-class': 'error',

      // ***** Functions *****
      // Require explicit return types on functions and class methods.
      '@typescript-eslint/explicit-function-return-type': 'error',
      'unicorn/prefer-default-parameters': 'error',

      // ***** Errors *****
      'unicorn/catch-error-name': 'error',
      'unicorn/prefer-optional-catch-binding': 'error',

      // ***** Operands *****
      '@typescript-eslint/prefer-nullish-coalescing': 'error',

      // ***** Conditionals *****
      // Don't allow unnecessary conditional checks, such as when a value is always true, which can also help catch cases
      // such as accidentally checking `if([]){}` vs. `if([].length){}`
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        {
          allowAny: true,
          allowNullableBoolean: true,
          allowNullableString: true,
        },
      ],
      // Don't allow truthy or falsey conditionals on array lengths
      'unicorn/explicit-length-check': 'error',

      // ***** Loops *****
      'unicorn/no-for-loop': 'error',

      // ***** Objects *****
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          // Allow the use of destructuring to remove keys from an object
          ignoreRestSiblings: true,
        },
      ],

      // ***** Arrays *****
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='push'] > SpreadElement",
          message:
            "Array#push(...Array) can cause 'call stack size exceeded' runtime errors when pushing many values, prefer 'Array = [...Array, ...Array]'",
        },
      ],
      'unicorn/no-new-array': 'error',
      // TypeScript doesn't do a good job of reporting indexed values as potentially undefined, such as `[1,2,3][999]`
      'unicorn/prefer-at': 'error',
      // Try to enforce early terminations of loops, rather than statements such as `.find(x=>x)[0]`
      'unicorn/prefer-array-find': [
        'error',
        {
          checkFromLast: false,
        },
      ],
      'unicorn/prefer-array-flat': 'error',
      'unicorn/prefer-array-flat-map': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-object-from-entries': 'error',

      // ***** Numbers *****
      'unicorn/no-zero-fractions': 'error',
      'unicorn/numeric-separators-style': 'error',
      'unicorn/prefer-number-properties': 'error',

      // ***** Strings *****
      'unicorn/prefer-code-point': 'error',

      // ********** Recommended Overrides **********

      // ***** eslint:recommended *****
      // Referencing ASCII characters <32 is entirely legitimate
      'no-control-regex': 'off',

      // ***** plugin:@typescript-eslint/recommended *****
      // There are a few places where this needs to be allowed, but only a few, so warn on them
      '@typescript-eslint/no-floating-promises': 'warn',
      // There are a few places where this needs to be allowed, but only a few, so warn on them
      '@typescript-eslint/no-unused-expressions': 'warn',

      // ***** airbnb-base, airbnb-typescript/base *****
      'no-await-in-loop': 'off',
      'no-bitwise': 'off',

      // ***** plugin:jest/recommended *****
      // A lot of test files define their own expect functions
      'jest/expect-expect': 'off',
    },
  },
  {
    files: [
      'test/**/*.ts',
      // TODO(cemmer)
      'src/types/files/**/*.ts',
      'src/types/patches/**/*.ts',
    ],

    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },
];
