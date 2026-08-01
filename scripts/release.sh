#!/usr/bin/env bash
# Cut a release of the Bulk Exporter plugin.
#
#   scripts/release.sh [patch|minor|major|X.Y.Z] [-y|--yes]
#
# In order:
#   1. refuse to run on a dirty tree, off `main`, or behind origin
#   2. run the test suite and the production build (abort on failure)
#   3. bump package.json, then manifest.json + versions.json via version-bump.mjs
#   4. commit + tag with the BARE version - no leading "v". Obsidian's release
#      checker looks for a tag named exactly like manifest.json's version, and
#      rejects the plugin update if it is called "v2.0.16" instead of "2.0.16".
#   5. ask for confirmation, then push commit + tag
#
# Pushing the tag is what triggers .github/workflows/release.yml, which rebuilds
# and attaches main.js / manifest.json / styles.css to the GitHub release.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# ---------------------------------------------------------------- output ----

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
	BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
	YELLOW=$'\033[33m'; BLUE=$'\033[34m'; RESET=$'\033[0m'
else
	BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; BLUE=''; RESET=''
fi

step() { printf '\n%s==>%s %s%s%s\n' "$BLUE" "$RESET" "$BOLD" "$*" "$RESET"; }
info() { printf '    %s%s%s\n' "$DIM" "$*" "$RESET"; }
ok()   { printf '    %sok%s %s\n' "$GREEN" "$RESET" "$*"; }
warn() { printf '%swarning:%s %s\n' "$YELLOW" "$RESET" "$*" >&2; }
die()  { printf '\n%serror:%s %s\n' "$RED" "$RESET" "$*" >&2; exit 1; }

usage() {
	cat <<-EOF
	usage: scripts/release.sh [patch|minor|major|X.Y.Z] [-y|--yes]

	  patch|minor|major   bump the current version (default: patch)
	  X.Y.Z               use this exact version instead
	  -y, --yes           do not prompt before pushing
	EOF
}

# Files are rewritten before the commit; if anything blows up in between, say so.
DIRTIED=0
on_exit() {
	local code=$?
	if [ "$code" -ne 0 ] && [ "$DIRTIED" -eq 1 ]; then
		printf '%s\n' "" >&2
		warn "version files were modified but not committed. To undo:"
		printf '    git checkout -- package.json manifest.json versions.json\n' >&2
	fi
	exit "$code"
}
trap on_exit EXIT

# ------------------------------------------------------------------ args ----

BUMP=""
ASSUME_YES=0
while [ $# -gt 0 ]; do
	case "$1" in
		-y|--yes) ASSUME_YES=1 ;;
		-h|--help) usage; exit 0 ;;
		-*) usage >&2; die "unknown flag: $1" ;;
		*)
			if [ -n "$BUMP" ]; then
				usage >&2
				die "unexpected extra argument: $1"
			fi
			BUMP="$1"
			;;
	esac
	shift
done
BUMP="${BUMP:-patch}"

case "$BUMP" in
	patch|minor|major) ;;
	*)
		if ! printf '%s' "$BUMP" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
			usage >&2
			die "'$BUMP' is neither a bump type nor an X.Y.Z version"
		fi
		;;
esac

# -------------------------------------------------------------- preflight ----

step "preflight"

for tool in git node pnpm; do
	command -v "$tool" >/dev/null 2>&1 || die "$tool is not on PATH"
done

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "not a git repository: $REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$BRANCH" != "main" ]; then
	die "releases are cut from main, but you are on '$BRANCH'. Switch with: git switch main"
fi

if [ -n "$(git status --porcelain)" ]; then
	printf '%s\n' "$(git status --short)" >&2
	die "working tree is dirty. Commit or stash the changes above first."
fi

if [ ! -d node_modules ]; then
	die "node_modules is missing. Run: pnpm install --frozen-lockfile"
fi

if git fetch --quiet --tags origin main 2>/dev/null; then
	if git rev-parse -q --verify origin/main >/dev/null && \
	   ! git merge-base --is-ancestor origin/main HEAD; then
		die "local main is behind origin/main. Run: git pull --rebase"
	fi
	ok "up to date with origin/main"
else
	warn "could not reach origin - skipping the up-to-date and remote-tag checks"
fi

ok "on main, clean tree"

# ---------------------------------------------------------------- version ----

CURRENT_VERSION="$(node -p "require('./package.json').version")"
[ -n "$CURRENT_VERSION" ] || die "could not read version from package.json"

case "$BUMP" in
	patch|minor|major)
		NEW_VERSION="$(node -e '
			const [cur, kind] = process.argv.slice(1);
			const m = /^(\d+)\.(\d+)\.(\d+)/.exec(cur);
			if (!m) { console.error("cannot parse version: " + cur); process.exit(1); }
			let [maj, min, pat] = m.slice(1).map(Number);
			if (kind === "major") { maj++; min = 0; pat = 0; }
			else if (kind === "minor") { min++; pat = 0; }
			else { pat++; }
			process.stdout.write(maj + "." + min + "." + pat);
		' "$CURRENT_VERSION" "$BUMP")"
		;;
	*)
		if ! printf '%s' "$BUMP" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'; then
			usage >&2
			die "'$BUMP' is neither a bump type nor an X.Y.Z version"
		fi
		NEW_VERSION="$BUMP"
		;;
