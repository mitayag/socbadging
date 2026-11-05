import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { armControlledAcceptance } from "../src/modules/notifications/services/controlled-acceptance-service";

const databaseUrl = process.env.DATABASE_URL;
const deliveryId = process.argv[2]?.trim();
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!deliveryId) throw new Error("Usage: arm-controlled-acceptance <delivery-id>");

const url = new URL(databaseUrl);
const prisma = new PrismaClient({
  adapter: new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: 1,
  }),
});

try {
  const attempt = await armControlledAcceptance(prisma, deliveryId);
  console.log(
    JSON.stringify(
      {
        armed: true,
        deliveryId: attempt.notificationDeliveryId,
        channel: attempt.deliveryChannel,
        submissionState: attempt.submissionState,
        acceptanceKey: attempt.acceptanceKey,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
