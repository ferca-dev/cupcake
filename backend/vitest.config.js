import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/tests/setup.js'],
    include: ['src/**/*.{test,spec}.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
    // The default `threads` pool shares one V8 isolate per file. The local
    // mongodb-memory-server takes 5+ seconds to cold-start, and spinning up
    // several copies inside the same isolate makes their stdout pipes
    // interleave; the library's JSON parser then throws. Forks give each
    // test file a fresh process so the mongo instances don't share pipes.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.js'],
      exclude: ['src/server.js', 'src/tests/**', 'src/**/*.spec.js', 'src/**/*.test.js'],
    },
  },
});
