const fs = require('fs');
const path = require('path');

// Get migration name from command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Please provide a migration name');
  console.error('Example: npm run migrate:create add_user_roles');
  process.exit(1);
}

const migrationName = args[0].toLowerCase().replace(/\s+/g, '_');

// Create timestamp
const now = new Date();
const timestamp = [
  now.getFullYear(),
  String(now.getMonth() + 1).padStart(2, '0'),
  String(now.getDate()).padStart(2, '0'),
  String(now.getHours()).padStart(2, '0'),
  String(now.getMinutes()).padStart(2, '0'),
  String(now.getSeconds()).padStart(2, '0')
].join('');

// Create migration file
const fileName = `${timestamp}_${migrationName}.sql`;
const migrationsDir = path.join(__dirname, '..', 'src', 'migrations');

// Ensure migrations directory exists
if (!fs.existsSync(migrationsDir)) {
  fs.mkdirSync(migrationsDir, { recursive: true });
}

const filePath = path.join(migrationsDir, fileName);

// Create migration file with template
const template = `-- Migration: ${migrationName}
-- Created at: ${now.toISOString()}

-- Write your SQL migration here
-- For example:
-- CREATE TABLE example (
--   id SERIAL PRIMARY KEY,
--   name VARCHAR(100) NOT NULL,
--   created_at TIMESTAMP DEFAULT NOW()
-- );

-- Add your migration SQL here

`;

fs.writeFileSync(filePath, template);

console.log(`Migration file created: ${filePath}`);
console.log('Edit this file to add your migration SQL commands.');
console.log('Then run: npm run migrate'); 