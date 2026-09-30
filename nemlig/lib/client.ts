import { randomUUID } from "node:crypto";
import { clearSession, cookieHeader, getSession } from "./session";

const WEB = "https://www.nemlig.com";
const SEARCH = "https://webapi.prod.knl.nemlig.it";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

type Method = "GET" | "POST";

// Den eneste liste over nemlig-endpoints, værktøjet må kalde. Alt andet —
// herunder checkout, betaling, gemte kort og kontooplysninger — afvises her,
// før der overhovedet sendes en forespørgsel. Nye endpoints skal tilføjes
// eksplicit og bevidst.
const ALLOWED_ENDPOINTS: { method: Method; origin: string; path: RegExp }[] = [
  { method: "GET", origin: WEB, path: /^\/webapi\/Token$/ },
  { method: "GET", origin: WEB, path: /^\/webapi\/order\/GetBasicOrderHistory$/ },
  { method: "GET", origin: WEB, path: /^\/webapi\/v2\/order\/GetOrderHistory\/\d+$/ },
  { method: "GET", origin: WEB, path: /^\/webapi\/basket\/GetBasket$/ },
  { method: "POST", origin: WEB, path: /^\/webapi\/basket\/AddToBasket$/ },
  { method: "GET", origin: SEARCH, path: /^\/searchgateway\/api\/search$/ },
];

export class NotLoggedInError extends Error {
  constructor(message = "Du er ikke logget ind på nemlig.com.") {
    super(message);
    this.name = "NotLoggedInError";
  }
}

function assertAllowed(method: Method, url: URL) {
  const allowed = ALLOWED_ENDPOINTS.some(
    (e) => e.method === method && e.origin === url.origin && e.path.test(url.pathname)
  );
  if (!allowed) {
    throw new Error(
      `Blokeret: ${method} ${url.origin}${url.pathname} er ikke på listen over tilladte endpoints`
    );
  }
}

async function rawFetch(
  method: Method,
  url: URL,
  headers: Record<string, string>,
  body?: unknown
): Promise<Response> {
  assertAllowed(method, url);
  return fetch(url, {
    method,
    redirect: "manual",
    headers: {
      Accept: "application/json, text/plain, */*",
      "User-Agent": USER_AGENT,
      "X-Correlation-Id": randomUUID(),
      "Device-Size": "desktop",
      Platform: "web",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Læser kunde-id'et ud af nemlig's JWT. Uden det er tokenet anonymt. */
function hasCustomerId(jwt: string): boolean {
  try {
    const claims = JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString()) as {
      authorization?: { permissions?: { claims?: { debitorId?: string[] } }[] };
    };
    return Boolean(claims.authorization?.permissions?.[0]?.claims?.debitorId?.[0]);
  } catch {
    return false;
  }
}

async function readJson<T>(res: Response, url: URL): Promise<T> {
  const text = await res.text();
  if (!res.ok) throw new Error(`nemlig svarede ${res.status} på ${url.pathname}`);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`nemlig svarede ikke med JSON på ${url.pathname}`);
  }
}

/**
 * En forbindelse til nemlig for én arbejdsgang (fx én synkronisering). Nemlig's
 * bearer-token lever kun fem minutter, men login-cookien et år, så et nyt token
 * hentes blot fra cookien.
 */
export async function connect() {
  const session = getSession();
  if (!session) throw new NotLoggedInError();
  const cookie = cookieHeader(session);

  const tokenUrl = new URL("/webapi/Token", WEB);
  const tokenRes = await rawFetch("GET", tokenUrl, { Cookie: cookie });
  if (!tokenRes.ok) {
    throw new Error(`Kunne ikke hente token fra nemlig (${tokenRes.status})`);
  }
  const { access_token: token } = (await tokenRes.json()) as { access_token?: string };
  // Nemlig svarer ikke med 401, når cookien er udløbet — man får bare et
  // anonymt token og tomme svar. Derfor tjekkes kunde-id'et eksplicit.
  if (!token || !hasCustomerId(token)) {
    clearSession();
    throw new NotLoggedInError("Login på nemlig.com er udløbet. Log ind igen.");
  }

  // Login-cookien sendes kun til www.nemlig.com, aldrig til søge-API'et.
  function headersFor(url: URL): Record<string, string> {
    return url.origin === WEB
      ? { Cookie: cookie, Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${token}` };
  }

  async function getJson<T>(pathAndQuery: string, origin = WEB): Promise<T> {
    const url = new URL(pathAndQuery, origin);
    return readJson<T>(await rawFetch("GET", url, headersFor(url)), url);
  }

  async function postJson<T>(path: string, body: unknown): Promise<T> {
    const url = new URL(path, WEB);
    return readJson<T>(await rawFetch("POST", url, headersFor(url), body), url);
  }

  return { getJson, postJson, searchOrigin: SEARCH };
}

export type NemligConnection = Awaited<ReturnType<typeof connect>>;
