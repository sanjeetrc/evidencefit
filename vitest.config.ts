import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Unit tests: pure logic (parsers, maths, storage, AI/Drive with stubbed fetch) plus one React render
// test. Run with `npm test`.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // The ported checks log a PASS line each; only show the console for tests that fail.
    silent: 'passed-only',
    // The guided-voice test drives a simulated speech service with real timers.
    testTimeout: 60_000,
  },
});
