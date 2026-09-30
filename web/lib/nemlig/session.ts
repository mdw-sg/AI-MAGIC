import { chromium } from "playwright-core";
import { deleteFile, readJsonFile, writeJsonFile } from "./storage";
import type { Session } from "./types";

const SESSION_FILE = "session.json";
const LOGIN_URL = "https://www.nemlig.com/login";
const AUTH_COOKIE = ".ASPXAUTH";
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

let loginInProgress = false;

export function getSession(): Session | null {
  return readJsonFile<Session>(SESSION_FILE);
}

export function clearSession() {
  deleteFile(SESSION_FILE);
}

/**
 * Åbner et almindeligt Chrome-vindue på nemlig.com's login-side, hvor brugeren
 * selv logger ind. Værktøjet udfylder aldrig loginformularen og lytter ikke på
 * sidens netværkstrafik, så adgangskoden passerer aldrig gennem vores kode — vi
 * venter blot på, at nemlig sætter sin login-cookie, og gemmer derefter
 * nemlig's cookies.
 */
export async function loginWithBrowser(): Promise<Session> {
  if (loginInProgress) {
    throw new Error("Et login-vindue er allerede åbent.");
  }
  loginInProgress = true;

  // Frisk, midlertidig browserprofil: ingen adgang til brugerens egen Chrome-
  // profil, gemte kort eller adgangskoder.
  const browser = await chromium.launch({ channel: "chrome", headless: false });
  try {
    const context = await browser.newContext({ viewport: null });
    const page = await context.newPage();
    await page.goto(LOGIN_URL);

    const deadline = Date.now() + LOGIN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!browser.isConnected() || page.isClosed()) {
        throw new Error("Login-vinduet blev lukket, før login var gennemført.");
      }
      const cookies = await context.cookies("https://www.nemlig.com");
      if (cookies.some((c) => c.name === AUTH_COOKIE && c.value)) {
        const session: Session = {
          savedAt: new Date().toISOString(),
          cookies: cookies
            .filter((c) => c.domain.endsWith("nemlig.com"))
            .map((c) => ({ name: c.name, value: c.value, domain: c.domain })),
        };
        writeJsonFile(SESSION_FILE, session);
        return session;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    throw new Error("Login tog for lang tid (over 5 minutter). Prøv igen.");
  } finally {
    loginInProgress = false;
    await browser.close().catch(() => {});
  }
}

export function cookieHeader(session: Session): string {
  return session.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
