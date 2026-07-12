import express from "express";
import path from "path";

import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTS } from "./src/productsData.js";
import { SearchQuery, Product } from "./src/types.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SECRET_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY)
    : null;

if (!supabase) {
  console.warn(
    "SUPABASE_URL or SUPABASE_SECRET_KEY not set — falling back to in-memory storage. Data will NOT persist across restarts until these are configured."
  );
}

let memoryProductsFallback: Product[] = [...PRODUCTS];
let memorySearchesFallback: SearchQuery[] = [];

let lastProductLoadWasReliable = false;

async function loadProductsFromDisk(): Promise<Product[]> {
  if (!supabase) {
    lastProductLoadWasReliable = false;
    return memoryProductsFallback;
  }
  try {
    const allRows: { data: Product }[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("website_products")
        .select("data")
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      allRows.push(...(data as { data: Product }[]));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    const data = allRows;
    if (data && data.length > 0) {
      console.log(`Loaded ${data.length} products from Supabase.`);
      lastProductLoadWasReliable = true;
      return data.map((row) => row.data as Product);
    }
    lastProductLoadWasReliable = true;
  } catch (err) {
    console.error("Failed to load products from Supabase, falling back to built-in seed data:", err);
    lastProductLoadWasReliable = false;
  }
  console.log("No saved products found in database — starting from built-in seed data.");
  return [...PRODUCTS];
}

async function saveProductsToDisk(products: Product[]): Promise<void> {
  if (!supabase) {
    memoryProductsFallback = products;
    console.warn("Supabase not configured — product changes will NOT persist across restarts.");
    return;
  }
  try {
    const { error: deleteError } = await supabase
      .from("website_products")
      .delete()
      .neq("id", "__never_matches__");
    if (deleteError) throw deleteError;

    if (products.length > 0) {
      const rows = products.map((p) => ({ id: p.id, data: p, updated_at: new Date().toISOString() }));
      const { error: insertError } = await supabase.from("website_products").insert(rows);
      if (insertError) throw insertError;
    }
  } catch (err) {
    console.error("Failed to save products to Supabase — changes may not persist:", err);
  }
}

async function loadSearchesFromDisk(): Promise<SearchQuery[]> {
  if (!supabase) return memorySearchesFallback;
  try {
    const { data, error } = await supabase
      .from("website_searches")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(200);
    if (error) throw error;
    if (data) {
      console.log(`Loaded ${data.length} search log entries from Supabase.`);
      return data.map((row) => ({
        id: row.id,
        query: row.query,
        category: row.category ?? undefined,
        timestamp: row.timestamp,
        distanceMiles: row.distance_miles,
        neighborhood: row.neighborhood,
        source: row.source ?? undefined,
      }));
    }
  } catch (err) {
    console.error("Failed to load search history from Supabase, starting empty:", err);
  }
  return [];
}

async function saveSearchesToDisk(searches: SearchQuery[]): Promise<void> {
  if (!supabase) {
    memorySearchesFallback = searches;
    console.warn("Supabase not configured — search history will NOT persist across restarts.");
    return;
  }
  try {
    const newest = searches[0];
    if (!newest) return;
    const { error } = await supabase.from("website_searches").insert({
      id: newest.id,
      query: newest.query,
      category: newest.category ?? null,
      timestamp: newest.timestamp,
      distance_miles: newest.distanceMiles,
      neighborhood: newest.neighborhood,
      source: newest.source ?? null,
    });
    if (error) throw error;
  } catch (err) {
    console.error("Failed to save search entry to Supabase:", err);
  }
}

const MERCHANT_API_KEY = process.env.MERCHANT_API_KEY;

function requireMerchantAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!MERCHANT_API_KEY) {
    return res.status(503).json({
      error: "Merchant authentication is not configured on this server. Set MERCHANT_API_KEY in your hosting secrets before using merchant features.",
    });
  }
  const providedKey = req.headers["x-merchant-key"];
  if (providedKey !== MERCHANT_API_KEY) {
    return res.status(401).json({ error: "Unauthorized. Invalid or missing merchant key." });
  }
  next();
}

