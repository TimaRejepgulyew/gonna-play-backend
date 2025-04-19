#!/bin/bash

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Docker is not running. Please start Docker and try again."
  exit 1
fi

# Start SonarQube and PostgreSQL with Docker Compose
echo "Starting SonarQube and PostgreSQL..."
docker-compose up -d postgres sonarqube

# Wait for SonarQube to be ready
echo "Waiting for SonarQube to be ready..."
until curl -s http://localhost:9000/api/system/status | grep -q '"status":"UP"'; do
  echo "SonarQube is still starting. Waiting..."
  sleep 10
done

echo "SonarQube is up and running!"
echo "Access SonarQube at http://localhost:9000"
echo "Default credentials: admin/admin"
echo ""
echo "To run analysis:"
echo "1. Generate a token in SonarQube (Administration > Security > Users > Tokens)"
echo "2. Run: npm run test:coverage"
echo "3. Run: sonar-scanner -Dsonar.login=YOUR_TOKEN"
echo ""
echo "Or simply run: SONAR_TOKEN=YOUR_TOKEN npm run sonar:coverage" 