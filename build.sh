#!/bin/sh
# Construit dist/chrome/bloque-ton-facho.zip et dist/firefox/bloque-ton-facho-firefox.xpi depuis src/.
set -e
root=$(cd "$(dirname "$0")" && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Firefox : src/ tel quel, à la racine de l'archive.
rm -f "$root/dist/firefox/bloque-ton-facho-firefox.xpi"
(cd "$root/src" && zip -qrX "$root/dist/firefox/bloque-ton-facho-firefox.xpi" . -x '*.DS_Store')

# Chrome : un dossier bloque-ton-facho/, sans la clé propre à Firefox (Chrome l'affiche en erreur).
dir="$tmp/bloque-ton-facho"
mkdir "$dir"
cp -R "$root/src/." "$dir/"
cp "$root/dist/chrome/README.md" "$dir/"
python3 - "$dir/manifest.json" <<'EOF'
import json, sys
path = sys.argv[1]
manifest = json.load(open(path, encoding="utf-8"))
del manifest["browser_specific_settings"]
with open(path, "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")
EOF
rm -f "$root/dist/chrome/bloque-ton-facho.zip"
(cd "$tmp" && zip -qrX "$root/dist/chrome/bloque-ton-facho.zip" bloque-ton-facho -x '*.DS_Store')

echo "OK : dist/chrome/bloque-ton-facho.zip et dist/firefox/bloque-ton-facho-firefox.xpi"
