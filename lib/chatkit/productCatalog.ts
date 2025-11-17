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

interface FlattenedModel {
  modelId: string;
  familyId: string;
  familyTitle: string;
  title: string;
  aliases: string[];
  tokens: string[];
  permalink?: string;
  warnings?: string[];
  priceRange: PriceRange | null;
  familyRange: PriceRange | null;
  conditions: CatalogConditionSummary[];
  flagshipCondition: CatalogConditionSummary | null;
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
): CatalogConditionSummary | null {
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

      const flagshipCondition = selectFlagshipCondition(conditions);

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
        permalink: model.source?.permalink,
        warnings: model.warnings || [],
        priceRange,
        familyRange: familyRanges.get(family.family_id) || null,
        conditions,
        flagshipCondition,
      });
    });
  });

  return flattened;
}

async function loadCatalogContext(): Promise<CatalogContext> {
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

function formatPriceLabel(
  condition: CatalogConditionSummary | null,
): string | undefined {
  if (!condition || condition.basePrice === null) return undefined;
  return `${condition.basePrice.toFixed(0)} (${condition.label})`;
}

function toCatalogMatch(model: FlattenedModel): CatalogMatch {
  return {
    modelId: model.modelId,
    familyId: model.familyId,
    familyTitle: model.familyTitle,
    name: model.title,
    permalink: model.permalink,
    price: formatPriceLabel(model.flagshipCondition),
    priceRange: model.priceRange,
    familyRange: model.familyRange,
    conditions: model.conditions,
    flagshipCondition: model.flagshipCondition,
    warnings: model.warnings,
  };
}

function scoreModel(
  model: FlattenedModel,
  normalizedQuery: string,
  queryTokens: string[],
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

  return score;
}

export async function findCatalogMatches(
  query: string,
  limit = 3,
): Promise<CatalogMatch[]> {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return [];

  const queryTokens = tokenize(normalizedQuery);
  const { models, aliasMap } = await loadCatalogContext();

  const aliasCandidates = aliasMap.get(normalizedQuery);
  const pool =
    aliasCandidates && aliasCandidates.length > 0 ? aliasCandidates : models;

  const scored = pool
    .map((model) => ({
      model,
      score: aliasCandidates
        ? 250 + (model.flagshipCondition?.basePrice ?? 0) / 1000
        : scoreModel(model, normalizedQuery, queryTokens),
    }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aPrice = a.model.flagshipCondition?.basePrice ?? 0;
      const bPrice = b.model.flagshipCondition?.basePrice ?? 0;
      return bPrice - aPrice;
    });

  return scored.slice(0, limit).map(({ model }) => toCatalogMatch(model));
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
