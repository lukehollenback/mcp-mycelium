module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended',
  ],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json',
  },
  env: {
    node: true,
    es2022: true,
  },
  globals: {
    fetch: 'readonly',
    AbortSignal: 'readonly',
    NodeJS: 'readonly',
    process: 'readonly',
    console: 'readonly',
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    Buffer: 'readonly',
  },
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'warn', 
    'no-console': 'warn',
    'no-undef': 'off', // Temporarily disabled - TypeScript handles this
  },
  overrides: [
    {
      files: ['tests/**/*'],
      env: {
        node: true,
        es2022: true,
      },
      globals: {
        global: 'writable',
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'warn',
        'no-console': 'off',
      },
    },
  ],
};