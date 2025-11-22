import fs from "node:fs/promises";
import path from "node:path";

export type ConditionKey = "brand_new" | "pre_owned";

export interface BnplPlan {
  providerId: string;
  providerName: string;
  months: number;
  monthly: number;
}

export interface TradeRange {
  min?: number | null;
  max?: number | null;
}

interface ProductConditionRecord {
  condition: ConditionKey;
  basePrice?: number | null;
  instalmentTotal?: number | null;
  bnpl?: BnplPlan[];
  tradeIn?: TradeRange | null;
  soldOut?: boolean;
}

interface ProductModelRecord {
  model_id: string;
  title: string;
  bundle?: string | null;
  region?: string | null;
  storage?: string | null;
  aliases: string[];
  categories?: string[];
  tags?: string[];
  kind?: string;
  warranty_notes?: string[];
  source?: {
    productId?: number;
    productName?: string;
    permalink?: string;
  };
  warnings?: string[];
  conditions: ProductConditionRecord[];
}

interface ProductFamilyRecord {
  family_id: string;
  title: string;
  instalment_factor?: number;
  bnpl_providers?: Array<{
    id: string;
    name: string;
    months: number[];
  }>;
  warranties?: Partial<Record<ConditionKey, string>>;
  models: ProductModelRecord[];
}

interface ProductsMasterFile {
  generated_at: string;
  source_catalog_size: number;
  family_count: number;
  families: ProductFamilyRecord[];
}

interface AliasIndexFile {
  generated_at: string;
  entries: Array<{
    alias: string;
    modelId: string;
    familyId: string;
  }>;
}

export interface PriceRange {
  min: number | null;
  max: number | null;
}

export interface CatalogConditionSummary {
  condition: ConditionKey;
  label: string;
  basePrice: number | null;
  instalmentTotal: number | null;
  bnpl: BnplPlan[];
  tradeIn?: TradeRange | null;
  soldOut?: boolean;
}

export interface FlattenedModel {
  modelId: string;
  familyId: string;
  familyTitle: string;
  title: string;
  aliases: string[];
  tokens: string[];
  brand?: string;
  categories?: string[];
  tags?: string[];
  kind?: string;
  warrantyNotes?: string[];
  permalink?: string;
  warnings?: string[];
  priceRange: PriceRange | null;
  familyRange: PriceRange | null;
  conditions: CatalogConditionSummary[];
}

interface CatalogContext {
  models: FlattenedModel[];
  aliasMap: Map<string, FlattenedModel[]>;
  loadedAt: number;
}

export interface CatalogMatch {
  modelId: string;
  familyId: string;
  familyTitle: string;
  name: string;
  permalink?: string;
  price?: string;
  priceRange?: PriceRange | null;
  familyRange?: PriceRange | null;
  conditions: CatalogConditionSummary[];
  flagshipCondition: CatalogConditionSummary | null;
  warnings?: string[];
}

const CACHE_TTL_MS = 1000 * 60 * 30;
const CONDITION_PREFERENCE: ConditionKey[] = ["brand_new", "pre_owned"];

const PRODUCTS_MASTER_PATH =
  process.env.PRODUCTS_MASTER_PATH ||
  path.join(process.cwd(), "data", "catalog", "products_master.json");
const ALIAS_INDEX_PATH =
  process.env.CATALOG_ALIAS_INDEX_PATH ||
  path.join(process.cwd(), "data", "catalog", "alias_index.json");

let catalogContext: CatalogContext | null = null;

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9+ ]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function conditionLabel(condition: ConditionKey): string {
  return condition === "brand_new" ? "Brand New" : "Pre-Owned";
}

function toPriceRange(
  values: Array<number | null | undefined>,
): PriceRange | null {
  const numeric = values
    .map((value) => (typeof value === "number" ? value : null))
    .filter((value): value is number => value !== null);
  if (!numeric.length) {
    return null;
  }
  return {
    min: Math.min(...numeric),
    max: Math.max(...numeric),
  };
}

function selectFlagshipCondition(
  summaries: CatalogConditionSummary[],
  preferred?: ConditionKey,
): CatalogConditionSummary | null {
  if (preferred) {
    const preferredMatch = summaries.find(
      (summary) =>
        summary.condition === preferred && summary.basePrice !== null,
    );
    if (preferredMatch) return preferredMatch;
  }

  for (const preference of CONDITION_PREFERENCE) {
    const candidate = summaries.find(
      (summary) =>
        summary.condition === preference && summary.basePrice !== null,
    );
    if (candidate) return candidate;
  }

  return summaries.find((summary) => summary.basePrice !== null) || null;
}

function normalizeQuery(query: string): string {
  return tokenize(query).join(" ");
}

