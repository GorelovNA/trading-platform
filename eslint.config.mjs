import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import rxjs from 'eslint-plugin-rxjs-x';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';

const repositoryNaming = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Enforce role-based Angular and model filenames' },
    schema: [],
    messages: {
      componentClass: 'Angular component classes must end in Component.',
      componentFile: 'Angular component files must use the .component.ts suffix.',
      serviceClass: 'Angular injectable classes must end in Service.',
      serviceFile: 'Angular injectable files must use the .service.ts suffix.',
      modelFile: 'Exported interfaces and type aliases belong in a models/*.model.ts file.',
      simpleUnion: 'Use a string enum for a named finite set of string values.',
    },
  },
  create(context) {
    const filename = context.filename.replaceAll('\\', '/');
    const hasDecorator = (node, name) =>
      node.decorators?.some((decorator) => {
        const expression = decorator.expression;
        const callee = expression.type === 'CallExpression' ? expression.callee : expression;
        return callee.type === 'Identifier' && callee.name === name;
      }) ?? false;

    return {
      ClassDeclaration(node) {
        if (hasDecorator(node, 'Component')) {
          if (!node.id?.name.endsWith('Component'))
            context.report({ node, messageId: 'componentClass' });
          if (!filename.endsWith('.component.ts'))
            context.report({ node, messageId: 'componentFile' });
        }
        if (hasDecorator(node, 'Injectable')) {
          if (!node.id?.name.endsWith('Service'))
            context.report({ node, messageId: 'serviceClass' });
          if (!filename.endsWith('.service.ts')) context.report({ node, messageId: 'serviceFile' });
        }
      },
      ExportNamedDeclaration(node) {
        if (
          ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration'].includes(node.declaration?.type) &&
          (!filename.includes('/models/') || !filename.endsWith('.model.ts'))
        ) {
          context.report({ node, messageId: 'modelFile' });
        }
        const annotation = node.declaration?.typeAnnotation;
        if (
          node.declaration?.type === 'TSTypeAliasDeclaration' &&
          annotation?.type === 'TSUnionType' &&
          annotation.types.length > 1 &&
          annotation.types.every(
            (member) => member.type === 'TSLiteralType' && typeof member.literal.value === 'string',
          )
        ) {
          context.report({ node, messageId: 'simpleUnion' });
        }
      },
    };
  },
};

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
    plugins: { 'repository-naming': { rules: { 'role-files': repositoryNaming } } },
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
      '@angular-eslint/component-class-suffix': 'error',
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
      'repository-naming/role-files': 'error',
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
    files: [
      'src/app/features/dashboard/dashboard.component.html',
      'src/app/features/dashboard/market-table/market-table.component.html',
      'src/app/features/settings/settings.component.html',
      'src/app/shared/producer-status.component.html',
    ],
    rules: {
      // This syntactic rule cannot identify signals; permit only view signal reads.
      '@angular-eslint/template/no-call-expression': [
        'error',
        {
          allowList: [
            'rows',
            'fields',
            'submissionMessage',
            'feedback',
            'rate',
            'state',
            'canPause',
            'canResume',
          ],
        },
      ],
    },
  },
  prettier,
]);
