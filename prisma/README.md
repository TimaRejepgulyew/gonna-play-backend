# Prisma Database Management

This directory contains the improved Prisma setup with modular structure for better maintainability and organization.

## 📁 Directory Structure

```
prisma/
├── schema.prisma          # Main schema file with all models and configurations
├── generated/             # Generated Prisma client (auto-generated)
│   └── client/
├── migrations/            # Database migration files
├── schemas/               # Modular schema files (for reference/organization)
│   ├── base.prisma       # Base configuration
│   ├── user.prisma       # User-related models
│   └── player.prisma     # Player-related models
├── seeds/                 # Database seeding scripts
│   └── seed.ts           # Main seed file
├── scripts/               # Utility scripts
│   ├── reset-dev.sh      # Reset development database
│   └── deploy.sh         # Production deployment
└── README.md             # This file
```

## 🚀 Quick Start

### Development Setup

1. **Reset database and run migrations:**
   ```bash
   npm run prisma:migrate:reset
   ```

2. **Seed the database:**
   ```bash
   npm run prisma:db:seed
   ```

3. **Open Prisma Studio:**
   ```bash
   npm run prisma:studio
   ```

### Available Scripts

- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Create and apply new migration
- `npm run prisma:migrate:reset` - Reset database and apply all migrations
- `npm run prisma:db:push` - Push schema changes without migration (dev only)
- `npm run prisma:db:seed` - Seed database with initial data
- `npm run prisma:studio` - Open Prisma Studio
- `npm run prisma:format` - Format schema file

### Production Deployment

Use the deployment script:
```bash
./prisma/scripts/deploy.sh
```

## 📊 Database Schema

### Models

#### User Management
- **Role** - User roles (admin, user, player)
- **User** - User accounts with profile information
- **UserRole** - Many-to-many relationship between users and roles

#### Player Management
- **Player** - Player profiles with game-specific information

### Enums
- **PLAYER_LEVEL** - junior, middle, senior, legend
- **PLAYER_POSITION** - goalkeeper, defender, midfielder, forward
- **PLAYER_STATUS** - active, inactive

## 🌱 Seeding

The seed file creates:
- Default roles (admin, user, player)
- Admin user (admin@gonnaplay.com)
- Sample player user (player1@gonnaplay.com)
- Player profile for the sample user

## 🔧 Development Tips

1. **Making Schema Changes:**
   - Edit `schema.prisma`
   - Run `npm run prisma:migrate` to create migration
   - Apply with a descriptive name

2. **Database Issues:**
   - Use `./prisma/scripts/reset-dev.sh` to completely reset
   - Check migration status with `npm run prisma:migrate:status`

3. **Client Generation:**
   - Client is automatically generated to `./prisma/generated/client`
   - Import using: `import { PrismaClient } from './prisma/generated/client'`

## 📝 Migration Best Practices

1. Always create descriptive migration names
2. Review generated migration SQL before applying
3. Test migrations on development database first
4. Keep migrations small and focused
5. Never edit applied migration files

## 🔐 Security Notes

- Default seed passwords are for development only
- Always hash passwords in production
- Review database permissions before deployment
- Use environment variables for sensitive configuration 