interface QueryIntent {
  preferCondition?: ConditionKey;
  includesGen1: boolean;
  includesGen2: boolean;
  includesSwitch1: boolean;
  includesSwitch2: boolean;
  includesLite: boolean;
  includesBundle: boolean;
  includesOled: boolean;
  includesLcd: boolean;
}

function deriveQueryIntent(rawQuery: string): QueryIntent {
  const lower = rawQuery.toLowerCase();
  const preferPreOwned =
    /\b(pre[-\s]?owned|preowned|second[-\s]?hand|2nd[-\s]?hand|used|preloved)\b/.test(
      lower,
    );
  const preferBrandNew = /\bbrand new\b|\bnew set\b/.test(lower);

  return {
    preferCondition: preferPreOwned
      ? "pre_owned"
      : preferBrandNew
        ? "brand_new"
        : undefined,
    includesGen1:
      /\bgen\s*1\b/.test(lower) ||
      /\bv1\b/.test(lower) ||
      /\bswitch\s*(?:1|one)\b/.test(lower),
    includesGen2:
      /\bgen\s*2\b/.test(lower) ||
      /\bv2\b/.test(lower) ||
      /switch\s*gen\s*2/.test(lower),
    includesSwitch1:
      /\bswitch\s*(?:1|one)\b/.test(lower) || /\bversion\s*1\b/.test(lower),
    includesSwitch2: /\bswitch\s*(?:2|two)\b/.test(lower),
    includesLite: /\blite\b/.test(lower),
    includesBundle: /\bbundle\b|\bcombo\b|\bpack\b/.test(lower),
    includesOled: /\boled\b/.test(lower),
    includesLcd: /\blcd\b/.test(lower) || /\blcd model\b/.test(lower),
  };
}

function calculateModelBoost(
  model: FlattenedModel,
  intent: QueryIntent,
): number {
  const title = model.title.toLowerCase();
  let boost = 0;

  if (intent.includesSwitch2) {
    boost += title.includes("switch 2") ? 160 : 0;
    if (
      intent.includesSwitch2 &&
      (title.includes("gen 1") || title.includes("switch gen 1"))
    ) {
      boost -= 60;
    }
  }
  if (intent.includesSwitch1 || intent.includesGen1) {
    if (
      title.includes("gen 1") ||
      title.includes("switch gen 1") ||
      title.includes("switch 1")
    ) {
      boost += 160;
    }
    if (title.includes("switch 2")) {
      boost -= 80;
    }
  }
  if (intent.includesGen2) {
    if (title.includes("gen 2") || title.includes("switch gen 2")) {
      boost += 80;
    }
  }
  if (intent.includesLite && title.includes("lite")) {
    boost += 120;
  }
  if (intent.includesBundle) {
    // Boost products with "bundle" or "limited edition" (premium special editions)
    if (title.includes("bundle")) {
      boost += 120;
    } else if (
      title.includes("limited edition") ||
      title.includes("anniversary")
    ) {
      boost += 100; // Treat Limited Editions as bundles
    } else {
      boost -= 40;
    }
  }
  if (intent.includesOled) {
    boost += title.includes("oled") ? 80 : -20;
  }
  if (intent.includesLcd) {
    boost += title.includes("lcd") || title.includes("lite") ? 80 : -20;
  }
  if (intent.preferCondition === "pre_owned") {
    if (
      model.conditions.some((condition) => condition.condition === "pre_owned")
    ) {
      boost += 40;
    }
  } else if (intent.preferCondition === "brand_new") {
    if (
      model.conditions.some((condition) => condition.condition === "brand_new")
    ) {
      boost += 20;
    }
  }

  return boost;
}

function buildFlattenedModels(master: ProductsMasterFile): FlattenedModel[] {
  const familyRanges = new Map<string, PriceRange | null>();
  master.families.forEach((family) => {
    const range = toPriceRange(
      family.models.flatMap((model) =>
        model.conditions.map((condition) => condition.basePrice ?? null),
      ),
    );
    familyRanges.set(family.family_id, range);
  });

  const flattened: FlattenedModel[] = [];

  master.families.forEach((family) => {
    family.models.forEach((model) => {
      const aliases = unique(
        model.aliases
          .map((alias) => alias.toLowerCase().trim())
          .filter(Boolean),
      );

      const conditions: CatalogConditionSummary[] = model.conditions.map(
        (condition) => ({
          condition: condition.condition,
          label: conditionLabel(condition.condition),
          basePrice:
            typeof condition.basePrice === "number"
              ? condition.basePrice
              : null,
          instalmentTotal:
            typeof condition.instalmentTotal === "number"
              ? condition.instalmentTotal
              : null,
          bnpl: condition.bnpl ?? [],
          tradeIn: condition.tradeIn ?? null,
          soldOut: condition.soldOut ?? false,
        }),
      );

      const priceRange = toPriceRange(
        conditions.map((condition) => condition.basePrice),
      );

      const tokens = unique([
        ...tokenize(model.title),
        ...aliases.flatMap((alias) => tokenize(alias)),
        ...tokenize(family.title),
      ]);

      flattened.push({
        modelId: model.model_id,
        familyId: family.family_id,
        familyTitle: family.title,
        title: model.title,
        aliases,
        tokens,
        categories: model.categories || [],
        tags: model.tags || [],
        kind: model.kind,
        warrantyNotes: model.warranty_notes || [],
        permalink: model.source?.permalink,
        warnings: model.warnings || [],
        priceRange,
        familyRange: familyRanges.get(family.family_id) || null,
        conditions,
      });
    });
  });

  return flattened;
}

