import "@testing-library/jest-dom/vitest";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";
