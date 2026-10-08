.PHONY: run app-start app-typecheck backend-run backend-test backend-fmt db-up

run:
	$(MAKE) -C app run

app-start:
	npm --prefix app run start

app-typecheck:
	npm --prefix app run typecheck

backend-run:
	$(MAKE) -C backend run

backend-test:
	$(MAKE) -C backend test

backend-fmt:
	$(MAKE) -C backend fmt

db-up:
	docker compose up -d postgres
