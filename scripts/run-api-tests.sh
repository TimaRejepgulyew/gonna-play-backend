#!/bin/bash

# Default environment
ENV=${1:-docker}

# Validate environment
if [[ ! "$ENV" =~ ^(local|docker|staging|production)$ ]]; then
  echo "Invalid environment: $ENV"
  echo "Valid environments: local, docker, staging, production"
  exit 1
fi

echo "Running API tests against $ENV environment..."

# Create reports directory if it doesn't exist
mkdir -p reports

# Run Newman with the specified environment using locally installed version
npx newman run postman/gonna-play-api.postman_collection.json \
  -e postman/environments/$ENV.postman_environment.json \
  --reporters cli,htmlextra \
  --reporter-htmlextra-export reports/newman-report.html

# Check if the tests passed
if [ $? -eq 0 ]; then
  echo "API tests passed successfully!"
  echo "HTML report generated at: reports/newman-report.html"
else
  echo "API tests failed. Check the report for details."
  echo "HTML report generated at: reports/newman-report.html"
  exit 1
fi 