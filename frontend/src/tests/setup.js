// Vitest setup. Keeps each test file isolated by resetting Pinia, localStorage,
// and any mocks installed on the global fetch.
import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage?.clear();
    window.sessionStorage?.clear();
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
