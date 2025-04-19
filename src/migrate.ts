import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

async function runMigrations() {
  // Create a connection pool
  const pool = new Pool({
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "gonna_play",
  });

  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of executed migrations
    const { rows: executedMigrations } = await pool.query(
      "SELECT name FROM migrations ORDER BY id ASC"
    );
    const executedMigrationNames = executedMigrations.map((row) => row.name);

    // Get all migration files
    const migrationsDir = path.join(__dirname, "migrations");
    const migrationFiles = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    // Execute migrations that haven't been run yet
    for (const file of migrationFiles) {
      if (!executedMigrationNames.includes(file)) {
        console.log(`Running migration: ${file}`);

        // Read migration file
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, "utf8");

        // Start a transaction
        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Execute the migration
          await client.query(sql);

          // Record the migration
          await client.query("INSERT INTO migrations (name) VALUES ($1)", [
            file,
          ]);

          await client.query("COMMIT");
          console.log(`Migration ${file} completed successfully`);
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`Error running migration ${file}:`, err);
          throw err;
        } finally {
          client.release();
        }
      } else {
        console.log(`Migration ${file} already executed, skipping`);
      }
    }

    console.log("All migrations completed successfully");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migrations
runMigrations();
