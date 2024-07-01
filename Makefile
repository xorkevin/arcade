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

SERVER_BIN_NAME=arcade
SERVER_BIN_DIR=./bin
SERVER_BIN_PATH=$(SERVER_BIN_DIR)/$(SERVER_BIN_NAME)
SERVER_MAIN_PATH=./pkg/cmd

.PHONY: buildserver runserver devserver

buildserver:
	mkdir -p $(SERVER_BIN_DIR)
	go build -trimpath -ldflags "-w -s" -o $(SERVER_BIN_PATH) $(SERVER_MAIN_PATH)

runserver:
	$(SERVER_BIN_PATH) serve

devserver: buildserver runserver
