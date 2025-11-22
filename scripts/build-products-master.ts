import path from "node:path";
import { promises as fs } from "node:fs";
import he from "he";
import { parse as parseCsv } from "csv-parse/sync";

type ConditionKey = "brand_new" | "pre_owned";

interface CatalogProduct {
  id: number;
  name?: string;
  permalink?: string;
  stock_status?: string;
  short_description?: string;
  description?: string;
  categories?: Array<{ name?: string }>;
}

interface PriceFragment {
  condition: ConditionKey | null;
  price: number | null;
  instalment: number | null;
  soldOut: boolean;
  raw: string;
}

interface VariantDraft {
  title: string;
  sourceProduct: CatalogProduct;
  data: Partial<Record<ConditionKey, PriceFragment>>;
  notes: string[];
  platform?: string | null;
}

interface TradeEntry {
  productFamily?: string;
  productModel?: string;
  variant?: string | null;
  condition: ConditionKey;
  tradeMin?: number | null;
  tradeMax?: number | null;
  brandNewPrice?: number | null;
  source: string;
}

type ModelKind =
  | "product"
  | "bundle"
  | "accessory"
  | "warranty"
  | "service"
  | "game"
  | "misc";

interface NormalizedModel {
  familyId: string;
  modelId: string;
  title: string;
  bundle?: string | null;
  region?: string | null;
  storage?: string | null;
  options: {
    region?: string | null;
    storage?: string | null;
    bundle?: string | null;
    platform?: string | null;
  };
  aliases: string[];
  source: {
    productId: number;
    productName?: string;
    permalink?: string;
  };
  conditions: ProductCondition[];
  lookupTokens: string[];
  warnings: string[];
  categories: string[];
  tags: string[];
  kind: ModelKind;
  warrantyNotes: string[];
}

interface ProductCondition {
  condition: ConditionKey;
  basePrice: number | null;
  instalmentTotal: number | null;
  observedInstalment: number | null;
  instalmentFactor: number;
  observedFactor: number | null;
  factorDelta: number | null;
  bnpl: Array<{
    providerId: string;
    providerName: string;
    months: number;
    monthly: number;
  }>;
  tradeIn?: {
    min?: number | null;
    max?: number | null;
  };
  soldOut: boolean;
}

interface FamilyRecord {
  familyId: string;
  title: string;
  instalmentFactor: number;
  bnplProviders: typeof BNPL_PROVIDERS;
  models: NormalizedModel[];
  warranties: Partial<Record<ConditionKey, string>>;
}

const DEFAULT_INSTALLMENT_FACTOR = 1.055;

const OUTPUT_DIR = path.join("data", "catalog");

const BNPL_PROVIDERS = [
  { id: "atome", name: "Atome", months: [3] },
  { id: "spay_later", name: "SPay Later", months: [6] },
  { id: "grabpay_later", name: "GrabPay Later", months: [4] },
] as const;

const FAMILY_RULES: Array<{
  id: string;
  title: string;
  keywords: string[];
  instalmentFactor?: number;
  defaultWarranties?: Partial<Record<ConditionKey, string>>;
}> = [
  {
    id: "nintendo_switch",
    title: "Nintendo Switch",
    keywords: ["switch"],
    defaultWarranties: {
      brand_new: "12 Months Store Warranty",
      pre_owned: "1 Month Store Warranty",
    },
  },
  {
    id: "playstation_5",
    title: "PlayStation 5",
    keywords: ["ps5", "playstation 5"],
  },
  {
    id: "playstation_4",
    title: "PlayStation 4",
    keywords: ["ps4", "playstation 4"],
    defaultWarranties: {
      pre_owned: "1 Month Store Warranty",
    },
  },
  {
    id: "xbox_series",
    title: "Xbox Series",
    keywords: ["xbox series", "xbox"],
  },
  {
    id: "handheld_pc",
    title: "Handheld PCs",
    keywords: [
      "steam deck",
      "rog ally",
      "ally",
      "legion",
      "claw",
      "ayaneo",
      "portal",
    ],
  },
  {
    id: "vr_wearables",
    title: "VR & Wearables",
    keywords: ["quest", "vr", "psvr", "glass", "osmo"],
  },
  {
    id: "games_playstation",
    title: "PlayStation Games",
    keywords: [],
  },
  {
    id: "games_xbox",
    title: "Xbox Games",
    keywords: [],
  },
  {
    id: "games_switch",
    title: "Nintendo Switch Games",
    keywords: [],
  },
  {
    id: "games_pc",
    title: "PC Games",
    keywords: [],
  },
  {
    id: "games_multi",
    title: "Other Games",
    keywords: [],
  },
  {
    id: "phones",
    title: "Mobile Phones",
    keywords: [
      "iphone",
      "samsung galaxy",
      "google pixel",
      "oppo",
      "smartphone",
      "mobile phone",
    ],
  },
  {
    id: "tablets",
    title: "Tablets",
    keywords: ["ipad", "galaxy tab", "tablet"],
  },
  {
    id: "misc",
    title: "Other Catalog Items",
    keywords: [],
  },
];

