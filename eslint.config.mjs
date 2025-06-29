import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlatCompat } from '@eslint/eslintrc';
import eslint from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import eslintPluginJest from 'eslint-plugin-jest';
import eslintPluginJsdoc from 'eslint-plugin-jsdoc';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import eslintPluginSimpleImportSort from 'eslint-plugin-simple-import-sort';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: eslint.configs.recommended,
  allConfig: eslint.configs.all,
});

export default [
  {
    ignores: ['dist/**/*'],
  },

  // @typescript-eslint
  eslint.configs.recommended,
  ...compat.extends(
    'plugin:@typescript-eslint/strict-type-checked',
    'plugin:@typescript-eslint/stylistic-type-checked',
  ),
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Conflicts between @typescript-eslint plugins 😡
      '@typescript-eslint/non-nullable-type-assertion-style': 'off',

      // Personal preferences
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          // Allow passing async functions to places that don't explicitly accept them, such as
          // setTimeout()
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allow: ['unknown'],
          allowNever: true,
        },
      ],
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

  // Third party configs
  eslintPluginUnicorn.configs.recommended,
  eslintPluginJsdoc.configs['flat/recommended-typescript-error'],
  {
    ...eslintPluginJest.configs['flat/recommended'],
  },
  {
    plugins: {
      'simple-import-sort': eslintPluginSimpleImportSort,
    },
    rules: {
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
    },
  },
  eslintPluginPrettierRecommended, // MUST BE THE LAST PLUGIN!

  // Language options
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      sourceType: 'module',
      globals: {
        ...eslintPluginJest.environments.globals.globals,
      },
    },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },

  // Rule overrides
  {
    // Rules for all JavaScript files
    rules: {
      // ***** Files *****
      'unicorn/filename-case': [
        'error',
        {
          case: 'camelCase',
        },
      ],

      // ***** Imports *****
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

      // ***** Promises *****

      // ***** Functions *****

      // ***** Errors *****

      // ***** Operands *****
      eqeqeq: 'error',

      // ***** Conditionals *****

      // ***** Loops *****

      // ***** Objects *****

      // ***** Arrays *****
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='push'] > SpreadElement",
          message:
            "Array#push(...Array) can cause 'call stack size exceeded' runtime errors when pushing many values, prefer 'Array = [...Array, ...Array]'",
        },
      ],

      // ***** Numbers *****

      // ***** Strings *****
      'prefer-template': 'error',

      // ********** Recommended Overrides **********

      // ***** unicorn:recommended *****
      // Fixes
      'unicorn/prefer-single-call': [
        'error',
        {
          // Readable#push() doesn't have a rest parameter 😡
          ignore: ['readable.push'],
        },
      ],
      // Style and clarity preference differences
      'unicorn/import-style': 'off',
      'unicorn/no-array-for-each': 'off',
      'unicorn/no-array-reduce': 'off',
      'unicorn/no-await-expression-member': 'off',
      'unicorn/no-hex-escape': 'off',
      'unicorn/no-useless-undefined': 'off',
      'unicorn/prefer-string-raw': 'off',
      'unicorn/prefer-switch': 'off',
      'unicorn/prefer-ternary': 'off',
      'unicorn/prevent-abbreviations': 'off',
      // Too many false positives 😡
      'unicorn/consistent-function-scoping': ['error', { checkArrowFunctions: false }],
      'unicorn/no-array-callback-reference': 'off',
      'unicorn/no-array-method-this-argument': 'off',
      'unicorn/prefer-type-error': 'off',

      // ***** eslint:recommended *****
      // Referencing ASCII characters <32 is entirely legitimate
      'no-control-regex': 'off',

      // ***** plugin:jest/recommended *****
      // A lot of test files define their own expect functions
      'jest/expect-expect': 'off',
    },
  },
  {
    // Rules for TypeScript files
    files: ['**/*.ts'],
    rules: {
      // ***** Types *****

      // ***** Promises *****
      // Require any function or method that returns a Promise to be marked async.
      '@typescript-eslint/promise-function-async': ['error'],

      // ***** Classes *****
      '@typescript-eslint/prefer-readonly': 'error',
      // A lot of utility classes contain private functions that shouldn't be exposed
      '@typescript-eslint/no-extraneous-class': [
        'error',
        {
          allowStaticOnly: true,
        },
      ],
      // TODO(cemmer)
      '@typescript-eslint/no-misused-spread': 'off',

      // ***** Functions *****
      // Require explicit return types on functions and class methods.
      '@typescript-eslint/explicit-function-return-type': 'error',

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

      // ***** Objects *****
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          /*** @eslint/js defaults ***/
          vars: 'all',
          caughtErrors: 'all',
          reportUsedIgnorePattern: false,
          /*** Overrides ***/
          args: 'all',
          argsIgnorePattern: '^_',
          // Allow the use of destructuring to remove keys from an object
          ignoreRestSiblings: true,
        },
      ],

      // ********** Recommended Overrides **********

      // ***** plugin:@typescript-eslint/recommended *****
      // There are a few places where this needs to be allowed, but only a few, so warn on them
      '@typescript-eslint/no-floating-promises': 'warn',
      // There are a few places where this needs to be allowed, but only a few, so warn on them
      '@typescript-eslint/no-unused-expressions': 'warn',
    },
  },

  {
    // These files have switch cases on enum values, and have defensive
    // programming in case it was written wrong
    files: ['src/types/files/archives/**/*.ts', 'src/types/patches/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unnecessary-condition': 'off',
    },
  },

  // Restrict fs.promises for most files
  {
    files: ['**/*.ts'],
    ignores: ['packages/**', 'src/polyfill/ioFile.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'fs',
          property: 'promises',
          message: 'Use util.promisify() instead to take advantage of graceful-fs',
        },
      ],
    },
  },

  // Ignore JSDoc requirements for some files
  {
    files: [
      'test/**/*.ts',
      'packages/*/test/**/*.ts',
      // TODO(cemmer)
      'src/types/files/**/*.ts',
      'src/types/patches/**/*.ts',
    ],
    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },
];
