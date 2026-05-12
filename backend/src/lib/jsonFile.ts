import { promises as fs } from "node:fs";
import path from "node:path";

export async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const raw = JSON.stringify(data, null, 2);
  await fs.writeFile(filePath, raw, "utf8");
}

