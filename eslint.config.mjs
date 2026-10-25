import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import rxjs from 'eslint-plugin-rxjs-x';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';

export default defineConfig([
  {
    ignores: [
      'dist/**',
      'coverage/**',
      '.angular/**',
      'node_modules/**',
      '.husky/_/**',
      'src/generated/**',
      'wasm/**/target/**',
      '.playwright-cli/**',
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { eqeqeq: ['error', 'always'], 'no-var': 'error', 'prefer-const': 'error' },
  },
  {
    files: ['src/**/*.ts', 'tests/support/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
      rxjs.configs.strict,
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
      globals: globals.browser,
    },
    processor: angular.processInlineTemplates,
    rules: {
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['error'] }],
      'no-debugger': 'error',
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-inject': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/no-uncalled-signals': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/no-input-prefix': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.property.name=/^bypassSecurityTrust/]',
          message: 'Keep Angular sanitization enabled; do not bypass trust for untrusted content.',
        },
      ],
    },
  },
  {
    files: ['src/app/features/market/worker/**/*.ts'],
    ignores: ['**/*.spec.ts'],
    languageOptions: {
      parserOptions: { projectService: false, project: './tsconfig.worker.json' },
      globals: {
        ...Object.fromEntries(Object.keys(globals.browser).map((key) => [key, 'off'])),
        ...globals.worker,
      },
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/prefer-class-binding': 'error',
      '@angular-eslint/template/no-any': 'error',
      '@angular-eslint/template/no-call-expression': 'error',
      '@angular-eslint/template/no-inline-styles': 'error',
    },
  },
  {
    files: ['src/app/features/home/home.html'],
    rules: {
      // This syntactic rule cannot identify signals. Permit only these two signal reads.
      '@angular-eslint/template/no-call-expression': [
        'error',
        { allowList: ['status', 'proofErrors'] },
      ],
    },
  },
  prettier,
]);
