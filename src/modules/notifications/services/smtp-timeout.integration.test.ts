import { createServer, type Server, type Socket } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createSmtpTransport } from "./smtp-client";

const sockets = new Set<Socket>();
let server: Server | null = null;

async function listen(handler: (socket: Socket) => void): Promise<number> {
  server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    handler(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  return address.port;
}

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  sockets.clear();
  if (server) {
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  }
});

const email = { subject: "Timeout test", text: "Timeout test", html: "<p>Timeout test</p>" };

describe("SMTP transport timeout behavior", () => {
  it("rejects a peer that accepts TCP but never sends an SMTP greeting", async () => {
    const port = await listen(() => undefined);
    const smtp = createSmtpTransport({
      host: "127.0.0.1",
      port,
      secure: false,
      from: "HAU SOC <badges@example.test>",
      connectionTimeoutMs: 300,
      greetingTimeoutMs: 300,
      socketTimeoutMs: 300,
    });
    const started = Date.now();
    await expect(smtp.send({ to: "student@example.test", email })).rejects.toBeTruthy();
    expect(Date.now() - started).toBeLessThan(3_000);
  });

  it("rejects a closed SMTP port without hanging", async () => {
    const port = await listen(() => undefined);
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
    const smtp = createSmtpTransport({
      host: "127.0.0.1",
      port,
      secure: false,
      from: "HAU SOC <badges@example.test>",
      connectionTimeoutMs: 300,
      greetingTimeoutMs: 300,
      socketTimeoutMs: 300,
    });
    const started = Date.now();
    await expect(smtp.send({ to: "student@example.test", email })).rejects.toBeTruthy();
    expect(Date.now() - started).toBeLessThan(3_000);
  });
});
