#!/bin/bash

echo "🚀 Deploying migrations to production..."

# Deploy migrations
npx prisma migrate deploy

# Generate client
npx prisma generate

echo "✅ Production deployment complete!" 