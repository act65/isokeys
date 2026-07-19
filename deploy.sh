#!/usr/bin/env bash
# Deploy the Hexboard static app into a folder (default: the act65.github.io
# Jekyll blog at ../act65.github.io/hexboard) for GitHub Pages hosting.
#
# The app is plain static files with relative paths, so Jekyll copies them
# verbatim (no front matter = static file) and serves them at /hexboard/.
#
# Usage:  ./deploy.sh [dest-folder]
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="${1:-$SRC/../act65.github.io/hexboard}"

mkdir -p "$DEST"
# only the runtime files — not archive/, tools/, README, deploy.sh, .git
rm -rf "$DEST/index.html" "$DEST/css" "$DEST/js"
cp "$SRC/index.html" "$DEST/"
cp -r "$SRC/css" "$SRC/js" "$DEST/"

echo "Deployed Hexboard -> $DEST"
echo
echo "To publish (from the blog repo):"
echo "  cd \"$(cd "$DEST/.." && pwd)\""
echo "  git add hexboard && git commit -m 'Add Hexboard isomorphic keyboard' && git push"
echo "Then it goes live at:  https://act65.github.io/hexboard/"
