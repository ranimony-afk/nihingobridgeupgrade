/**
 * Test setup: load .env so the Drizzle client can reach PostgreSQL.
 * Tests run against the real database because the Phase 13.2 gate
 * requires retrieval to return genuine source records.
 */
import "dotenv/config";
