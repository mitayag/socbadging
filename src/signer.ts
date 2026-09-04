import { loadSignerServiceConfig } from "@/config/env";
import { writeStructuredLog } from "@/platform/logging/structured-log";
import { createSignerRuntime } from "@/signer/runtime";
import { createSignerHttpServer } from "@/signer/server";

const SIGNER_HOST = "0.0.0.0";
const SIGNER_PORT = 3101;

async function main(): Promise<void> {
  const config = loadSignerServiceConfig(process.env);
  const runtime = await createSignerRuntime(config.runtime);
  const server = createSignerHttpServer({ runtime, token: config.token });
  server.listen(SIGNER_PORT, SIGNER_HOST, () => {
    writeStructuredLog("signer.http.listening", {
      host: SIGNER_HOST,
      port: SIGNER_PORT,
      status: runtime.getHealth().status,
      keyId: runtime.getHealth().keyId,
      cryptosuite: runtime.getHealth().cryptosuite,
    });
  });

  const close = () => server.close(() => process.exit(0));
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}

main().catch(() => {
  writeStructuredLog("signer.startup.failed", { outcome: "FAILED" });
  process.exitCode = 1;
});