const FAMILY_BY_KEYWORD = FAMILY_RULES.flatMap((family) =>
  family.keywords.map((kw) => ({ keyword: kw, familyId: family.id })),
);

const FAMILY_LOOKUP = new Map(FAMILY_RULES.map((f) => [f.id, f]));

const BRAND_STOP_WORDS = [
  "nintendo",
  "playstation",
  "sony",
  "microsoft",
  "xbox",
  "meta",
  "asus",
  "lenovo",
  "msi",
  "dji",
  "gigabyte",
  "ayaneo",
  "oakley",
  "rayban",
  "ray-ban",
  "pico",
  "steam",
  "quest",
  "ally",
];

const BRAND_STOP_REGEX = new RegExp(
  `\\b(${BRAND_STOP_WORDS.join("|")})\\b`,
  "gi",
);

const ACCESSORY_KEYWORDS = [
  "accessory",
  "accessories",
  "controller",
  "headset",
  "earbuds",
  "charger",
  "dock",
  "case",
  "stand",
];

const WARRANTY_KEYWORDS = ["warranty", "protection", "care plan", "accidental"];
const SERVICE_KEYWORDS = [
  "install",
  "setup",
  "repair",
  "inspection",
  "service",
];
const PROMO_KEYWORDS = [
  "bundle",
  "promo",
  "promotion",
  "deal",
  "pack",
  "combo",
];

const STOP_VARIANT_PREFIXES = [
  /^⭐/i,
  /^🌟/i,
  /^🟡/i,
  /^🟠/i,
  /^🟢/i,
  /^⚫/i,
  /^⚪/i,
  /^additional/i,
  /^comes with/i,
  /^order yours/i,
  /^wide selection/i,
  /^brand new sets/i,
  /^pre[- ]?owned sets/i,
  /^able to extend/i,
  /^singapore/i,
  /^store/i,
];

const SECTION_HEADINGS = [
  "oled model",
  "lcd model",
  "disc",
  "digital",
  "camera",
  "handheld console",
];

function toAscii(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function htmlToPlainText(input?: string): string {
  if (!input) return "";
  const decoded = he
    .decode(
      input
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<li>/gi, "\n")
        .replace(/<[^>]+>/g, ""),
    )
    .replace(/\r/g, "");
  return decoded
    .split("\n")
    .map((line) => toAscii(line))
    .join("\n");
}

function normalizeLine(line: string): string {
  let normalized = toAscii(line);
  normalized = normalized.replace(/^[0-9]+[.)]?\s*/, "");
  normalized = normalized.replace(/^[\s-]+/, "");
  return normalized.trim();
}

function looksLikeVariant(line: string): boolean {
  if (!line) return false;
  const lower = line.toLowerCase();
  if (STOP_VARIANT_PREFIXES.some((re) => re.test(lower))) return false;
  if (SECTION_HEADINGS.includes(lower)) return false;
  if (
    lower.startsWith("atome") ||
    lower.startsWith("spay") ||
    lower.startsWith("grabpay")
  ) {
    return false;
  }
  if (
    lower.includes("instalment") &&
    !lower.includes("new") &&
    !lower.includes("pre") &&
    !line.includes("=")
  ) {
    return false;
  }
  if (!/[a-z]/i.test(line)) return false;
  return /switch|ps5|ps4|xbox|steam|rog|ally|quest|portal|legion|claw|osmo|camera/i.test(
    line,
  );
}

function collectCategories(product: CatalogProduct): string[] {
  const categories = new Set<string>();
  (product.categories ?? []).forEach((category) => {
    if (!category?.name) return;
    const normalized = toAscii(category.name).toLowerCase();
    if (normalized) {
      categories.add(normalized);
    }
  });
  return Array.from(categories);
}

