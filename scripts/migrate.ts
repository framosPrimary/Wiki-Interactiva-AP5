import fs from "node:fs/promises";
import path from "node:path";
import { database } from "../src/lib/db";

const directory = path.resolve("migrations");
const files = (await fs.readdir(directory)).filter((file) => file.endsWith(".sql")).sort();
for (const file of files) {
  const sql = await fs.readFile(path.join(directory, file), "utf8");
  await database().query(sql);
  console.log(`Migración aplicada: ${file}`);
}
await database().end();