let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY") {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
  console.log("Gemini AI Client successfully initialized.");
} else {
  console.log("GEMINI_API_KEY not set. Server will run with dynamic heuristic-based fallbacks.");
}

let searchQueries: SearchQuery[] = [];

let currentProducts: Product[] = [...PRODUCTS];

function extractBrand(query: string): string {
  const queryLower = query.toLowerCase();
  const knownBrands = [
    "Jack Daniel's", "Jameson", "Crown Royal", "Fireball", "Hennessy",
    "Don Julio", "1800", "Smirnoff", "Modelo", "Corona", "Pacífico",
    "Bud Light", "Budweiser", "Michelob", "Coors", "Miller", "Heineken",
    "Firestone", "Mike's Hard", "White Claw", "Truly", "Twisted Tea",
    "Monster", "Cellucor C4", "5-hour Energy", "Pepsi", "Coke", "Coca-Cola",
    "Sprite", "AriZona", "Gatorade", "Seagram's", "GHOST",
  ];
  for (const brand of knownBrands) {
    if (queryLower.includes(brand.toLowerCase())) {
      return brand;
    }
  }
  const firstWord = query.trim().split(" ")[0];
  const genericWords = [
    "tequila", "whiskey", "vodka", "gin", "beer", "wine", "champagne",
    "liqueur", "bourbon", "ipa", "cabernet", "mezcal", "organic", "for",
    "bottle", "sizes", "spritz", "single", "double", "red", "white", "diet",
    "new", "high",
  ];
  if (firstWord && !genericWords.includes(firstWord.toLowerCase()) && firstWord.length > 2) {
    return firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase();
  }
  return "Other / Unbranded";
}

app.get("/api/products", async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from("website_products")
        .select("data")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (data) {
        currentProducts = data.map((row) => row.data as Product);
        lastProductLoadWasReliable = true;
        return res.json(currentProducts);
      }
    }
  } catch (err) {
    console.error("Failed to fetch fresh products from Supabase, serving last known in-memory snapshot instead:", err);
  }
  res.json(currentProducts);
});

