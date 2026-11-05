const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required to run MariaDB integration tests");
}

if (process.env.E2E_DATABASE_URL && process.env.E2E_DATABASE_URL === testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL and E2E_DATABASE_URL must point to different databases");
}

const integrationDatabaseName = decodeURIComponent(new URL(testDatabaseUrl).pathname.slice(1));
if (!/(^|[_-])(test|integration)([_-]|$)/i.test(integrationDatabaseName)) {
  throw new Error(
    "TEST_DATABASE_URL must name a dedicated test/integration database (for example badging_test)",
  );
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.APP_URL ??= "http://localhost:3000";
