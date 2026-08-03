import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'src/**/*.test.tsx',
      'functions/**/*.test.js',
      // Admin scripts write to production Firestore. The pure logic inside them
      // (e.g. the backfill's title classifier) is exactly the part worth
      // testing, and without this glob those tests are collected by nothing and
      // pass silently by never running.
      'scripts/**/*.test.ts',
    ],
  },
});