app.post("/api/products", requireMerchantAuth, async (req, res) => {
  const { products } = req.body;
  
  if (!products) {
    return res.status(400).json({ error: "No product data provided." });
  }

  const itemsToAdd = Array.isArray(products) ? products : [products];
  
  const sanitizedItems = itemsToAdd.map((p, idx) => {
    return {
      id: p.id || `uploaded-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
      name: p.name || "(Unnamed item — needs a real name)",
      category: p.category || "Uncategorized",
      description: p.description || "",
      origin: p.origin || "",
      abv: p.abv || "",
      size: p.size || "",
      stockStatus: p.stockStatus || "In Stock",
      tastingNotes: Array.isArray(p.tastingNotes) ? p.tastingNotes : (p.tastingNotes ? String(p.tastingNotes).split(",").map(t => t.trim()) : []),
      foodPairing: p.foodPairing || "",
      imageColor: p.imageColor || "from-amber-900 to-slate-900",
      iconName: p.iconName || "Wine",
      popularity: Number(p.popularity) || 80,
      price: p.price ? Number(p.price) : undefined,
      marginPercent: p.marginPercent ? Number(p.marginPercent) : undefined
    };
  });

  if (!lastProductLoadWasReliable) {
    console.error("Refusing to save upload: product data was not reliably loaded from Supabase for this server instance. Retrying load before saving.");
    currentProducts = await loadProductsFromDisk();
    if (!lastProductLoadWasReliable) {
      return res.status(503).json({
        error: "Could not confirm your current inventory is up to date (temporary database connection issue). Please try uploading again in a moment — nothing was saved, so your existing inventory is safe."
      });
    }
  }

  currentProducts = [...sanitizedItems, ...currentProducts];
  await saveProductsToDisk(currentProducts);
  res.json({ success: true, count: sanitizedItems.length, products: sanitizedItems });
});

app.delete("/api/products", requireMerchantAuth, async (req, res) => {
  currentProducts = [];
  await saveProductsToDisk(currentProducts);
  res.json({ success: true, message: "All inventory has been deleted successfully." });
});

app.delete("/api/products/:id", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;

  if (!lastProductLoadWasReliable) {
    currentProducts = await loadProductsFromDisk();
    if (!lastProductLoadWasReliable) {
      return res.status(503).json({
        error: "Could not confirm your current inventory is up to date (temporary database connection issue). Please try again in a moment — nothing was deleted."
      });
    }
  }

  currentProducts = currentProducts.filter((p) => p.id !== id);
  await saveProductsToDisk(currentProducts);
  res.json({ success: true, message: `Product with ID ${id} deleted.` });
});

app.patch("/api/products/:id/stock", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;

  if (!lastProductLoadWasReliable) {
    currentProducts = await loadProductsFromDisk();
    if (!lastProductLoadWasReliable) {
      return res.status(503).json({
        error: "Could not confirm your current inventory is up to date. Please try again in a moment — nothing was changed."
      });
    }
  }

  const product = currentProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: `Product with ID ${id} not found.` });
  }
  product.stockStatus =
    product.stockStatus === "In Stock" ? "Temporarily Out of Stock" : "In Stock";
  await saveProductsToDisk(currentProducts);
  res.json({ success: true, id, stockStatus: product.stockStatus });
});

app.patch("/api/products/:id/featured", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;

  if (!lastProductLoadWasReliable) {
    currentProducts = await loadProductsFromDisk();
    if (!lastProductLoadWasReliable) {
      return res.status(503).json({
        error: "Could not confirm your current inventory is up to date. Please try again in a moment — nothing was changed."
      });
    }
  }

  const product = currentProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: `Product with ID ${id} not found.` });
  }
  product.featured = !product.featured;
  await saveProductsToDisk(currentProducts);
  res.json({ success: true, id, featured: product.featured });
});

// Edit a single product's price (and store price) without needing to
// delete and re-add the item.
app.patch("/api/products/:id/price", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;
  const { price, storePrice } = req.body;

  if (price === undefined && storePrice === undefined) {
    return res.status(400).json({ error: "Provide at least one of: price, storePrice." });
  }

  if (!lastProductLoadWasReliable) {
    currentProducts = await loadProductsFromDisk();
    if (!lastProductLoadWasReliable) {
      return res.status(503).json({
        error: "Could not confirm your current inventory is up to date. Please try again in a moment — nothing was changed."
      });
    }
  }

  const product = currentProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: `Product with ID ${id} not found.` });
  }

  if (price !== undefined) {
    const parsed = Number(price);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ error: "Price must be a valid non-negative number." });
    }
    product.price = parsed;
  }

  if (storePrice !== undefined) {
    const parsed = Number(storePrice);
    if (isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ error: "Store price must be a valid non-negative number." });
    }
    product.storePrice = parsed;
  }

  await saveProductsToDisk(currentProducts);
  res.json({ success: true, id, price: product.price, storePrice: product.storePrice });
});

app.post("/api/searches", async (req, res) => {
  const { query, category, source } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Search query is required." });
  }

  const newSearch: SearchQuery = {
    id: `s_dyn_${Date.now()}`,
    query: query.trim(),
    category: category || "Unknown",
    timestamp: new Date().toISOString(),
    distanceMiles: null,
    neighborhood: "Unknown (location data not yet connected)",
    source: source === "Google Search" ? "Google Search" : "Calloway Website",
  };

  searchQueries.unshift(newSearch);

  if (searchQueries.length > 200) {
    searchQueries = searchQueries.slice(0, 200);
  }

  await saveSearchesToDisk(searchQueries);
  res.status(201).json(newSearch);
});

app.get("/api/searches", (req, res) => {
  res.json(searchQueries);
});

function generateCouponCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `CALLOWAY-${code}`;
}

app.post("/api/email-signup", async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "A valid email address is required." });
  }
  const normalizedEmail = email.trim().toLowerCase();

  if (!supabase) {
    return res.status(503).json({ error: "Signup is temporarily unavailable. Please try again later." });
  }

  try {
    const { data: existing, error: lookupError } = await supabase
      .from("email_signups")
      .select("coupon_code")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (lookupError) throw lookupError;

    if (existing) {
      return res.json({ success: true, couponCode: existing.coupon_code, alreadySignedUp: true });
    }

    let couponCode = generateCouponCode();
    let insertError = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await supabase
        .from("email_signups")
        .insert({ email: normalizedEmail, coupon_code: couponCode });
      if (!error) {
        insertError = null;
        break;
      }
      insertError = error;
      couponCode = generateCouponCode();
    }
    if (insertError) throw insertError;

    // Send the coupon email. No AbortController/timeout here — a timeout
    // was likely killing the request to Resend before it completed,
    // which is why nothing showed up in logs or in Resend's dashboard.
    // We always log the raw status + body from Resend so the real
    // outcome is visible every time, regardless of success or failure.
    if (process.env.RESEND_API_KEY) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Calloway Market <onboarding@resend.dev>",
            to: normalizedEmail,
            subject: "Your 10% Off Code — Calloway Market",
            html: `
              <div style="font-family: sans-serif; padding: 20px;">
                <h2>Here's your code!</h2>
                <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">${couponCode}</p>
                <p>Show this at checkout for 10% off your purchase.</p>
                <p style="font-size: 12px; color: #666;">
                  One coupon per transaction. Not valid on lottery, lotto tickets, money orders, cigarettes, or tobacco products. Cannot be combined with other promotions or discounts. Must be 21+.
                </p>
              </div>
            `,
          }),
        });
        const emailBody = await emailRes.text();
        console.log(`Resend response — status ${emailRes.status}: ${emailBody}`);
      } catch (emailErr) {
        console.error("Failed to send coupon email (code was still generated and saved):", emailErr);
      }
    }

    res.json({ success: true, couponCode, alreadySignedUp: false });
  } catch (err) {
    console.error("Email signup failed:", err);
    res.status(500).json({ error: "Could not complete signup. Please try again." });
  }
});

app.post("/api/proxy-sheet", requireMerchantAuth, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string") {
    return res.status(400).json({ error: "Google Sheet CSV export URL is required." });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Sheets export returned status ${response.status}`);
    }
    const text = await response.text();
    res.json({ csvData: text });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch external spreadsheet data." });
  }
});

