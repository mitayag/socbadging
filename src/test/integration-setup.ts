const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required to run MariaDB integration tests");
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.APP_URL ??= "http://localhost:3000";
