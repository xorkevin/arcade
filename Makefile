.PHONY: all setup build dev lint format clean devserve

all: build

setup:
	yarn dlx @yarnpkg/sdks base

build:
	yarn run build

dev:
	yarn run build-dev

lint:
	yarn run lint

format:
	yarn run format

clean:
	if [ -d ./bin ]; then rm -r ./bin; fi
	yarn run clean

devserve:
	fsserve serve --config fsserve.json --base ./dist
