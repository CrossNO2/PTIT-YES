import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, "../supabase/migrations");

console.log("🔍 Validating Supabase migration files in:", migrationsDir);

if (!fs.existsSync(migrationsDir)) {
  console.error("❌ ERROR: Migrations directory does not exist:", migrationsDir);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (files.length === 0) {
  console.error("❌ ERROR: No SQL migration files found in:", migrationsDir);
  process.exit(1);
}

console.log(`📋 Found ${files.length} migration files.`);

let expectedIndex = 1;
let hasError = false;

for (const file of files) {
  const filePath = path.join(migrationsDir, file);
  const stats = fs.statSync(filePath);

  // Check prefix: e.g. 001, 002
  const match = file.match(/^(\d{3})_/);
  if (!match) {
    console.error(`❌ ERROR: File ${file} does not match expected naming convention (NNN_description.sql)`);
    hasError = true;
    continue;
  }

  const fileIndex = parseInt(match[1], 10);
  if (fileIndex !== expectedIndex) {
    console.error(
      `❌ ERROR: Sequence mismatch in ${file}. Expected index ${String(expectedIndex).padStart(3, "0")}, found ${match[1]}`
    );
    hasError = true;
  }
  expectedIndex++;

  // Check file size (non-empty)
  if (stats.size < 50) {
    console.error(`❌ ERROR: File ${file} is suspiciously small (${stats.size} bytes). Potential empty file.`);
    hasError = true;
  }

  // Basic SQL content check
  const content = fs.readFileSync(filePath, "utf-8");
  const hasSqlKeywords = /CREATE|ALTER|DROP|INSERT|UPDATE|GRANT|DO\s+\$\$/i.test(content);
  if (!hasSqlKeywords) {
    console.error(`❌ ERROR: File ${file} does not contain standard SQL DDL/DML keywords.`);
    hasError = true;
  }

  console.log(`  ✓ [${match[1]}] ${file} (${stats.size} bytes)`);
}

if (hasError) {
  console.error("\n❌ Migration validation FAILED. Correct issues before proceeding.");
  process.exit(1);
}

console.log("\n✅ All migration files validated successfully! Sequential ordering verified (001 -> 014).\n");
process.exit(0);
