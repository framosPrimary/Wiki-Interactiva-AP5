import path from "node:path";
import { database } from "../src/lib/db";
import { ingestArchitecture } from "../src/lib/ingestion";

const sourceIndex = process.argv.indexOf("--source");
const commitIndex = process.argv.indexOf("--commit");
const sourceRoot = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : undefined;
const requestedCommit = commitIndex >= 0 ? process.argv[commitIndex + 1] : undefined;

try {
  const result = await ingestArchitecture({ sourceRoot, requestedCommit });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await database().end();
}