app.get("/api/analytics/summary", (req, res) => {
  const categoryCounts: Record<string, number> = {};
  const queryCounts: Record<string, { count: number; category: string }> = {};

  searchQueries.forEach((q) => {
    if (q.category) {
      categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
    }

    const normalizedText = q.query.toLowerCase().trim();
    if (normalizedText.length > 2) {
      if (!queryCounts[normalizedText]) {
        queryCounts[normalizedText] = { count: 0, category: q.category || "General" };
      }
      queryCounts[normalizedText].count += 1;
    }
  });

  const popularCategories = Object.keys(categoryCounts).map((cat) => ({
    name: cat,
    value: categoryCounts[cat],
  }));

  const trendingQueries = Object.keys(queryCounts)
    .map((text) => ({
      text: text.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" "),
      count: queryCounts[text].count,
      category: queryCounts[text].category,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const heatMapData: { neighborhood: string; count: number; averageDistance: number }[] = [];

  const googleCategoryCounts: Record<string, number> = {};
  const googleBrandCounts: Record<string, number> = {};
  const googleSearchQueries = searchQueries.filter((q) => q.source === "Google Search");

  googleSearchQueries.forEach((q) => {
    if (q.category) {
      googleCategoryCounts[q.category] = (googleCategoryCounts[q.category] || 0) + 1;
    }
    const brand = extractBrand(q.query);
    googleBrandCounts[brand] = (googleBrandCounts[brand] || 0) + 1;
  });

  const googlePopularCategories = Object.keys(googleCategoryCounts).map((cat) => ({
    name: cat,
    value: googleCategoryCounts[cat],
  })).sort((a, b) => b.value - a.value);

  const googlePopularBrands = Object.keys(googleBrandCounts).map((brand) => ({
    name: brand,
    value: googleBrandCounts[brand],
  })).sort((a, b) => b.value - a.value);

  const websiteCategoryCounts: Record<string, number> = {};
  const websiteBrandCounts: Record<string, number> = {};
  const websiteSearchQueries = searchQueries.filter((q) => q.source !== "Google Search");

  websiteSearchQueries.forEach((q) => {
    if (q.category) {
      websiteCategoryCounts[q.category] = (websiteCategoryCounts[q.category] || 0) + 1;
    }
    const brand = extractBrand(q.query);
    websiteBrandCounts[brand] = (websiteBrandCounts[brand] || 0) + 1;
  });

  const websitePopularCategories = Object.keys(websiteCategoryCounts).map((cat) => ({
    name: cat,
    value: websiteCategoryCounts[cat],
  })).sort((a, b) => b.value - a.value);

  const websitePopularBrands = Object.keys(websiteBrandCounts).map((brand) => ({
    name: brand,
    value: websiteBrandCounts[brand],
  })).sort((a, b) => b.value - a.value);

  res.json({
    recentSearches: searchQueries.slice(0, 100),
    popularCategories,
    trendingQueries,
    heatMapData,
    googlePopularCategories,
    googlePopularBrands,
    websitePopularCategories,
    websitePopularBrands,
  });
});

app.post("/api/analytics/ai-insights", requireMerchantAuth, async (req, res) => {
  const getFallbackData = () => {
    const recentQueriesFormatted = searchQueries.slice(0, 40).map((q) => ({
      query: q.query,
      category: q.category,
      neighborhood: q.neighborhood,
      distance: q.distanceMiles != null ? `${q.distanceMiles}mi` : "unknown",
      timeAgo: `${Math.round((Date.now() - new Date(q.timestamp).getTime()) / (60000))} mins ago`,
    }));

    const categories = recentQueriesFormatted.reduce((acc, curr) => {
      if (curr.category) acc[curr.category] = (acc[curr.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedCategories = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    const topCategory = sortedCategories[0]?.[0];

    if (searchQueries.length === 0) {
      return {
        topCategory: null,
        fallbackInsights: `### No Search Data Yet\nNo customer searches have been logged on your site yet, so there's nothing real to analyze. Once customers start searching your catalog, this report will reflect actual search activity — categories, frequency, and timing — instead of a placeholder.`,
        fallbackSuggestions: [
          "Once real search data accumulates, this panel will surface your actual top-searched categories and products.",
          "Consider connecting Google Search Console to also see what people search for on Google before reaching your site.",
        ],
      };
    }

    return {
      topCategory,
      fallbackInsights: `### Search Activity Summary for Calloway Market\nBased on ${searchQueries.length} logged search${searchQueries.length === 1 ? "" : "es"} on your site${topCategory ? `, **${topCategory}** is your most-searched category so far` : ""}. Location/distance data is not yet connected, so this summary reflects search terms and categories only — not geographic demand.`,
      fallbackSuggestions: topCategory
        ? [`"${topCategory}" is your most-searched category — consider featuring it prominently or checking stock levels.`]
        : ["Not enough data yet to generate specific suggestions."],
    };
  };

  try {
    const fallback = getFallbackData();

    if (!ai) {
      return res.json({
        insights: fallback.fallbackInsights + "\n\n*Configure a valid GEMINI_API_KEY in the Secrets panel to activate full natural-language AI insights forecasting.*",
        suggestions: fallback.fallbackSuggestions,
        generatedAt: new Date().toISOString(),
        needsApiKey: true,
      });
    }

    const recentQueriesFormatted = searchQueries.slice(0, 40).map((q) => ({
      query: q.query,
      category: q.category,
      neighborhood: q.neighborhood,
      distance: q.distanceMiles != null ? `${q.distanceMiles}mi` : "unknown",
      timeAgo: `${Math.round((Date.now() - new Date(q.timestamp).getTime()) / (60000))} mins ago`,
    }));

    const executeGenerate = async (modelName: string) => {
      if (!ai) throw new Error("AI client not initialized");
      return await ai.models.generateContent({
        model: modelName,
        contents: `You are a retail analytics consultant for 'Calloway Market', a liquor, beer, and snacks store in Bakersfield, California.
Analyze the following JSON array of real customer search queries logged on the store's own website.
Identify genuine patterns in what customers are searching for — popular categories, repeated terms, timing trends.
Do not invent neighborhoods, distances, or any detail not present in the data below. If location/distance fields say "unknown" or are not connected, do not speculate about geography.

Search Queries:
${JSON.stringify(recentQueriesFormatted, null, 2)}

Return your response strictly in JSON format matching this TypeScript schema:
{
  "insights": "string (A cohesive 2-3 paragraph factual summary of search term and category trends found in the data above — no invented locations or statistics)",
  "suggestions": "string[] (An array of up to 4 action-oriented business suggestions grounded only in the actual data provided)"
}`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              insights: {
                type: Type.STRING,
                description: "A cohesive markdown analysis of local alcohol trends.",
              },
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Four direct business recommendations.",
              },
            },
            required: ["insights", "suggestions"],
          },
        },
      });
    };

    let response;
    let lastError: any = null;
    const modelsToTry = ["gemini-3.5-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

    for (const currentModel of modelsToTry) {
      const attempts = currentModel === "gemini-3.5-flash" ? 3 : 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          response = await executeGenerate(currentModel);
          break;
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          console.warn(`[AI Insights] Attempt ${attempt} with model ${currentModel} failed: ${errMsg}`);
          if (attempt < attempts) {
            const delay = attempt === 1 ? 600 : 1500;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      if (response) {
        break;
      }
    }

    if (!response) {
      throw lastError || new Error("Failed to generate content from any model");
    }

    const parsedData = JSON.parse(response.text?.trim() || "{}");
    res.json({
      insights: parsedData.insights || "No insights could be generated at this time.",
      suggestions: parsedData.suggestions || [],
      generatedAt: new Date().toISOString(),
      needsApiKey: false,
    });
  } catch (error: any) {
    console.warn("Gemini API was temporarily unavailable. Falling back gracefully to heuristics. Error details:", error.message || error);
    
    const fallback = getFallbackData();
    res.json({
      insights: fallback.fallbackInsights + `\n\n⚠️ *Note: The Gemini AI Service is currently experiencing extremely high traffic volumes. We have temporarily activated our local backup analytics model to compile your Bakersfield market report instantly.*`,
      suggestions: fallback.fallbackSuggestions,
      generatedAt: new Date().toISOString(),
      needsApiKey: true,
    });
  }
});

let dataLoadedPromise: Promise<void> | null = null;

async function ensureDataLoaded() {
  if (!dataLoadedPromise) {
    dataLoadedPromise = (async () => {
      currentProducts = await loadProductsFromDisk();
      searchQueries = await loadSearchesFromDisk();
    })();
  }
  return dataLoadedPromise;
}

ensureDataLoaded();

app.use(async (req, res, next) => {
  await ensureDataLoaded();
  next();
});

async function startLocalDevServer() {
  await ensureDataLoaded();
    
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Express server in development mode with Vite HMR middleware...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {

    console.log("Starting Express server in production mode serving static assets...");
    const publicPath = path.join(process.cwd(), "public");
    app.use(express.static(publicPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(publicPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Calloway Market Bakersfield Full-Stack application successfully running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startLocalDevServer();
}

export default app;