function classifyModelKind(
  familyId: string,
  title: string,
  categories: string[],
  bundle?: string | null,
): ModelKind {
  const lower = title.toLowerCase();
  const matchesKeyword = (keywords: string[]) =>
    keywords.some(
      (keyword) =>
        lower.includes(keyword) ||
        categories.some((category) => category.includes(keyword)),
    );

  if (matchesKeyword(WARRANTY_KEYWORDS)) return "warranty";
  if (matchesKeyword(SERVICE_KEYWORDS)) return "service";
  if (matchesKeyword(ACCESSORY_KEYWORDS)) return "accessory";
  if (matchesKeyword(["game"])) return "game";

  const isBundle =
    Boolean(bundle) ||
    matchesKeyword(PROMO_KEYWORDS) ||
    categories.some((category) => category.includes("bundle"));
  if (isBundle) return "bundle";

  return familyId === "misc" ? "misc" : "product";
}

function buildGraphTags(params: {
  familyId: string;
  kind: ModelKind;
  categories: string[];
  bundle?: string | null;
  storage?: string | null;
  platform?: string | null;
}): string[] {
  const tags = new Set<string>();
  tags.add(`family:${params.familyId}`);
  tags.add(`kind:${params.kind}`);
  if (params.bundle) tags.add("has_bundle");
  if (params.storage) tags.add(`storage:${params.storage.toLowerCase()}`);
  if (params.platform)
    tags.add(`platform:${params.platform.toLowerCase().replace(/\s+/g, "_")}`);
  if (!params.categories.length) {
    tags.add("category:unspecified");
  }
  params.categories.forEach((category) => {
    tags.add(`category:${category.replace(/\s+/g, "_")}`);
  });
  return Array.from(tags);
}

function parsePriceFragments(
  line: string,
  fallbackCondition: ConditionKey | null,
): PriceFragment[] {
  const fragments: PriceFragment[] = [];
  const labelledPattern =
    /(new|brand new|pre[-\s]?owned|preowned)[^$]*\$([0-9,]+(?:\.[0-9]+)?)(?:[^$]*?(?:instalment|installment)\s*\$([0-9,]+(?:\.[0-9]+)?))?/gi;

  let match: RegExpExecArray | null;
  while ((match = labelledPattern.exec(line)) !== null) {
    const [, label, priceRaw, instalmentRaw] = match;
    const condition =
      label.toLowerCase().includes("pre") &&
      !label.toLowerCase().includes("new")
        ? "pre_owned"
        : "brand_new";
    fragments.push({
      condition,
      price: parseMoney(priceRaw),
      instalment: instalmentRaw ? parseMoney(instalmentRaw) : null,
      soldOut: /sold\s*out/i.test(line),
      raw: line,
    });
  }

  if (!fragments.length) {
    const soldOut = /sold\s*out/i.test(line);
    const eqMatch = line.match(/=\s*\$([0-9,]+(?:\.[0-9]+)?)/i);
    if (eqMatch || soldOut) {
      fragments.push({
        condition: fallbackCondition,
        price: eqMatch ? parseMoney(eqMatch[1]) : null,
        instalment: parseInstalment(line),
        soldOut,
        raw: line,
      });
    }
  }

  return fragments;
}

function parseMoney(value?: string | null): number | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  return parseFloat(cleaned);
}

function parseInstalment(line: string): number | null {
  const match = line.match(/instal?ment[^$]*\$([0-9,]+(?:\.[0-9]+)?)/i);
  if (!match) return null;
  return parseMoney(match[1]);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function determineFamily(value: string): string {
  const lower = value.toLowerCase();
  let bestMatch: { familyId: string; score: number } | null = null;
  FAMILY_BY_KEYWORD.forEach(({ keyword, familyId }) => {
    if (lower.includes(keyword)) {
      const score = keyword.length;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { familyId, score };
      }
    }
  });
  return bestMatch ? bestMatch.familyId : "misc";
}

const GAME_FAMILY_RULES = [
  {
    familyId: "games_playstation",
    platform: "PlayStation",
    keywords: ["ps5", "playstation 5", "ps4", "playstation 4"],
  },
  {
    familyId: "games_xbox",
    platform: "Xbox",
    keywords: ["xbox", "series x", "series s"],
  },
  {
    familyId: "games_switch",
    platform: "Nintendo Switch",
    keywords: ["switch"],
  },
  {
    familyId: "games_pc",
    platform: "PC",
    keywords: ["pc", "steam"],
  },
];

