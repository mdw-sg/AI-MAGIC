import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Login-sessionen og ordrehistorikken er personlige data. De gemmes derfor i
// brugerens hjemmemappe — ikke i projektmappen, som ligger i OneDrive og
// synkroniseres til skyen, og som også pushes til GitHub.
const DATA_DIR = join(homedir(), ".nemlig-tool");

function ensureDataDir() {
  mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  chmodSync(DATA_DIR, 0o700);
}

export function readJsonFile<T>(name: string): T | null {
  const path = join(DATA_DIR, name);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile(name: string, value: unknown) {
  ensureDataDir();
  const path = join(DATA_DIR, name);
  // Kun den lokale bruger må læse filerne (rw-------).
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}

export function deleteFile(name: string) {
  rmSync(join(DATA_DIR, name), { force: true });
}