export async function getCatalogContext(): Promise<CatalogContext> {
  if (catalogContext && Date.now() - catalogContext.loadedAt < CACHE_TTL_MS) {
    return catalogContext;
  }

  const [masterRaw, aliasRaw] = await Promise.all([
    fs.readFile(PRODUCTS_MASTER_PATH, "utf8"),
    fs.readFile(ALIAS_INDEX_PATH, "utf8"),
  ]);

  const master = JSON.parse(masterRaw) as ProductsMasterFile;
  const aliasIndex = JSON.parse(aliasRaw) as AliasIndexFile;
  const models = buildFlattenedModels(master);
  const modelMap = new Map(models.map((model) => [model.modelId, model]));

  const aliasMap = new Map<string, FlattenedModel[]>();

  aliasIndex.entries.forEach((entry) => {
    const model = modelMap.get(entry.modelId);
    if (!model) return;
    const alias = entry.alias.trim().toLowerCase();
    if (!alias) return;
    const existing = aliasMap.get(alias) ?? [];
    if (!existing.includes(model)) {
      existing.push(model);
      aliasMap.set(alias, existing);
    }
  });

  models.forEach((model) => {
    model.aliases.forEach((alias) => {
      const normalized = alias.trim();
      if (!normalized) return;
      const existing = aliasMap.get(normalized) ?? [];
      if (!existing.includes(model)) {
        existing.push(model);
        aliasMap.set(normalized, existing);
      }
    });
  });

  catalogContext = {
    models,
    aliasMap,
    loadedAt: Date.now(),
  };

  return catalogContext;
}

async function loadCatalogContext(): Promise<CatalogContext> {
  return getCatalogContext();
}

export async function getCatalogModelById(
  modelId: string,
): Promise<FlattenedModel | null> {
  const { models } = await getCatalogContext();
  return models.find((model) => model.modelId === modelId) || null;
}

export async function listCatalogModels(): Promise<FlattenedModel[]> {
  const { models } = await getCatalogContext();
  return models;
}

function formatPriceLabel(
  condition: CatalogConditionSummary | null,
): string | undefined {
  if (!condition || condition.basePrice === null) return undefined;
  return `${condition.basePrice.toFixed(0)} (${condition.label})`;
}

function toCatalogMatch(
  model: FlattenedModel,
  preferredCondition?: ConditionKey,
): CatalogMatch {
  const flagshipCondition = selectFlagshipCondition(
    model.conditions,
    preferredCondition,
  );
  return {
    modelId: model.modelId,
    familyId: model.familyId,
    familyTitle: model.familyTitle,
    name: model.title,
    permalink: model.permalink,
    price: formatPriceLabel(flagshipCondition),
    priceRange: model.priceRange,
    familyRange: model.familyRange,
    conditions: model.conditions,
    flagshipCondition,
    warnings: model.warnings,
  };
}

function scoreModel(
  model: FlattenedModel,
  normalizedQuery: string,
  queryTokens: string[],
  intent: QueryIntent,
): number {
  if (!normalizedQuery) return 0;

  if (model.aliases.includes(normalizedQuery)) {
    return 200;
  }

  let score = 0;
  const matchedTokens = queryTokens.filter((token) =>
    model.tokens.includes(token),
  );
  if (matchedTokens.length) {
    score += matchedTokens.length * 30;
  }

  if (model.title.toLowerCase().includes(normalizedQuery)) {
    score += 40;
  }

  const aliasContains = model.aliases.find(
    (alias) =>
      alias.includes(normalizedQuery) || normalizedQuery.includes(alias),
  );
  if (aliasContains) {
    score += 35;
  }

  const distance = levenshteinDistance(
    normalizedQuery,
    model.title.toLowerCase(),
  );
  score += Math.max(0, 40 - distance * 4);

  return score + calculateModelBoost(model, intent);
}