function detectGameFamily(
  product: CatalogProduct,
  title: string,
): { familyId: string; platform?: string } | null {
  const categoryNames = (product.categories ?? [])
    .map((category) => category.name?.toLowerCase() ?? "")
    .filter(Boolean);
  const lowerTitle = title.toLowerCase();
  const isGameCategory = categoryNames.some((name) => name.includes("game"));
  if (!isGameCategory && !lowerTitle.includes("game")) {
    return null;
  }

  for (const rule of GAME_FAMILY_RULES) {
    if (
      rule.keywords.some(
        (keyword) =>
          lowerTitle.includes(keyword) ||
          categoryNames.some((name) => name.includes(keyword)),
      )
    ) {
      return { familyId: rule.familyId, platform: rule.platform };
    }
  }

  return { familyId: "games_multi" };
}

function extractRegion(line: string): string | null {
  const lower = line.toLowerCase();
  if (lower.includes("singapore") || lower.includes("sg")) return "Singapore";
  if (lower.includes("japan") || lower.includes("jp")) return "Japan";
  if (lower.includes("us") || lower.includes("usa")) return "USA";
  return null;
}

function extractBundle(line: string): string | null {
  if (!line.includes("+")) return null;
  const parts = line.split("+");
  if (parts.length < 2) return null;
  return parts
    .slice(1)
    .join("+")
    .replace(/bundle/i, "Bundle")
    .trim();
}

function extractStorage(line: string): string | null {
  const match = line.match(/([0-9]+)\s*(TB|GB)/i);
  if (!match) return null;
  return `${match[1]}${match[2].toUpperCase()}`;
}

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

async function loadJsonlTradeEntries(filePath: string): Promise<TradeEntry[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const entries: TradeEntry[] = [];
  raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      try {
        const parsed = JSON.parse(line);
        const metadata = parsed.metadata ?? {};
        if (!metadata.product_model) return;
        entries.push({
          productFamily: metadata.product_family,
          productModel: metadata.product_model,
          variant: metadata.variant ?? null,
          condition:
            metadata.condition === "brand_new" ? "brand_new" : "pre_owned",
          tradeMin: metadata.trade_in_value_min_sgd ?? null,
          tradeMax: metadata.trade_in_value_max_sgd ?? null,
          brandNewPrice: metadata.brand_new_price_sgd ?? null,
          source: metadata.price_grid_version ?? "trade_grid_jsonl",
        });
      } catch {
        // ignore malformed line
      }
    });
  return entries;
}

