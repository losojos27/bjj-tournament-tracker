#!/usr/bin/env bash
# Produces an artifact-ready fragment from index.html.
# The Artifact host wraps the file in its own <!doctype>/<html>/<head>/<body>,
# so we keep only <title> + <style> and the body contents.
set -euo pipefail
src="${1:-$(dirname "$0")/../index.html}"
out="${2:-$(dirname "$0")/../dist/artifact.html}"
mkdir -p "$(dirname "$out")"
{
  sed -n '/<title>/,/<\/style>/p' "$src"
  sed -n '/<body[ >]/,/<\/body>/p' "$src" | sed '1d;$d'
} > "$out"
echo "wrote $out ($(wc -c <"$out") bytes)"
