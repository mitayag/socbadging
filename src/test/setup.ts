import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

process.env.DATABASE_URL ??= "mysql://test:test@127.0.0.1:3306/test";

afterEach(() => {
  cleanup();
});
