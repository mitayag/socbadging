import { test as base, expect } from "@playwright/test";

import { resetE2eRateLimits } from "./db";

export const test = base.extend<{ resetRateLimits: void }>({
  resetRateLimits: [
    async ({}, use) => {
      await resetE2eRateLimits();
      await use();
    },
    { auto: true },
  ],
});

export { expect };
