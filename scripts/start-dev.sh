#!/bin/bash

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker and try again."
  exit 1
fi

# Start Docker containers
echo "Starting Docker containers..."
docker-compose up -d

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL to be ready..."
until docker-compose exec postgres pg_isready -U ${DB_USER:-postgres} -d ${DB_NAME:-gonna_play} > /dev/null 2>&1; do
  echo "PostgreSQL is still starting. Waiting..."
  sleep 2
done

echo "PostgreSQL is up and running!"

# Run migrations
echo "Running database migrations..."
npm run migrate

echo "Setup complete! Your development environment is ready."
echo "Backend API is running at: http://localhost:3000"
echo "SonarQube is running at: http://localhost:9000"

# Show running containers
echo "Running containers:"
docker-compose ps 