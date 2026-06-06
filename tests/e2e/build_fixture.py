"""Build the deterministic fixture DATA_ROOT for the e2e server, print its path.

Reuses tests/_fixture.build() so the browser hits the same data the unit tests
assert against. Writes to tests/e2e/.fixture (gitignored).
"""

import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.dirname(os.path.dirname(HERE))      # adminsys/
sys.path.insert(0, os.path.join(PROJ, "tests"))

import _fixture  # noqa: E402

dest = os.path.join(HERE, ".fixture")
shutil.rmtree(dest, ignore_errors=True)
os.makedirs(dest)
_fixture.build(dest)
print(dest)
