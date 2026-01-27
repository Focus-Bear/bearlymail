// Mock for app-root-path module
const mockPath = process.cwd();

module.exports = {
  path: mockPath,
  resolve: (pathToResolve: string) => pathToResolve,
  require: (modulePath: string) => require(modulePath),
  toString: () => mockPath,
};
