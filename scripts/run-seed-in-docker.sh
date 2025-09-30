#!/usr/bin/env bash
set -eu

# This helper runs the seed script inside the 'api' service container.
# It ensures the compose services are up and waits for MongoDB replica set to be ready.

COMPOSE_PROJECT_DIR=$(pwd)

echo "Bringing up docker-compose (mongodb, mongodb-init, redis, api)"
docker compose up -d mongodb mongodb-init redis api

API_CONTAINER="$(docker compose ps -q api)"
if [ -z "$API_CONTAINER" ]; then
  echo "Could not find api container. Is docker compose configured correctly?"
  exit 1
fi

# Wait for mongodb to accept connections inside the network by trying mongosh from a mongo container
echo "Waiting for MongoDB replica set to be ready (this may take a few seconds)..."
# Try up to 60 attempts (~60s)
ATTEMPTS=0
MAX_ATTEMPTS=60
while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  set +e
  docker compose exec -T mongodb mongosh --quiet --username root --password password --authenticationDatabase admin --eval "rs.status().ok" >/dev/null 2>&1
  RC=$?
  set -e
  if [ $RC -eq 0 ]; then
    echo "MongoDB is reachable inside docker network."
    break
  fi
  ATTEMPTS=$((ATTEMPTS+1))
  sleep 1
done

if [ $ATTEMPTS -eq $MAX_ATTEMPTS ]; then
  echo "Timed out waiting for MongoDB to be ready. Check 'docker compose logs mongodb' and 'docker compose logs mongodb-init'."
  exit 2
fi

echo "Running seed script inside api container..."
# If compiled seed exists in /app/dist, run it with node. Otherwise rebuild the api image (so builder stage produces dist).
set +e
docker compose exec -T api sh -c "test -f /app/dist/scripts/seed.js"
RC=$?
set -e
if [ $RC -ne 0 ]; then
  echo "Compiled files not found in api container; rebuilding api image to produce dist..."
  docker compose up -d --build api
fi

# Run the compiled seed (production image doesn't contain ts-node)
docker compose exec -T api sh -c "node /app/dist/scripts/seed.js"

echo "Seed finished."
