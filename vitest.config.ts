import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: loadEnv('test', process.cwd(), ''),
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.test.js',
        'scripts/',
        'coverage/',
        '*.config.ts',
        '*.config.js',
      ],
      include: [
        'src/**/*.ts',
        'src/**/*.js',
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 90,
          statements: 90,
        },
      },
    },
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});