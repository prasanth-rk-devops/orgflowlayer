.PHONY: up down logs reset test test-integration backup restore

up:            ## build and start everything
	docker compose up --build -d
down:          ## stop (keeps data)
	docker compose down
logs:          ## follow backend logs
	docker compose logs -f backend
reset:         ## stop and DELETE all data (database + uploads)
	docker compose down -v

test:          ## unit tests only
	cd backend && npm install && npm test
test-integration: ## full suite against a throwaway PostgreSQL container
	docker run -d --rm --name orgflow-pgtest -e POSTGRES_USER=orgflow -e POSTGRES_PASSWORD=orgflow \
	  -e POSTGRES_DB=orgflow_test -p 5433:5432 postgres:16-alpine
	@sleep 6
	cd backend && npm install && TEST_DATABASE_URL=postgres://orgflow:orgflow@localhost:5433/orgflow_test npm test; \
	  status=$$?; docker stop orgflow-pgtest; exit $$status

backup:        ## dump the database to ./backups
	./scripts/backup.sh
restore:       ## restore: make restore FILE=backups/orgflow-YYYY-MM-DD-HHMM.sql.gz
	./scripts/restore.sh $(FILE)
