#!/usr/bin/env bash
# Test runner — no make. Runs the same way locally and inside the test image.
#
#   tests/run.sh                       # all tiers: python + render + e2e
#   tests/run.sh py                    # python reader + server unittest only
#   tests/run.sh render                # node DOM-shim render smoke only
#   tests/run.sh e2e                   # playwright browser tests (all specs)
#   tests/run.sh e2e custom_ui.spec.js # playwright, only that spec (extra args
#                                      # are forwarded straight to playwright)
set -e
cd "$(dirname "$0")/.."   # adminsys/

TIER="${1:-all}"
shift || true   # remaining args ($@) are forwarded to playwright in the e2e tier

run_py() {
  echo "== reader + server tests (python unittest) =="
  python3 -m unittest discover -s tests -p 'test_*.py' -v
}

run_render() {
  echo "== render smoke (node DOM shim) =="
  node tests/test_render.mjs
}

run_e2e() {
  echo "== browser e2e (playwright) =="
  cd tests/e2e
  [ -d node_modules ] || npm install
  ./node_modules/.bin/playwright test "$@"   # extra args (spec/-g) forwarded
}

case "$TIER" in
  py)     run_py ;;
  render) run_render ;;
  e2e)    run_e2e "$@" ;;
  all)    run_py; echo; run_render; echo; run_e2e ;;
  *) echo "usage: tests/run.sh [py|render|e2e|all]" >&2; exit 2 ;;
esac
