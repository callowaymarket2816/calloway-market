import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { PRODUCTS } from "./src/productsData";
import { SearchQuery, Product } from "./src/types";

dotenv.config();

const app = express();
// Render (and most real hosts) assign their own port via the PORT env var
// and expect the app to listen on it — hardcoding 3000 would break this.
// Falls back to 3000 for local development where no PORT is set.
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// ---------------------------------------------------------------------------
// PERSISTENCE FIX (v2 — real database): previously, currentProducts and
// searchQueries lived only in a plain JS variable in server memory, then
// briefly in a JSON file on disk. Both approaches fail on serverless hosts
// like Vercel, which don't guarantee a persistent filesystem between
// requests. This now reads/writes a real Supabase Postgres database
// instead — the same project already used by the inventory scanner tool.
//
// Requires SUPABASE_URL and SUPABASE_SECRET_KEY to be set as real
// environment variables (set in Vercel's Project Settings → Environment
// Variables for production, or in a local .env file for development —
// never commit the secret key to source control).
// ---------------------------------------------------------------------------
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

// In-memory fallback only used if Supabase env vars are missing entirely,
// so the server can still start (e.g. for quick local testing) rather than
// crashing — but this fallback does NOT persist, by design, to make the
// missing configuration obvious rather than silently "working" with data
// that disappears on the next restart.
let memoryProductsFallback: Product[] = [...PRODUCTS];
let memorySearchesFallback: SearchQuery[] = [];

async function loadProductsFromDisk(): Promise<Product[]> {
  if (!supabase) return memoryProductsFallback;
  try {
    const { data, error } = await supabase
      .from("website_products")
      .select("data")
      .order("created_at", { ascending: false });
    if (error) throw error;
    if (data && data.length > 0) {
      console.log(`Loaded ${data.length} products from Supabase.`);
      return data.map((row) => row.data as Product);
    }
  } catch (err) {
    console.error("Failed to load products from Supabase, falling back to built-in seed data:", err);
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
    // Replace the full product set: clear existing rows, then insert current state.
    // Simpler and safer than diffing for a catalog this size, and matches
    // the same "replace whole list" semantics the old file-based version had.
    const { error: deleteError } = await supabase
      .from("website_products")
      .delete()
      .neq("id", "__never_matches__"); // delete-all idiom: a condition that's always true
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
  // Only the newest entry actually needs writing on each call (see call
  // sites below) — full-list replacement isn't necessary here since search
  // history is append-only, unlike the product catalog which gets replaced
  // wholesale on upload.
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


// ---------------------------------------------------------------------------
// SECURITY FIX: Real server-side merchant authentication.
// Previously, the "passcode" only hid a button in the browser UI — the actual
// API endpoints below (product upload, delete-all, AI insights) had ZERO
// protection, so anyone who found the URL could wipe the inventory with a
// single request, passcode or not.
//
// This middleware now requires a secret key on every merchant-only request.
// Set MERCHANT_API_KEY as a real secret (not committed to code) in your
// hosting platform's Secrets/Environment panel — never hardcode it here.
// ---------------------------------------------------------------------------
const MERCHANT_API_KEY = process.env.MERCHANT_API_KEY;

function requireMerchantAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!MERCHANT_API_KEY) {
    // Fail safe: if no key is configured at all, block merchant actions
    // entirely rather than silently allowing public access.
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

// Initialize Gemini Client with User-Agent header for telemetry
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

// In-memory data store for local search queries.
// FIX: this used to be pre-seeded with 15 entirely fictional search entries
// (fake queries like "Macallan 12" and "Clase Azul Plata" that aren't even
// in your real inventory, fake neighborhoods, fake timestamps) designed to
// make the dashboard look populated with real activity from day one. That's
// misleading — it would show what looks like real customer behavior data
// that never actually happened. Starts empty here and is populated for real
// from Supabase inside startServer() below, before the app starts listening.
let searchQueries: SearchQuery[] = [];

// Helper array of neighborhoods for random assignment
// REMOVED: NEIGHBORHOODS fake-data array (no longer used — see /api/searches fix above)

// PERSISTENCE FIX: previously always reset to the 17 fake demo products on
// every server restart. Starts with the built-in seed data here as a safe
// synchronous default, then is replaced with whatever's actually saved in
// Supabase inside startServer() below, before the app starts listening —
// real merchant-uploaded inventory survives restarts once that load completes.
let currentProducts: Product[] = [...PRODUCTS];

// Brand extraction helper for analytics tracking.
// FIX: this list used to contain only fictional luxury spirits (Macallan,
// Dom Perignon, Krug, Yamazaki) that aren't in your real inventory at all —
// meaning real customer searches for your actual top sellers (Modelo,
// Pepsi, Jack Daniel's, Monster, etc.) would never be recognized as a
// "brand" by this function. Replaced with real brands pulled from your
// verified 898-item inventory.
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
  // If no known brand matches, use the first word if it isn't generic
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

// API Endpoints

// 1. Get all products
app.get("/api/products", (req, res) => {
  res.json(currentProducts);
});

// 1b. Add/Upload new product or bulk products
app.post("/api/products", requireMerchantAuth, async (req, res) => {
  const { products } = req.body; // Can be an array or a single product
  
  if (!products) {
    return res.status(400).json({ error: "No product data provided." });
  }

  const itemsToAdd = Array.isArray(products) ? products : [products];
  
  // Validate and sanitize products.
  // FIX: previously missing fields were filled with confident-sounding
  // fabricated marketing copy (fake ABV "40%", fake tasting notes "Premium
  // Select", fake food pairing "Assorted charcuterie") even for products
  // where none of that applies (e.g. a bag of chips). Defaults now clearly
  // signal missing data instead of inventing believable-but-false details.
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

  currentProducts = [...sanitizedItems, ...currentProducts]; // prepend new items
  await saveProductsToDisk(currentProducts); // PERSISTENCE FIX: survive restarts
  res.json({ success: true, count: sanitizedItems.length, products: sanitizedItems });
});

// 1c. Delete all products (clear inventory)
app.delete("/api/products", requireMerchantAuth, async (req, res) => {
  currentProducts = [];
  await saveProductsToDisk(currentProducts); // PERSISTENCE FIX: survive restarts
  res.json({ success: true, message: "All inventory has been deleted successfully." });
});

// 1d. Delete a single product by ID
app.delete("/api/products/:id", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;
  currentProducts = currentProducts.filter((p) => p.id !== id);
  await saveProductsToDisk(currentProducts); // PERSISTENCE FIX: survive restarts
  res.json({ success: true, message: `Product with ID ${id} deleted.` });
});

// 1e. Toggle a single product's stock status (In Stock <-> Temporarily Out of Stock)
app.patch("/api/products/:id/stock", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;
  const product = currentProducts.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ error: `Product with ID ${id} not found.` });
  }
  // Simple two-way toggle as requested — if it's currently anything other
  // than "In Stock" (Limited Stock, Special Order Only, etc.), treat the
  // toggle as bringing it back into stock; otherwise mark it out.
  product.stockStatus =
    product.stockStatus === "In Stock" ? "Temporarily Out of Stock" : "In Stock";
  await saveProductsToDisk(currentProducts); // PERSISTENCE FIX: survive restarts
  res.json({ success: true, id, stockStatus: product.stockStatus });
});

