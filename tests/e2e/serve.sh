#!/usr/bin/env bash
# Build the fixture DATA_ROOT, then launch the real stdlib server on :1996.
set -e
cd "$(dirname "$0")/../.."   # adminsys/
FIX=$(python3 tests/e2e/build_fixture.py)
exec env DATA_ROOT="$FIX" HOST=127.0.0.1 PORT=1996 SSE_INTERVAL=2 APP_VERSION=e2e \
  python3 server.py