export async function findCatalogMatches(
  query: string,
  limit = 3,
): Promise<CatalogMatch[]> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const intent = deriveQueryIntent(query);
  const queryTokens = tokenize(normalizedQuery);
  const { models, aliasMap } = await loadCatalogContext();

  // Domain filters to cut noise (tablets, games, coolers, etc.)
  const wantsTablet = /\b(tab|tablet)\b/i.test(query);
  const wantsSamsung = /\bgalaxy|samsung\b/i.test(query);
  const wantsGame = /(ps[45]|playstation|xbox|switch|nintendo|game)\b/i.test(query) || /aladdin|aladin/i.test(query);
  const wantsCooler = /cooler|heatsink|aio|liquid\s*cool/i.test(query);

  const filteredModels = models.filter((model) => {
    const categories = (model.categories || []).map((c) => c.toLowerCase());
    const brand = (model.brand || "").toLowerCase();

    if (wantsTablet) {
      if (!categories.some((c) => c.includes("tablet"))) return false;
      if (wantsSamsung && brand && brand !== "samsung") return false;
    }

    if (wantsGame) {
      const isGame = categories.some((c) => c.includes("game"));
      if (!isGame) return false;
      // platform hints
      if (/switch|nintendo/i.test(query)) return categories.some((c) => c.includes("switch"));
      if (/ps5|playstation 5|ps 5/i.test(query)) return categories.some((c) => c.includes("ps5"));
      if (/ps4|playstation 4|ps 4/i.test(query)) return categories.some((c) => c.includes("ps4"));
      if (/xbox/i.test(query)) return categories.some((c) => c.includes("xbox"));
    }

    if (wantsCooler) {
      if (!categories.some((c) => c.includes("cooler") || c.includes("thermal"))) return false;
    }

    return true;
  });

  // Detect product family keywords in query
  const familyKeywords = [
    {
      pattern: /\b(ps5|playstation\s*5|playstation5)\b/i,
      family: "playstation_5",
    },
    {
      pattern: /\b(ps4|playstation\s*4|playstation4)\b/i,
      family: "playstation_4",
    },
    {
      pattern: /\b(xbox\s*series|xsx|xss|series\s*x|series\s*s)\b/i,
      family: "xbox_series",
    },
    { pattern: /\b(switch|nintendo\s*switch)\b/i, family: "nintendo_switch" },
    {
      pattern: /\b(steam\s*deck|rog\s*ally|ally|legion|claw)\b/i,
      family: "handheld_pc",
    },
    { pattern: /\b(quest|psvr|vr)\b/i, family: "vr_wearables" },
  ];

  let detectedFamily: string | null = null;
  for (const { pattern, family } of familyKeywords) {
    if (pattern.test(query)) {
      detectedFamily = family;
      break;
    }
  }

  const aliasCandidates = aliasMap.get(normalizedQuery);
  const pool =
    aliasCandidates && aliasCandidates.length > 0
      ? aliasCandidates
      : filteredModels.length > 0
        ? filteredModels
        : models;

  const scored = pool
    .map((model) => ({
      model,
      score: aliasCandidates
        ? 250 +
          (selectFlagshipCondition(model.conditions, intent.preferCondition)
            ?.basePrice ?? 0) /
            1000
        : scoreModel(model, normalizedQuery, queryTokens, intent),
    }))
    .filter(({ score, model }) => {
      // Filter out zero-score matches
      if (score <= 0) return false;

      // If a specific product family was detected in query, only show products from that family
      if (detectedFamily && queryTokens.length > 1) {
        return model.familyId === detectedFamily;
      }

      return true;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aPrice =
        selectFlagshipCondition(a.model.conditions, intent.preferCondition)
          ?.basePrice ?? 0;
      const bPrice =
        selectFlagshipCondition(b.model.conditions, intent.preferCondition)
          ?.basePrice ?? 0;
      return bPrice - aPrice;
    });

  return scored
    .slice(0, limit)
    .map(({ model }) => toCatalogMatch(model, intent.preferCondition));
}

export async function findClosestMatch(query: string): Promise<string | null> {
  const normalized = normalizeQuery(query);
  if (!normalized) return null;

  const { models } = await loadCatalogContext();
  let best: { model: FlattenedModel; distance: number } | null = null;

  models.forEach((model) => {
    const distances = [
      levenshteinDistance(normalized, model.title.toLowerCase()),
      ...model.aliases.map((alias) =>
        levenshteinDistance(normalized, alias.toLowerCase()),
      ),
    ];
    const minDistance = Math.min(...distances);
    if (!best || minDistance < best.distance) {
      best = { model, distance: minDistance };
    }
  });

  return best ? best.model.title : null;
}

function levenshteinDistance(a: string, b: string): number {
  const matrix = Array.from({ length: b.length + 1 }, () =>
    Array(a.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i += 1) {
    matrix[0][i] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= b.length; j += 1) {
    for (let i = 1; i <= a.length; i += 1) {
      const indicator = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator,
      );
    }
  }

  return matrix[b.length][a.length];
}
