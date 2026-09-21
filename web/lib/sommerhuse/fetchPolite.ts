const USER_AGENT =
  "AI-MAGIC-PersonalDashboard/0.1 (+local personal-use holiday-home tracker; contact: mdw@skatteguiden.dk)";

// Kendte disallowed stier pr. host, som sikkerhedsnet mod at pipelinen
// nogensinde selv konstruerer et søge-/admin-endpoint i stedet for kun at
// følge URL'er fundet i sitemaps.
const ROBOTS_DISALLOW: Record<string, string[]> = {
  "home.dk": [],
  "www.nybolig.dk": ["/soegeresultat-boliger"],
  "nybolig.dk": ["/soegeresultat-boliger"],
  "danbolig.dk": ["/umbraco", "/sitecore"],
};

function assertAllowed(url: string): void {
  const parsed = new URL(url);
  const disallowed = ROBOTS_DISALLOW[parsed.hostname] ?? [];
  for (const prefix of disallowed) {
    if (parsed.pathname.startsWith(prefix)) {
      throw new Error(`Refusing to fetch disallowed path: ${url}`);
    }
  }
}

export async function politeFetch(
  url: string,
  { timeoutMs = 15000 }: { timeoutMs?: number } = {}
): Promise<string> {
  assertAllowed(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timeout);
  }
}
