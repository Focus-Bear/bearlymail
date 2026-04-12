const fs = require("fs");
const data = JSON.parse(fs.readFileSync("lint-output.json", "utf8"));

const warnings = {};
data.forEach((file) => {
  file.messages.forEach((msg) => {
    if (msg.severity === 1) {
      // warning
      warnings[msg.ruleId] = (warnings[msg.ruleId] || 0) + 1;
    }
  });
});

const sorted = Object.entries(warnings).sort((a, b) => b[1] - a[1]);
console.log("Warning counts by rule:");
sorted.forEach(([rule, count]) => {
  console.log(`${count.toString().padStart(4)} ${rule}`);
});
console.log(
  `\nTotal: ${sorted.reduce((sum, [, count]) => sum + count, 0)} warnings`,
);
