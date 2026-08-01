#!/usr/bin/env bash
# Turn ./test-vault into a working Obsidian vault for plugin development:
#   - symlinks this repo in as the "bulk-exporter" plugin
#   - installs the two plugins the dev loop needs (Dataview, Hot Reload)
# Idempotent, safe to re-run.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VAULT="$REPO/test-vault"
PLUGINS="$VAULT/.obsidian/plugins"

mkdir -p "$PLUGINS"

echo "==> linking repo as plugin"
ln -sfn "$REPO" "$PLUGINS/bulk-exporter"

# Hot Reload watches for this file and reloads the plugin on every rebuild.
touch "$REPO/.hotreload"

install_plugin() {
	local id="$1" repo="$2"
	shift 2
	if [ -f "$PLUGINS/$id/main.js" ]; then
		echo "==> $id already installed, skipping"
		return
	fi
	echo "==> installing $id from $repo"
	mkdir -p "$PLUGINS/$id"
	local url
	url="https://github.com/$repo/releases/latest/download"
	for file in "$@"; do
		echo "    - $file"
		curl -fsSL "$url/$file" -o "$PLUGINS/$id/$file"
	done
}

install_plugin dataview blacksmithgu/obsidian-dataview \
	main.js manifest.json styles.css
install_plugin hot-reload pjeby/hot-reload \
	main.js manifest.json

echo
echo "Done. Now:"
echo "  1. pnpm run dev        # esbuild watch -> main.js"
echo "  2. Obsidian -> Open folder as vault -> $VAULT"
echo "  3. Trust author, enable the 3 community plugins"
