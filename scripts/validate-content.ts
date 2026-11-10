import path from "node:path";
import { validateArchitecture } from "../src/lib/ingestion";

const sourceIndex = process.argv.indexOf("--source");
const sourceRoot = sourceIndex >= 0 ? path.resolve(process.argv[sourceIndex + 1]) : undefined;
const result = await validateArchitecture(sourceRoot);
console.log(JSON.stringify(result, null, 2));
