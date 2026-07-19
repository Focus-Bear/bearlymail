/**
 * Codemod to convert relative imports to absolute imports from src/
 *
 * Usage:
 *   npx jscodeshift -t codemod-relative-to-absolute.js --extensions=ts,tsx src/
 */

const path = require('path');

module.exports = function transformer(fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);
  const fileDir = path.dirname(fileInfo.path);

  // Find src directory (assume we're running from client/)
  const srcPath = path.resolve(process.cwd(), 'src');

  let hasChanges = false;

  // Find all import and export declarations
  root.find(j.ImportDeclaration).forEach(importPath => {
    const source = importPath.node.source.value;

    // Skip if already absolute (doesn't start with ./ or ../)
    if (!source.startsWith('./') && !source.startsWith('../')) {
      return;
    }

    // Skip node_modules imports
    if (source.includes('node_modules')) {
      return;
    }

    // Resolve the relative import to an absolute path
    const resolvedPath = path.resolve(fileDir, source); // nosemgrep

    // Check if resolved path is within src/
    if (!resolvedPath.startsWith(srcPath)) {
      return; // Skip imports outside src/
    }

    // Calculate relative path from src to the imported file
    const relativeToSrc = path.relative(srcPath, resolvedPath);

    // Convert to absolute import from src/
    // Remove .ts/.tsx extension if present
    let absoluteImport = relativeToSrc.replace(/\\/g, '/');
    absoluteImport = absoluteImport.replace(/\.(ts|tsx)$/, '');

    // Only transform if the resolved path is within src/
    if (!relativeToSrc.startsWith('..')) {
      importPath.node.source.value = absoluteImport;
      hasChanges = true;
    }
  });

  // Also handle require() calls
  root
    .find(j.CallExpression, {
      callee: { type: 'Identifier', name: 'require' },
    })
    .forEach(callPath => {
      const arg = callPath.node.arguments[0];
      if (arg && arg.type === 'StringLiteral') {
        const source = arg.value;

        if (source.startsWith('./') || source.startsWith('../')) {
          if (!source.includes('node_modules')) {
            const resolvedPath = path.resolve(fileDir, source); // nosemgrep
            if (resolvedPath.startsWith(srcPath)) {
              const relativeToSrc = path.relative(srcPath, resolvedPath);
              let absoluteImport = relativeToSrc.replace(/\\/g, '/');
              absoluteImport = absoluteImport.replace(/\.(ts|tsx)$/, '');
              if (!relativeToSrc.startsWith('..')) {
                arg.value = absoluteImport;
                hasChanges = true;
              }
            }
          }
        }
      }
    });

  if (hasChanges) {
    return root.toSource({
      quote: 'single',
      trailingComma: true,
    });
  }

  return fileInfo.source;
};