// 2. Log a new search query (Customer-facing action)
app.post("/api/searches", async (req, res) => {
  const { query, category, source } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Search query is required." });
  }

  // FIX: this used to invent a random neighborhood and a random distance
  // for every real customer search, making fabricated location data look
  // like genuine analytics. We don't actually have real location data for
  // on-site searches (that would require real geolocation/IP lookup with
  // its own privacy considerations, or a Google Search Console
  // integration for actual Google-originated searches) — so we no longer
  // invent it. These fields are explicitly marked unavailable instead.
  const newSearch: SearchQuery = {
    id: `s_dyn_${Date.now()}`,
    query: query.trim(),
    category: category || "Unknown",
    timestamp: new Date().toISOString(),
    distanceMiles: null, // not measured — do not display as if it were real
    neighborhood: "Unknown (location data not yet connected)",
    source: source === "Google Search" ? "Google Search" : "Calloway Website",
  };

  searchQueries.unshift(newSearch); // Add to the front of history

  // Cap history size to prevent memory leaks in the running container
  if (searchQueries.length > 200) {
    searchQueries = searchQueries.slice(0, 200);
  }

  await saveSearchesToDisk(searchQueries); // PERSISTENCE FIX: survive restarts
  res.status(201).json(newSearch);
});

// 3. Get all searches (Owner-facing action)
app.get("/api/searches", (req, res) => {
  res.json(searchQueries);
});

// 3b. Proxy endpoint to fetch external Google Sheets CSV exports without CORS blocks
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

