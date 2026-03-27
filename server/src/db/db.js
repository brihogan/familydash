import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { runMigrations } from './migrations.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const dbPath = process.env.DATABASE_PATH || join(__dirname, '../../../data/family.db');

// Ensure data directory exists (skip for in-memory databases)
if (dbPath !== ':memory:') {
  const dbDir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  if (dbDir) mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);

// Apply schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Enable WAL and foreign keys (idempotent)
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Run all migrations
runMigrations(db);

export default db;
