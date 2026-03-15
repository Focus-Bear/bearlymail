// Mock for app-root-path module
const mockPath = process.cwd();

module.exports = {
  path: mockPath,
  resolve: (pathToResolve: string) => pathToResolve,
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require: (modulePath: string) => require(modulePath),
  toString: () => mockPath,
};