// 4. Get compiled analytics summary for dashboard charts
app.get("/api/analytics/summary", (req, res) => {
  // Calculate popular categories
  const categoryCounts: Record<string, number> = {};
  // Calculate trending queries
  const queryCounts: Record<string, { count: number; category: string }> = {};

  searchQueries.forEach((q) => {
    // 1. Category counts
    if (q.category) {
      categoryCounts[q.category] = (categoryCounts[q.category] || 0) + 1;
    }

    // 2. Query counts (normalize)
    const normalizedText = q.query.toLowerCase().trim();
    if (normalizedText.length > 2) {
      if (!queryCounts[normalizedText]) {
        queryCounts[normalizedText] = { count: 0, category: q.category || "General" };
      }
      queryCounts[normalizedText].count += 1;
    }
    // FIX: a neighborhood heat-map calculation used to live here, built on
    // fabricated per-search neighborhood/distance values. Since that data
    // was never real, the calculation has been removed rather than kept
    // running on nulls (which would have silently produced NaN results).
    // If you wire in real location data later (e.g. via Search Console),
    // this is the place to add a real version of it.
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

  // FIX: heatMapData used to be calculated from fabricated per-search
  // neighborhood/distance values (see /api/searches fix above). Returning
  // an empty array now — honest about not having real location data yet —
  // rather than computing it from data that was never real.
  const heatMapData: { neighborhood: string; count: number; averageDistance: number }[] = [];

  // Google Search specific analytics
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

  // Website specific analytics
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

// 5. Generate AI insights from search logs
app.post("/api/analytics/ai-insights", requireMerchantAuth, async (req, res) => {
  // FIX: the fallback used to fabricate a confident, specific-sounding
  // report ("Seven Oaks tequila demand up 15% today", "within 1.5 miles of
  // Calloway Market") regardless of whether any real search data existed.
  // That's presenting invented numbers as if they were real findings. The
  // fallback now honestly reflects how much real data actually exists.
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
      // Graceful fallback if API key is not configured yet
      return res.json({
        insights: fallback.fallbackInsights + "\n\n*Configure a valid GEMINI_API_KEY in the Secrets panel to activate full natural-language AI insights forecasting.*",
        suggestions: fallback.fallbackSuggestions,
        generatedAt: new Date().toISOString(),
        needsApiKey: true,
      });
    }

    // Format the recent searches for the prompt
    const recentQueriesFormatted = searchQueries.slice(0, 40).map((q) => ({
      query: q.query,
      category: q.category,
      neighborhood: q.neighborhood,
      distance: q.distanceMiles != null ? `${q.distanceMiles}mi` : "unknown",
      timeAgo: `${Math.round((Date.now() - new Date(q.timestamp).getTime()) / (60000))} mins ago`,
    }));

    // Call the actual Gemini API with automatic retry and model fallback
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
      const attempts = currentModel === "gemini-3.5-flash" ? 3 : 1; // Try primary model up to 3 times, others once
      for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
          response = await executeGenerate(currentModel);
          break; // Succeeded! Break the attempt loop.
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || String(err);
          console.warn(`[AI Insights] Attempt ${attempt} with model ${currentModel} failed: ${errMsg}`);
          if (attempt < attempts) {
            // Exponential backoff delay (600ms, then 1500ms)
            const delay = attempt === 1 ? 600 : 1500;
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
      if (response) {
        break; // Succeeded with one of the models, break the model loop.
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
    
    // Gracefully handle Gemini API errors (like 503 high demand or 429 rate limit)
    // Send a beautiful heuristic analysis with an error warning message included at the bottom
    const fallback = getFallbackData();
    res.json({
      insights: fallback.fallbackInsights + `\n\n⚠️ *Note: The Gemini AI Service is currently experiencing extremely high traffic volumes. We have temporarily activated our local backup analytics model to compile your Bakersfield market report instantly.*`,
      suggestions: fallback.fallbackSuggestions,
      generatedAt: new Date().toISOString(),
      needsApiKey: true, // Mark as true so the UI can show we're on fallback mode
    });
  }
});

// Configure Vite or Serve Static Production Files
//
// DEPLOYMENT FIX: Vercel's zero-config Express support auto-detects an
// exported `app` (or a port listener) from specific file locations, but
// does NOT run a custom multi-step build pipeline the way this project's
// "vite build && esbuild server.ts --bundle ..." command does — it never
// found a working entry point, which is why /api/products returned 404
// on the first deploy attempt. Vercel also does not support
// express.static() for serving built frontend assets at all; static files
// must live in /public instead, which Vercel serves directly via its CDN.
//
// Fix: load real data and, in local development only, start a normal
// app.listen() server with Vite's dev middleware. In production on
// Vercel, none of that runs — Vercel itself invokes the exported `app`
// directly as a Function, and serves /public assets on its own. The
// build script (see package.json) now also copies the Vite output into
// /public so Vercel's static serving picks it up correctly.
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

// Load data on module init for both paths (local dev awaits it before
// listening; Vercel's cold start will await it via this same promise on
// the first request to hit any route, since Express middleware below
// can rely on ensureDataLoaded() having been kicked off already).
ensureDataLoaded();

app.use(async (req, res, next) => {
  await ensureDataLoaded();
  next();
});

async function startLocalDevServer() {
  await ensureDataLoaded();

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting Express server in development mode with Vite HMR middleware...");
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

// Only start a local listener when actually running locally (npm run dev
// or npm start on your own machine). On Vercel, this file is imported as
// a module and the exported `app` below is invoked directly per-request —
// calling app.listen() there would be incorrect and is skipped via this
// check (Vercel sets VERCEL=1 in its build/runtime environment).
if (!process.env.VERCEL) {
  startLocalDevServer();
}

// Required for Vercel's zero-config Express detection: export the app as
// the module's default export so Vercel can invoke it directly as a
// Function, without needing custom esbuild bundling — see api/index.ts,
// which is the actual file Vercel invokes as the Function entry point.
export default app;

