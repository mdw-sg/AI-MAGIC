import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { getOfferCache, type Offer } from "./offers";
import { getOrderCache } from "./orders";
import { isHousehold, isOrganic, productKey } from "./preferences";
import { readJsonFile, writeJsonFile } from "./storage";

const CACHE_FILE = "suggestions.json";
const DISMISSED_FILE = "dismissed.json";
const HISTORY_LINES = 200;
const CLAUDE_TIMEOUT_MS = 4 * 60 * 1000;

export type SuggestionGroup = "new" | "alternative";

export type Suggestion = {
  offer: Offer;
  group: SuggestionGroup;
  reason: string;
  quantity: number;
};

export type SuggestionCache = {
  createdAt: string;
  offersFetchedAt: string;
  suggestions: Suggestion[];
};

type Dismissed = { productId: string; name: string }[];

export function getDismissed(): Dismissed {
  return readJsonFile<Dismissed>(DISMISSED_FILE) ?? [];
}

/** Skjuler et forslag og husker det, så AI'en ikke foreslår det igen. */
export function dismissSuggestion(productId: string) {
  const cache = getSuggestionCache();
  const suggestion = cache?.suggestions.find((s) => s.offer.productId === productId);
  const dismissed = getDismissed();
  if (!dismissed.some((d) => d.productId === productId)) {
    dismissed.push({ productId, name: suggestion?.offer.name ?? productId });
    writeJsonFile(DISMISSED_FILE, dismissed);
  }
}

export function getSuggestionCache(): SuggestionCache | null {
  const cache = readJsonFile<SuggestionCache>(CACHE_FILE);
  if (!cache) return null;
  const dismissed = new Set(getDismissed().map((d) => d.productId));
  return { ...cache, suggestions: cache.suggestions.filter((s) => !dismissed.has(s.offer.productId)) };
}