esac

[ "$NEW_VERSION" != "$CURRENT_VERSION" ] || die "new version equals current version ($CURRENT_VERSION)"

if git rev-parse -q --verify "refs/tags/$NEW_VERSION" >/dev/null; then
	die "tag '$NEW_VERSION' already exists locally"
fi
if remote_tag="$(git ls-remote --tags origin "refs/tags/$NEW_VERSION" 2>/dev/null)" && [ -n "$remote_tag" ]; then
	die "tag '$NEW_VERSION' already exists on origin"
fi

SLUG="$(git remote get-url origin 2>/dev/null | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
: "${SLUG:=symunona/obsidian-bulk-exporter}"

step "releasing $CURRENT_VERSION -> $NEW_VERSION"
info "1. pnpm test"
info "2. pnpm run build   (tsc -noEmit + esbuild production)"
info "3. bump package.json, manifest.json, versions.json"
info "4. commit 'chore(release): $NEW_VERSION' and tag '$NEW_VERSION' (bare, no 'v')"
info "5. push main + tag to $SLUG  <- asks first"

# ------------------------------------------------------------ test & build ----

step "running tests"
pnpm test || die "tests failed - nothing was changed"
ok "tests passed"

step "building production bundle"
pnpm run build || die "build failed - nothing was changed"

for artifact in main.js manifest.json styles.css; do
	[ -s "$artifact" ] || die "build did not produce a non-empty $artifact"
done
ok "main.js, manifest.json, styles.css present"

# ------------------------------------------------------------------ bump ----

step "bumping version files"
DIRTIED=1

# package.json first: version-bump.mjs reads the target from npm_package_version,
# which npm/pnpm normally sets from package.json during the `version` lifecycle.
node -e '
	const fs = require("fs");
	const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
	pkg.version = process.argv[1];
	fs.writeFileSync("package.json", JSON.stringify(pkg, null, "\t") + "\n");
' "$NEW_VERSION"
info "package.json  -> $NEW_VERSION"

npm_package_version="$NEW_VERSION" node version-bump.mjs
info "manifest.json -> $(node -p "require('./manifest.json').version")"
info "versions.json -> $(node -p "require('./versions.json')['$NEW_VERSION'] || 'MISSING'")"

MANIFEST_VERSION="$(node -p "require('./manifest.json').version")"
[ "$MANIFEST_VERSION" = "$NEW_VERSION" ] || die "manifest.json says $MANIFEST_VERSION, expected $NEW_VERSION"
[ "$(node -p "require('./versions.json')['$NEW_VERSION'] ? 1 : 0")" = "1" ] || \
	die "versions.json has no entry for $NEW_VERSION"
ok "manifest.json and versions.json in sync"

# ------------------------------------------------------------ commit & tag ----

step "committing and tagging"
git add package.json manifest.json versions.json
git commit --quiet -m "chore(release): $NEW_VERSION"
DIRTIED=0
git tag -a "$NEW_VERSION" -m "$NEW_VERSION"
ok "commit $(git rev-parse --short HEAD), tag $NEW_VERSION"

# ------------------------------------------------------------------ push ----

undo_hint() {
	printf '\n%sNothing was pushed.%s Undo the local commit and tag with:\n' "$BOLD" "$RESET"
	printf '    git tag -d %s && git reset --hard HEAD~1\n' "$NEW_VERSION"
}

step "ready to push - this is the point of no return"
info "git push origin main"
info "git push origin refs/tags/$NEW_VERSION"
info "the tag push starts the release workflow, which publishes"
info "https://github.com/$SLUG/releases/tag/$NEW_VERSION"

if [ "$ASSUME_YES" -eq 0 ]; then
	if [ ! -t 0 ]; then
		undo_hint
		die "not running interactively - re-run with --yes to push without a prompt"
	fi
	printf '\n%sPush %s to %s? [y/N]%s ' "$BOLD" "$NEW_VERSION" "$SLUG" "$RESET"
	read -r reply
	case "$reply" in
		y|Y|yes|Yes|YES) ;;
		*) undo_hint; exit 1 ;;
	esac
fi

step "pushing"
git push origin main
git push origin "refs/tags/$NEW_VERSION"

printf '\n%sReleased %s.%s\n' "$GREEN" "$NEW_VERSION" "$RESET"
info "workflow:  https://github.com/$SLUG/actions"
info "release:   https://github.com/$SLUG/releases/tag/$NEW_VERSION"
info "assets are attached by CI - check that main.js, manifest.json and"
info "styles.css are all listed before announcing the release."
