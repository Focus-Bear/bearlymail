#!/bin/bash
# check-schema-drift.sh
# Wrapper script that calls the Node.js drift checker
# This exists for backward compatibility with CI workflows

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Call the Node.js script
node "$SCRIPT_DIR/check-schema-drift.js"
