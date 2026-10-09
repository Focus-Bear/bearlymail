const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

// Reuse every production regression and assertion; do not maintain a friendlier Jev-only dataset.
const baseline = YAML.parse(fs.readFileSync(path.join(__dirname, 'categorise-summary.yaml'), 'utf8'));
module.exports = {
  ...baseline,
  description: 'Jev Choice vs Gemini: unchanged categorisation regressions, with separate generation tests',
  providers: [
    ...baseline.providers,
    { id: path.join(__dirname, 'providers/jev-categorisation.cjs') },
    { id: path.join(__dirname, 'providers/jev-categorisation-hybrid.cjs'), label: 'jev-hybrid' },
  ],
};