async function loadCsvTradeEntries(filePath: string): Promise<TradeEntry[]> {
  const raw = await fs.readFile(filePath, "utf8");
  const rows = parseCsv(raw, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Array<Record<string, string>>;
  return rows.map((row) => ({
    productFamily: row.product_family,
    productModel: row.product_model,
    variant: row.variant || null,
    condition: row.condition === "brand_new" ? "brand_new" : "pre_owned",
    tradeMin: parseMoney(row.trade_in_value_min_sgd),
    tradeMax: parseMoney(row.trade_in_value_max_sgd),
    brandNewPrice: parseMoney(row.brand_new_price_sgd),
    source: row.source || "trade_grid_csv",
  }));
}

function buildVariantDrafts(products: CatalogProduct[]): VariantDraft[] {
  const variants: VariantDraft[] = [];

  products.forEach((product) => {
    const text = htmlToPlainText(
      product.short_description || product.description,
    );
    if (!text) {
      const fallbackPrice = parseMoney((product as any).price);
      if (fallbackPrice !== null) {
        const soldOut =
          (product.stock_status || "").toLowerCase() === "outofstock";
        variants.push({
          title: product.name ? `${product.name}` : `Product ${product.id}`,
          sourceProduct: product,
          data: {
            brand_new: {
              condition: "brand_new",
              price: fallbackPrice,
              instalment: null,
              soldOut,
              raw: `price:${fallbackPrice}`,
            },
          },
          notes: [],
        });
      }
      return;
    }
    const lines = text
      .split("\n")
      .map((line) => normalizeLine(line))
      .filter(Boolean);

    const defaultCondition = product.name?.toLowerCase().includes("pre-owned")
      ? "pre_owned"
      : product.name?.toLowerCase().includes("brand new")
        ? "brand_new"
        : null;

    let currentVariant: VariantDraft | null = null;
    lines.forEach((line) => {
      const fragments = parsePriceFragments(line, defaultCondition);
      const variantLine = looksLikeVariant(line) ? line : null;

      if (variantLine) {
        currentVariant = {
          title: variantLine,
          sourceProduct: product,
          data: {},
          notes: [],
        };
        variants.push(currentVariant);
      }

      if (fragments.length) {
        if (!currentVariant) {
          currentVariant = {
            title: product.name ? `${product.name} Option` : "Unknown Variant",
            sourceProduct: product,
            data: {},
            notes: [],
          };
          variants.push(currentVariant);
        }

        fragments.forEach((fragment) => {
          const condition = fragment.condition ?? defaultCondition;
          if (!condition) return;
          currentVariant!.data[condition] = fragment;
        });
      } else if (line.toLowerCase().includes("warranty") && currentVariant) {
        currentVariant.notes.push(line);
      }
    });
  });

  return variants;
}

function stripPriceFromTitle(title: string): string {
  let result = title.replace(/\s+new:\s*\$[0-9,]+.*$/i, "");
  result = result.replace(/\s+pre[-\s]?owned:\s*\$[0-9,]+.*$/i, "");
  result = result.replace(/\s*=\s*\$[0-9,]+.*$/i, "");
  return result.trim();
}

function createModelFromVariant(variant: VariantDraft): NormalizedModel | null {
  const title = variant.title;
  const asciiTitle = stripPriceFromTitle(toAscii(title));
  if (!asciiTitle) return null;

  const categories = collectCategories(variant.sourceProduct);

  const detectedGameFamily = detectGameFamily(
    variant.sourceProduct,
    asciiTitle || variant.sourceProduct.name || "",
  );

  const familyId =
    detectedGameFamily?.familyId ||
    determineFamily(asciiTitle || variant.sourceProduct.name || "") ||
    "misc";
  const modelSlug = slugify(asciiTitle);
  const modelId = `${familyId}-${modelSlug}`;
  const region = extractRegion(asciiTitle);
  const bundle = extractBundle(asciiTitle);
  const storage = extractStorage(asciiTitle);
  const platform =
    detectedGameFamily?.platform || detectPlatform(asciiTitle) || null;

  const kind = classifyModelKind(familyId, asciiTitle, categories, bundle);
  const tags = buildGraphTags({
    familyId,
    kind,
    categories,
    bundle,
    storage,
    platform,
  });
  const warrantyNotes = variant.notes.filter((note) =>
    /warranty|guarantee|protection|care plan/i.test(note.toLowerCase()),
  );

  const baseAlias = asciiTitle.toLowerCase();
  const noDescriptors = baseAlias
    .replace(/\b(console|bundle|edition|set)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const brandless = baseAlias
    .replace(BRAND_STOP_REGEX, "")
    .replace(/\s+/g, " ")
    .trim();

  const brandlessNoDescriptors = brandless
    ? brandless
        .replace(/\b(console|bundle|edition|set)\b/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;

  const aliases = unique(
    [
      baseAlias,
      noDescriptors,
      brandless,
      brandlessNoDescriptors,
      storage ? baseAlias.replace(storage.toLowerCase(), "").trim() : null,
    ].filter(Boolean) as string[],
  );

  const lookupTokens = unique([
    ...tokenize(asciiTitle),
    ...(bundle ? tokenize(bundle) : []),
    ...(variant.sourceProduct.name ? tokenize(variant.sourceProduct.name) : []),
  ]);

  const warnings: string[] = [];

  const conditions: ProductCondition[] = (
    ["brand_new", "pre_owned"] as ConditionKey[]
  )
    .map((condition) => {
      const fragment = variant.data[condition];
      if (!fragment) return null;
      const family = FAMILY_LOOKUP.get(familyId);
      const factor = family?.instalmentFactor ?? DEFAULT_INSTALLMENT_FACTOR;
      const basePrice = fragment.price;
      const observedInstalment = fragment.instalment;
      const instalmentTotal =
        typeof basePrice === "number"
          ? roundCurrency(basePrice * factor)
          : null;
      const observedFactor =
        basePrice && observedInstalment ? observedInstalment / basePrice : null;
      const factorDelta =
        observedFactor && typeof observedFactor === "number"
          ? observedFactor - factor
          : null;
      const bnplTotal = instalmentTotal ?? observedInstalment ?? null;
      const bnpl =
        bnplTotal && basePrice
          ? BNPL_PROVIDERS.flatMap((provider) =>
              provider.months.map((months) => ({
                providerId: provider.id,
                providerName: provider.name,
                months,
                monthly: roundCurrency(bnplTotal / months),
              })),
            )
          : [];

      if (
        observedFactor &&
        (observedFactor < 1.04 || observedFactor > 1.07) &&
        typeof basePrice === "number"
      ) {
        warnings.push(
          `${condition} factor ${observedFactor.toFixed(3)} deviates from ${factor.toFixed(3)}`,
        );
      }

      return {
        condition,
        basePrice: basePrice ?? null,
        instalmentTotal,
        observedInstalment: observedInstalment ?? null,
        instalmentFactor: factor,
        observedFactor: observedFactor ?? null,
        factorDelta: factorDelta ?? null,
        bnpl,
        tradeIn: undefined,
        soldOut: fragment.soldOut,
      };
    })
    .filter((entry): entry is ProductCondition => entry !== null);

  if (!conditions.length) return null;

  return {
    familyId,
    modelId,
    title: asciiTitle,
    bundle,
    region,
    storage,
    options: {
      region,
      storage,
      bundle,
      platform,
    },
    aliases,
    source: {
      productId: variant.sourceProduct.id,
      productName: variant.sourceProduct.name,
      permalink: variant.sourceProduct.permalink,
    },
    conditions,
    lookupTokens,
    warnings: unique([...warnings, ...variant.notes]),
    categories,
    tags,
    kind,
    warrantyNotes,
  };
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function mapTradeFamily(model: string, family?: string): string {
  const lower = `${family ?? ""} ${model ?? ""}`.toLowerCase();
  if (lower.includes("switch")) return "nintendo_switch";
  if (lower.includes("ps5") || lower.includes("playstation 5"))
    return "playstation_5";
  if (lower.includes("ps4") || lower.includes("playstation 4"))
    return "playstation_4";
  if (lower.includes("xbox")) return "xbox_series";
  if (
    lower.includes("steam deck") ||
    lower.includes("ally") ||
    lower.includes("legion") ||
    lower.includes("claw")
  ) {
    return "handheld_pc";
  }
  if (
    lower.includes("quest") ||
    lower.includes("vr") ||
    lower.includes("portal")
  ) {
    return "vr_wearables";
  }
  if (lower.includes("game")) {
    if (lower.includes("ps5") || lower.includes("playstation 5")) {
      return "games_playstation";
    }
    if (lower.includes("ps4") || lower.includes("playstation 4")) {
      return "games_playstation";
    }
    if (lower.includes("xbox")) {
      return "games_xbox";
    }
    if (lower.includes("switch")) {
      return "games_switch";
    }
    if (lower.includes("pc")) {
      return "games_pc";
    }
    return "games_multi";
  }
  return "misc";
}

function detectPlatform(input: string): string | null {
  const lower = input.toLowerCase();
  if (lower.includes("ps5") || lower.includes("playstation 5")) return "PS5";
  if (lower.includes("ps4") || lower.includes("playstation 4")) return "PS4";
  if (lower.includes("xbox")) return "Xbox";
  if (lower.includes("switch")) return "Nintendo Switch";
  if (lower.includes("pc")) return "PC";
  return null;
}

function matchTradeEntryToModel(
  entry: TradeEntry,
  models: NormalizedModel[],
): NormalizedModel | null {
  const targetFamily = mapTradeFamily(
    entry.productModel ?? "",
    entry.productFamily,
  );
  const candidateModels = models.filter(
    (model) => model.familyId === targetFamily,
  );
  const entryTokens = unique(
    tokenize(`${entry.productModel ?? ""} ${entry.variant ?? ""}`),
  );

  let best: { model: NormalizedModel; score: number } | null = null;

  candidateModels.forEach((model) => {
    const intersect = model.lookupTokens.filter((token) =>
      entryTokens.includes(token),
    );
    const score =
      entryTokens.length > 0 ? intersect.length / entryTokens.length : 0;
    if (score > 0 && (!best || score > best.score)) {
      best = { model, score };
    }
  });

  if (best && best.score >= 0.45) {
    return best.model;
  }

  return null;
}

function attachTradeData(
  models: NormalizedModel[],
  tradeEntries: TradeEntry[],
  validation: ValidationReport,
) {
  const unmatched: TradeEntry[] = [];
  tradeEntries.forEach((entry) => {
    const model = matchTradeEntryToModel(entry, models);
    if (!model) {
      unmatched.push(entry);
      return;
    }
    const condition = entry.condition;
    const target = model.conditions.find((c) => c.condition === condition);
    if (!target) {
      unmatched.push(entry);
      return;
    }
    target.tradeIn = {
      min: entry.tradeMin ?? null,
      max: entry.tradeMax ?? entry.tradeMin ?? null,
    };
  });

  validation.unmatchedTradeEntries = unmatched;
  validation.modelsWithoutTrade = models
    .filter(
      (model) =>
        !model.conditions.some(
          (c) => c.tradeIn && (c.tradeIn.min ?? c.tradeIn.max ?? null) !== null,
        ),
    )
    .map((model) => ({ modelId: model.modelId, title: model.title }));
}

interface AliasEntry {
  alias: string;
  modelId: string;
  familyId: string;
}

function buildAliasIndex(
  models: NormalizedModel[],
  synonyms: Record<string, string[]>,
) {
  const aliasEntries: AliasEntry[] = [];
  const aliasSet = new Set<string>();

  models.forEach((model) => {
    model.aliases.forEach((alias) => {
      const key = `${alias}::${model.modelId}`;
      if (aliasSet.has(key)) return;
      aliasSet.add(key);
      aliasEntries.push({
        alias,
        modelId: model.modelId,
        familyId: model.familyId,
      });
    });
  });

  Object.entries(synonyms).forEach(([canonical, list]) => {
    const normalizedCanonical = canonical.toLowerCase();
    const targetModel =
      models.find((model) => model.aliases.includes(normalizedCanonical)) ??
      models.find((model) =>
        model.title.toLowerCase().includes(normalizedCanonical),
      );
    if (!targetModel) return;
    list.forEach((alias) => {
      const normalizedAlias = alias.toLowerCase();
      const key = `${normalizedAlias}::${targetModel.modelId}`;
      if (aliasSet.has(key)) return;
      aliasSet.add(key);
      aliasEntries.push({
        alias: normalizedAlias,
        modelId: targetModel.modelId,
        familyId: targetModel.familyId,
      });
    });
  });

  return {
    generated_at: new Date().toISOString(),
    entries: aliasEntries.sort((a, b) => a.alias.localeCompare(b.alias)),
  };
}

interface ValidationReport {
  generated_at: string;
  variant_count: number;
  model_count: number;
  families: Record<
    string,
    {
      models: number;
      priceRange: [number, number] | null;
      warnings: string[];
    }
  >;
  factorOutliers: Array<{
    modelId: string;
    condition: ConditionKey;
    observedFactor: number;
    message: string;
  }>;
  unmatchedTradeEntries: TradeEntry[];
  modelsWithoutTrade: Array<{ modelId: string; title: string }>;
  missingWooProducts: Array<{ productId: number; name: string }>;
}

async function main() {
  const root = process.cwd();
  const wooPath = path.join(
    root,
    "public",
    "tradezone-WooCommerce-Products.json",
  );
  const tradeJsonlPath = path.join(root, "data", "tradezone_price_grid.jsonl");
  const tradeCsvPath = path.join(root, "Tradezone Price Grid Nov 12 2025.csv");
  const synonymsPath = path.join(root, "data", "tradein_synonyms.json");

  const [wooRaw, tradeJsonl, tradeCsv, synonymsRaw] = await Promise.all([
    fs.readFile(wooPath, "utf8"),
    loadJsonlTradeEntries(tradeJsonlPath),
    loadCsvTradeEntries(tradeCsvPath),
    fs.readFile(synonymsPath, "utf8"),
  ]);

  const wooProducts = JSON.parse(wooRaw) as CatalogProduct[];
  const variants = buildVariantDrafts(wooProducts);
  const models = variants
    .map((variant) => createModelFromVariant(variant))
    .filter((model): model is NormalizedModel => model !== null);

  const families = new Map<string, FamilyRecord>();
  models.forEach((model) => {
    const family =
      families.get(model.familyId) ||
      families
        .set(model.familyId, {
          familyId: model.familyId,
          title: FAMILY_LOOKUP.get(model.familyId)?.title ?? "Other",
          instalmentFactor:
            FAMILY_LOOKUP.get(model.familyId)?.instalmentFactor ??
            DEFAULT_INSTALLMENT_FACTOR,
          bnplProviders: BNPL_PROVIDERS,
          models: [],
          warranties:
            FAMILY_LOOKUP.get(model.familyId)?.defaultWarranties ?? {},
        })
        .get(model.familyId)!;
    family.models.push(model);
  });

  const validation: ValidationReport = {
    generated_at: new Date().toISOString(),
    variant_count: variants.length,
    model_count: models.length,
    families: {},
    factorOutliers: [],
    unmatchedTradeEntries: [],
    modelsWithoutTrade: [],
    missingWooProducts: [],
  };

  families.forEach((family) => {
    const prices: number[] = [];
    const warnings: string[] = [];
    family.models.forEach((model) => {
      model.conditions.forEach((condition) => {
        if (condition.basePrice) prices.push(condition.basePrice);
        if (
          condition.observedFactor &&
          (condition.observedFactor < 1.04 || condition.observedFactor > 1.07)
        ) {
          validation.factorOutliers.push({
            modelId: model.modelId,
            condition: condition.condition,
            observedFactor: condition.observedFactor,
            message: `${model.title} ${condition.condition} factor ${condition.observedFactor.toFixed(3)}`,
          });
        }
      });
      if (model.warnings.length) {
        warnings.push(
          ...model.warnings.map((warn) => `${model.modelId}: ${warn}`),
        );
      }
    });
    validation.families[family.familyId] = {
      models: family.models.length,
      priceRange:
        prices.length > 0 ? [Math.min(...prices), Math.max(...prices)] : null,
      warnings,
    };
  });

  const modeledProductIds = new Set(
    models.map((model) => model.source.productId),
  );
  validation.missingWooProducts = wooProducts
    .filter((product) => !modeledProductIds.has(product.id))
    .map((product) => ({
      productId: product.id,
      name: product.name || `Product ${product.id}`,
    }));

  const tradeEntries = [...tradeJsonl, ...tradeCsv];
  attachTradeData(models, tradeEntries, validation);

  const catalogPayload = {
    generated_at: new Date().toISOString(),
    source_catalog_size: wooProducts.length,
    family_count: families.size,
    families: Array.from(families.values()).map((family) => ({
      family_id: family.familyId,
      title: family.title,
      instalment_factor: family.instalmentFactor,
      bnpl_providers: family.bnplProviders,
      warranties: family.warranties,
      models: family.models.map((model) => ({
        model_id: model.modelId,
        title: model.title,
        bundle: model.bundle,
        region: model.region,
        storage: model.storage,
        options: model.options,
        aliases: model.aliases,
        source: model.source,
        warnings: model.warnings,
        categories: model.categories,
        tags: model.tags,
        kind: model.kind,
        warranty_notes: model.warrantyNotes,
        conditions: model.conditions,
      })),
    })),
  };

  const aliasIndex = buildAliasIndex(models, JSON.parse(synonymsRaw));

  await fs.mkdir(path.join(root, OUTPUT_DIR), { recursive: true });
  await Promise.all([
    fs.writeFile(
      path.join(root, OUTPUT_DIR, "products_master.json"),
      JSON.stringify(catalogPayload, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(root, OUTPUT_DIR, "alias_index.json"),
      JSON.stringify(aliasIndex, null, 2),
      "utf8",
    ),
    fs.writeFile(
      path.join(root, OUTPUT_DIR, "validation_report.json"),
      JSON.stringify(validation, null, 2),
      "utf8",
    ),
  ]);

  console.log(
    `[catalog] Generated ${catalogPayload.family_count} families covering ${catalogPayload.families
      .map((family) => family.models.length)
      .reduce((sum, count) => sum + count, 0)} models.`,
  );
  console.log(
    `[catalog] Factor outliers: ${validation.factorOutliers.length}, unmatched trade entries: ${validation.unmatchedTradeEntries.length}`,
  );
}

main().catch((error) => {
  console.error("[catalog] Failed to build products_master:", error);
  process.exit(1);
});
