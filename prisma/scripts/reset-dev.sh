#!/bin/bash

echo "🔄 Resetting development database..."

# Reset database
npx prisma migrate reset --force

echo "✅ Database reset complete!"

# Run seed
echo "🌱 Running seed..."
npm run prisma:db:seed

echo "🎉 Development database ready!" 