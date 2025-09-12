import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    timeout: 30000, // 30 seconds for TypeScript compilation
    setupFiles: [],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/index.ts', // Entry point
        'dist/**'
      ]
    }
  },
  esbuild: {
    target: 'node18'
  }
});