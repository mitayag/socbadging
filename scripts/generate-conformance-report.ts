import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  buildLocalConformanceReport,
  renderLocalConformanceMarkdown,
  type LocalConformanceInput,
} from "../src/modules/open-badges/conformance-report";

type ResultsFile = Pick<LocalConformanceInput, "generatedAt" | "certified" | "gates">;

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value) {
    throw new Error(
      "Usage: generate-conformance-report --results <json> --output <markdown> [--json-output <json>]",
    );
  }
  return resolve(value);
}

async function sha256(path: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

async function main() {
  const resultsPath = argument("--results");
  const outputPath = argument("--output");
  const jsonOutputIndex = process.argv.indexOf("--json-output");
  const jsonOutputValue = jsonOutputIndex >= 0 ? process.argv[jsonOutputIndex + 1] : undefined;
  const jsonOutputPath = jsonOutputValue ? resolve(jsonOutputValue) : null;
  const results = JSON.parse(await readFile(resultsPath, "utf8")) as ResultsFile;
  const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8")) as {
    dependencies: Record<string, string>;
  };
  const fixturePaths = [
    "src/modules/open-badges/contexts/vc-v2.json",
    "src/modules/open-badges/contexts/open-badges-3.0.3.json",
    "src/modules/open-badges/contexts/open-badges-extensions.json",
    "src/modules/open-badges/contexts/data-integrity-v2.json",
    "src/modules/open-badges/contexts/multikey-v1.json",
    "src/modules/open-badges/contexts/bitstring-status-list-v1.json",
  ].map((path) => resolve(path));
  const libraryNames = [
    "@digitalbazaar/data-integrity",
    "@digitalbazaar/ed25519-multikey",
    "@digitalbazaar/eddsa-rdfc-2022-cryptosuite",
    "@digitalbazaar/vc-bitstring-status-list",
    "jsonld",
    "jsonld-signatures",
  ];
  const libraries = Object.fromEntries(
    libraryNames.map((name) => {
      const version = packageJson.dependencies[name];
      if (!version) throw new Error(`Missing pinned conformance dependency: ${name}`);
      return [name, version];
    }),
  );
  const fixtures = await Promise.all(
    fixturePaths.map(async (path) => ({ name: basename(path), sha256: await sha256(path) })),
  );
  const report = buildLocalConformanceReport({ ...results, libraries, fixtures });
  await writeFile(outputPath, renderLocalConformanceMarkdown(report), "utf8");
  if (jsonOutputPath)
    await writeFile(jsonOutputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Report generation failed"}\n`);
  process.exitCode = 1;
});
