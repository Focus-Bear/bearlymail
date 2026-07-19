// Compatibility shim for tests migrated from Jest to Vitest.
// The runtime `jest.*` calls were rewritten to `vi.*`, but several test files
// still use the `jest.Mock` / `jest.Mocked` type names in annotations. This
// maps those type names onto their Vitest equivalents so they keep resolving
// without editing every test file.
declare global {
  namespace jest {
    type Mock = import('vitest').Mock;
    type Mocked<TModule> = import('vitest').Mocked<TModule>;
    type MockedFunction<TFunc extends (...args: never[]) => unknown> =
      import('vitest').MockedFunction<TFunc>;
    type SpyInstance = import('vitest').MockInstance;
  }
}

export {};
