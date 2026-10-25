#!/usr/bin/env bash
set -Eeuo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
source "$HERE/server-lib.sh"
MODE="${1:---plan}"
REV="$(git -C "$ROOT" rev-parse --verify "${DEPLOY_REV:-HEAD}^{commit}")"
case "$MODE" in --plan|--check|--apply|--rollback) ;; *) exit 1;; esac
check_access() {
  remote_bash "$WEB_BASE" <<'REMOTE'
set -Eeuo pipefail
[[ "$(id -un)" == eventadmin && "$HOME" == /home/eventadmin && "$PM2_HOME" == /home/eventadmin/.pm2 ]]
for dir in "$1" "$1/releases" "$1/assets"; do
  [[ -d "$dir" && -w "$dir" && -x "$dir" ]] || { echo "Frontend directory is not writable: $dir" >&2; exit 1; }
done
for tool in tar rsync; do command -v "$tool" >/dev/null; done
echo 'Frontend access verified as eventadmin; no release changed.'
REMOTE
}
echo "Frontend $REV -> $SERVER_USER@$SERVER_HOST:$WEB_BASE/releases/$REV (run as eventadmin)"
[[ "$MODE" != --plan ]] || exit 0
if [[ "$MODE" == --check ]]; then check_access; exit 0; fi
[[ "${DEPLOY_REV:-}" == "$REV" ]] || { echo 'Pin DEPLOY_REV to a full commit.' >&2; exit 1; }
check_access
if [[ "$MODE" == --apply ]]; then
  BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/eventclub-frontend.XXXXXX")"
  trap 'rm -rf "$BUILD_DIR"' EXIT
  git -C "$ROOT" archive "$REV" | tar -xf - -C "$BUILD_DIR"
  cd "$BUILD_DIR"
  npm ci --no-audit --no-fund
  npm run check
  npm run build
  test -s dist/index.html
  remote "test -d '$WEB_BASE/assets'; test ! -e '$WEB_BASE/releases/$REV'; mkdir '$WEB_BASE/releases/$REV'"
  COPYFILE_DISABLE=1 tar -cf - -C dist . | remote "tar -xf - -C '$WEB_BASE/releases/$REV'; chmod -R u=rwX,go=rX '$WEB_BASE/releases/$REV'"
fi
remote_bash "$WEB_BASE" "$REV" <<'REMOTE'
set -Eeuo pipefail
web=$1 rev=$2
test -s "$web/releases/$rev/index.html"
test -d "$web/releases/$rev/assets"
rsync -a "$web/releases/$rev/assets/" "$web/assets/"
if [[ -L "$web/current" ]]; then readlink "$web/current" > "$web/previous-release"; fi
ln -s "releases/$rev" "$web/current.next"
mv -Tf "$web/current.next" "$web/current"
echo "Frontend activated: $rev (previous hashed assets retained)."
REMOTE
