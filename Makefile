# .env uses shell-compatible KEY=value entries. Never commit local credentials.
SHELL := /bin/bash
ifneq (,$(wildcard .env))
include .env
export
endif

.PHONY: app-install app-start app-typecheck app-config backend-run backend-test backend-integration-test db-up db-test-up
app-install:
	npm --prefix app ci
app-start:
	npm --prefix app run start
app-typecheck:
	npm --prefix app run typecheck
app-config:
	cd app && npx --no-install expo config --type public
backend-run:
	cd backend && ./mvnw spring-boot:run
backend-test:
	cd backend && ./mvnw test
backend-integration-test:
	cd backend && TEST_DATABASE_URL="$${TEST_DATABASE_URL:-jdbc:postgresql://localhost:55433/stockroom_test}" TEST_DATABASE_USERNAME="$${TEST_DATABASE_USERNAME:-stockroom}" TEST_DATABASE_PASSWORD="$${TEST_DATABASE_PASSWORD:-stockroom_dev}" ./mvnw verify -Ppostgres-integration
db-up:
	docker compose up -d --wait db
db-test-up:
	docker compose --profile test up -d --wait db-test