const SCHEMA = {
  type: "object",
  properties: {
    suggestions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          productId: { type: "string" },
          group: { type: "string", enum: ["new", "alternative"] },
          reason: { type: "string" },
          quantity: { type: "integer", minimum: 1, maximum: 10 },
        },
        required: ["productId", "group", "reason", "quantity"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestions"],
  additionalProperties: false,
};

function claudeBinary(): string {
  const local = join(homedir(), ".local", "bin", "claude");
  return existsSync(local) ? local : "claude";
}

/**
 * Kører Claude Code lokalt i print-tilstand. Alle værktøjer er slået fra, så
 * Claude kun kan svare med tekst — ikke læse filer, køre kommandoer eller gå
 * på nettet. Svaret valideres mod et skema, og det køres i en tom mappe, så
 * ingen projektfiler indgår.
 */
function runClaude(prompt: string): Promise<unknown> {
  const cwd = mkdtempSync(join(tmpdir(), "nemlig-ai-"));
  return new Promise((resolve, reject) => {
    const child = execFile(
      claudeBinary(),
      [
        "-p",
        "--tools",
        "",
        "--safe-mode",
        "--strict-mcp-config",
        "--no-session-persistence",
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(SCHEMA),
      ],
      { cwd, timeout: CLAUDE_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout) => {
        rmSync(cwd, { recursive: true, force: true });
        if (error) {
          reject(
            new Error(
              (error as NodeJS.ErrnoException).code === "ENOENT"
                ? "Claude Code blev ikke fundet på denne Mac."
                : `Claude Code fejlede: ${error.message.slice(0, 200)}`
            )
          );
          return;
        }
        try {
          const out = JSON.parse(stdout) as { is_error?: boolean; structured_output?: unknown; result?: string };
          if (out.is_error) throw new Error(out.result ?? "ukendt fejl");
          resolve(out.structured_output);
        } catch (e) {
          reject(new Error(`Kunne ikke læse Claudes svar: ${e instanceof Error ? e.message : e}`));
        }
      }
    );
    child.stdin?.end(prompt);
  });
}

function formatOffer(o: Offer): string {
  const deal = [o.campaignText, o.savings ? `spar ${o.savings} kr` : null].filter(Boolean).join(", ");
  const origin = [o.isOrganic && "øko", o.isDanish && "dansk"].filter(Boolean).join("/");
  return `${o.productId} | ${o.name} | ${o.description} | ${o.section} | ${o.price} kr${deal ? ` (${deal})` : ""}${origin ? ` | ${origin}` : ""}`;
}

/**
 * Laver AI-forslag ud fra ugens tilbud på varer, brugeren ikke har købt før.
 * Kun produktnavne, antal og priser sendes til Claude — ingen personoplysninger.
 */
export async function generateSuggestions(): Promise<SuggestionCache> {
  const orders = getOrderCache();
  const offers = getOfferCache();
  if (!orders || !offers) throw new Error('Klik "Opdater ordrer og tilbud" først.');

  // Købshistorik samlet pr. vare.
  const history = new Map<string, { name: string; group: string; count: number; ids: Set<string> }>();
  for (const order of orders.orders) {
    const seen = new Set<string>();
    for (const line of order.lines) {
      const key = productKey(line.name);
      const entry = history.get(key) ?? { name: line.name, group: line.mainGroup, count: 0, ids: new Set() };
      entry.ids.add(line.productId);
      if (!seen.has(key)) entry.count += 1;
      seen.add(key);
      history.set(key, entry);
    }
  }
  const boughtIds = new Set([...history.values()].flatMap((h) => [...h.ids]));
  const dismissed = getDismissed();
  const dismissedIds = new Set(dismissed.map((d) => d.productId));

  // Kun tilbud på varer, brugeren ikke allerede køber (de står under "På
  // tilbud"), og kun øko eller dansk for fødevarer.
  const candidates = offers.offers.filter(
    (o) =>
      !o.soldOut &&
      !dismissedIds.has(o.productId) &&
      !boughtIds.has(o.productId) &&
      !history.has(productKey(o.name)) &&
      (isHousehold({ mainGroup: o.section }) || o.isOrganic || o.isDanish)
  );
  if (candidates.length === 0) throw new Error("Ingen nye tilbud at vurdere.");

  const historyLines = [...history.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, HISTORY_LINES)
    .map((h) => `${h.name} | ${h.group} | købt i ${h.count} af ${orders.orders.length} ordrer${isOrganic(h.name) ? " | øko" : ""}`);

  const prompt = `Du hjælper en dansk husstand med deres ugentlige indkøb på nemlig.com.

Deres regler:
- Varer skal så vidt muligt være økologiske; ellers danske.
- Slik må gerne foreslås, når det er på tilbud.

Her er deres købshistorik (de ${orders.orders.length} seneste ordrer):
${historyLines.join("\n")}

${dismissed.length ? `De har sagt nej tak til disse forslag før — foreslå ikke dem eller lignende varer:\n${dismissed.map((d) => d.name).join("\n")}\n\n` : ""}Her er ugens tilbud på varer, de IKKE har købt før (varenummer | navn | beskrivelse | kategori | pris | mærker):
${candidates.map(formatOffer).join("\n")}

Vælg 8-12 tilbud, som husstanden sandsynligvis vil være glade for, ud fra deres vaner. Del dem i to grupper:
- "new": Nyt, der passer til dem — en vare de ikke køber i dag, men som passer til deres mønster (fx samme type mad, madlavning eller husholdning).
- "alternative": Et godt tilbud på en anden udgave af noget, de plejer at købe (fx et andet mærke, en anden størrelse eller variant).

For hvert forslag: brug varenummeret præcis som angivet, giv en kort begrundelse på dansk (én sætning, henvis gerne til en konkret vare de køber), og et fornuftigt antal ud fra tilbuddet (fx 2 ved "Mix 2 stk.").`;

  const output = (await runClaude(prompt)) as {
    suggestions?: { productId: string; group: SuggestionGroup; reason: string; quantity: number }[];
  };
  const byId = new Map(candidates.map((o) => [o.productId, o]));
  const suggestions: Suggestion[] = [];
  for (const s of output?.suggestions ?? []) {
    const offer = byId.get(s.productId);
    // Kun varer fra listen accepteres — Claude kan ikke finde på egne varer.
    if (!offer || suggestions.some((x) => x.offer.productId === offer.productId)) continue;
    suggestions.push({
      offer,
      group: s.group === "alternative" ? "alternative" : "new",
      reason: String(s.reason).slice(0, 300),
      quantity: Math.min(10, Math.max(1, Math.round(s.quantity) || 1)),
    });
  }

  const cache: SuggestionCache = {
    createdAt: new Date().toISOString(),
    offersFetchedAt: offers.fetchedAt,
    suggestions,
  };
  writeJsonFile(CACHE_FILE, cache);
  return cache;
}
