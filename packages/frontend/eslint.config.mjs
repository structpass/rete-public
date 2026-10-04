import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

export default [
  {
    ignores: ['.next*/**', 'coverage/**', 'out/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      complexity: ['warn', 15],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', { max: 60, skipComments: true, skipBlankLines: true }],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
    rules: {
      complexity: 'off',
      'max-depth': 'off',
      'max-lines-per-function': 'off',
    },
  },
  {
    files: ['**/*.tsx'],
    rules: {
      'max-lines-per-function': ['warn', { max: 150, skipComments: true, skipBlankLines: true }],
    },
  },
];
