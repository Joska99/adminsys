# ADMIN.SYS — make spins up containers only. Tests run via tests/run.sh
# (no make inside docker). Run tests directly: bash tests/run.sh [py|render|e2e|all]

.PHONY: test run run-bg stop help

.DEFAULT_GOAL := test

help:
	@echo "make test         - build the test image and run the whole suite in a container"
	@echo "make run          - rebuild the app container and run it (compose, :1999)"
	@echo "make run-bg       - same, detached (background)"
	@echo "make stop         - stop the app container"
	@echo ""
	@echo "tests without docker:  bash tests/run.sh [py|render|e2e|all]"

# build the test image and run all tiers inside it (image CMD = tests/run.sh)
test:
	docker build -f Dockerfile.test -t adminsys-test .
	docker run --rm adminsys-test

# rebuild the dashboard image and run it (foreground; Ctrl-C to stop)
run:
	docker compose up --build

# same, detached
run-bg:
	docker compose up --build -d

stop:
	docker compose down
