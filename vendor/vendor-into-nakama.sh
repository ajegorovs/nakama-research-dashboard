#!/usr/bin/env bash
# Place this plugin into a Nakama checkout so the bundled ("official") loader can see it.
#
#   ./vendor/vendor-into-nakama.sh /path/to/nakama [plugin-id]
#
# Two things are required, and this script does both idempotently:
#   1. the plugin tree at <checkout>/packages/plugins/<id>      (bundled loader path)
#   2. the `<id>` entry in the OFFICIAL_PLUGINS allowlist        (vendor/allowlist.patch)
#
# The checkout is otherwise left alone; the build outputs (actions/, ui/) are copied as committed,
# so a fresh vendor does not need Bun. Rebuild inside the checkout if you changed src/.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$(dirname "$HERE")"
CHECKOUT="${1:-}"
PLUGIN_ID="${2:-research-dashboard}"

if [ -z "$CHECKOUT" ]; then
  echo "usage: $(basename "$0") <nakama-checkout> [plugin-id]" >&2
  exit 2
fi
if [ ! -d "$CHECKOUT/apps/server" ]; then
  echo "not a Nakama checkout (no apps/server): $CHECKOUT" >&2
  exit 2
fi

DEST="$CHECKOUT/packages/plugins/$PLUGIN_ID"
mkdir -p "$DEST"
for item in nakama.plugin.json migrations src skills actions ui README.md; do
  [ -e "$SRC/$item" ] || continue
  rm -rf "$DEST/$item"
  cp -R "$SRC/$item" "$DEST/$item"
done
# In-tree the plugin is a Bun workspace member, so it keeps the workspace:* devDependencies.
cp "$HERE/in-tree.package.json" "$DEST/package.json"
echo "vendored plugin -> $DEST"

ALLOWLIST="$CHECKOUT/apps/server/src/services/plugin-service.ts"
if grep -q "\"$PLUGIN_ID\"" "$ALLOWLIST"; then
  echo "allowlist already contains \"$PLUGIN_ID\" — nothing to patch"
else
  if git -C "$CHECKOUT" apply "$HERE/allowlist.patch" 2>/dev/null; then
    echo "applied allowlist.patch (git apply)"
  elif patch -d "$CHECKOUT" -p1 --forward <"$HERE/allowlist.patch"; then
    echo "applied allowlist.patch (patch -p1 fallback)"
  else
    echo "FAILED to apply the allowlist patch — upstream may have moved;" >&2
    echo "add [\"$PLUGIN_ID\", { requiresHost: false }] to OFFICIAL_PLUGINS in $ALLOWLIST by hand." >&2
    exit 1
  fi
fi

cat <<EOF

Next:
  cd $CHECKOUT
  bun install
  bun run --cwd packages/plugins/$PLUGIN_ID build      # only if you changed src/
  bun run apps/server/src/index.ts                     # or build the image with the plugin in place

Then, on a running instance (platform + org admin):
  GET  /v1/plugins/official                            -> $PLUGIN_ID listed
  POST /v1/plugins/official/$PLUGIN_ID/install
  POST /v1/plugins/$PLUGIN_ID/enable                   -> creates the organization data store
  POST /v1/plugins/official/$PLUGIN_ID/reinstall        after a rebuild, to mint a new +dev release
EOF
