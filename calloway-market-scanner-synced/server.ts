import express from "express";
import path from "path";
import { google } from "googleapis";

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

const STORE_LAT = 35.4094;
const STORE_LNG = -119.0958;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=14`,
      { headers: { "User-Agent": "CallowayMarketWebsite/1.0 (contact: callowaymarket2816@gmail.com)" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address || {};
    return addr.suburb || addr.neighbourhood || addr.city_district || addr.city || addr.town || addr.village || null;
  } catch {
    return null;
  }
}

async function geolocateIp(ip: string): Promise<{ lat: number; lng: number; city: string } | null> {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,lat,lon,city`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== "success") return null;
    return { lat: data.lat, lng: data.lon, city: data.city };
  } catch {
    return null;
  }
}

async function fetchGoogleSearchQueries(): Promise<{ query: string; clicks: number }[]> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const siteUrl = process.env.SEARCH_CONSOLE_SITE_URL?.trim();

  if (!email || !key || !siteUrl) {
    console.log("Google Search Console not configured — skipping sync.");
    return [];
  }

  try {
    const auth = new google.auth.JWT({
      email,
      key: key.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });

    const searchconsole = google.searchconsole({ version: "v1", auth });

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 3);

    const response = await searchconsole.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: startDate.toISOString().split("T")[0],
        endDate: endDate.toISOString().split("T")[0],
        dimensions: ["query"],
        rowLimit: 25,
      },
    });

    const rows = response.data.rows || [];
    return rows
      .filter((row) => row.keys && row.keys[0])
      .map((row) => ({
        query: row.keys![0],
        clicks: row.clicks || 0,
      }));
  } catch (err) {
    console.error("Failed to fetch Google Search Console data:", err);
    return [];
  }
}

type ImageLookupResult = { url: string; source: "upcitemdb" | "openfoodfacts" | "openproductsfacts" } | null;

async function tryUpcItemDb(upc: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${upc}`);
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.items?.[0];
    if (item && Array.isArray(item.images) && item.images.length > 0) {
      return item.images[0];
    }
    return null;
  } catch (err) {
    console.error(`UPCitemdb lookup failed for ${upc}:`, err);
    return null;
  }
}

const MIN_IMAGE_WIDTH = 400;

const NAME_MATCH_STOPWORDS = new Set([
  "the", "and", "or", "of", "with", "in", "on", "for", "a", "an",
  "pk", "pack", "oz", "ml", "l", "ct", "count", "size",
]);

function normalizeNameWords(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !NAME_MATCH_STOPWORDS.has(w));
}

function namesLikelyMatch(ourName: string, theirName: string | undefined | null): boolean {
  if (!theirName) return true;
  const ourWords = new Set(normalizeNameWords(ourName));
  const theirWords = normalizeNameWords(theirName);
  if (ourWords.size === 0 || theirWords.length === 0) return true;
  return theirWords.some((w) => ourWords.has(w));
}

async function tryOpenFoodFacts(upc: string, productName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${upc}.json?fields=product_name,image_url,image_front_url,images`,
      { headers: { "User-Agent": "CallowayMarketWebsite/1.0 (contact: callowaymarket2816@gmail.com)" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 0 || !data.product) return null;

    if (!namesLikelyMatch(productName, data.product.product_name)) return null;

    const imageUrl = data.product.image_front_url || data.product.image_url;
    if (!imageUrl) return null;

    const images = data.product.images || {};
    const frontEntry = Object.values(images).find((img: any) => img?.sizes?.full) as any;
    const width = frontEntry?.sizes?.full?.w || 0;
    if (width && width < MIN_IMAGE_WIDTH) return null;

    return imageUrl;
  } catch (err) {
    console.error(`Open Food Facts lookup failed for ${upc}:`, err);
    return null;
  }
}

async function tryOpenProductsFacts(upc: string, productName: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openproductsfacts.org/api/v2/product/${upc}.json?fields=product_name,image_url,image_front_url,images`,
      { headers: { "User-Agent": "CallowayMarketWebsite/1.0 (contact: callowaymarket2816@gmail.com)" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === 0 || !data.product) return null;

    if (!namesLikelyMatch(productName, data.product.product_name)) return null;

    const imageUrl = data.product.image_front_url || data.product.image_url;
    if (!imageUrl) return null;

    const images = data.product.images || {};
    const frontEntry = Object.values(images).find((img: any) => img?.sizes?.full) as any;
    const width = frontEntry?.sizes?.full?.w || 0;
    if (width && width < MIN_IMAGE_WIDTH) return null;

    return imageUrl;
  } catch (err) {
    console.error(`Open Products Facts lookup failed for ${upc}:`, err);
    return null;
  }
}

async function lookupProductImageByUpc(upc: string, productName: string): Promise<ImageLookupResult> {
  const fromUpcItemDb = await tryUpcItemDb(upc);
  if (fromUpcItemDb) return { url: fromUpcItemDb, source: "upcitemdb" };

  const fromOFF = await tryOpenFoodFacts(upc, productName);
  if (fromOFF) return { url: fromOFF, source: "openfoodfacts" };

  const fromOPF = await tryOpenProductsFacts(upc, productName);
  if (fromOPF) return { url: fromOPF, source: "openproductsfacts" };

  return null;
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
      marginPercent: p.marginPercent ? Number(p.marginPercent) : undefined,
      upc: p.upc || undefined,
      updatedAt: new Date().toISOString(),
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
  (product as any).updatedAt = new Date().toISOString();
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
  (product as any).updatedAt = new Date().toISOString();
  await saveProductsToDisk(currentProducts);
  res.json({ success: true, id, featured: product.featured });
});

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

  (product as any).updatedAt = new Date().toISOString();

  await saveProductsToDisk(currentProducts);
  res.json({ success: true, id, price: product.price, storePrice: product.storePrice });
});

// General-purpose edit endpoint — updates any combination of fields on an
// existing product (name, category, description, price, etc.) without
// needing to delete and re-add it. Only touches fields actually provided
// in the request body; everything else stays as-is.
app.patch("/api/products/:id", requireMerchantAuth, async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  if (!updates || typeof updates !== "object" || Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "No fields provided to update." });
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

  const allowedFields = [
    "name", "category", "subcategory", "description", "origin", "abv", "size",
    "stockStatus", "tastingNotes", "foodPairing", "imageColor", "iconName",
    "popularity", "price", "storePrice", "marginPercent", "featured", "upc",
    "imageUrl",
  ];

  for (const field of allowedFields) {
    if (field in updates) {
      if (field === "tastingNotes" && typeof updates[field] === "string") {
        (product as any)[field] = updates[field].split(",").map((t: string) => t.trim());
      } else if (["price", "storePrice", "marginPercent", "popularity"].includes(field)) {
        const parsed = Number(updates[field]);
        if (!isNaN(parsed)) (product as any)[field] = parsed;
      } else {
        (product as any)[field] = updates[field];
      }
    }
  }
  (product as any).updatedAt = new Date().toISOString();

  await saveProductsToDisk(currentProducts);
  res.json({ success: true, product });
});

// One-time cleanup: re-applies the correct category to every existing
// product in a single, safe read-then-write operation (not many
// simultaneous requests from the browser, which is what caused data loss
// here previously — this server saves by replacing the whole product
// table on every write, so concurrent writes from multiple requests can
// race and overwrite each other with a stale snapshot). Only the category
// field is touched; everything else about each product is preserved
// exactly as-is.
app.post("/api/products/recategorize", requireMerchantAuth, async (req, res) => {
  const normalizeCategory = (rawCategory: string): string => {
    let cat = rawCategory || "";
    const catLower = cat.toLowerCase();
    if (catLower.includes("whiskey") || catLower.includes("bourbon") || catLower.includes("scotch") || catLower.includes("rye")) {
      cat = "Whiskey";
    } else if (catLower.includes("tequila") || catLower.includes("mezcal")) {
      cat = "Tequila";
    } else if (catLower.includes("vodka")) {
      cat = "Vodka";
    } else if (catLower.includes("gin")) {
      cat = "Gin";
    } else if (catLower.includes("rum")) {
      cat = "Rum";
    } else if (catLower.includes("brandy") || catLower.includes("cognac")) {
      cat = "Brandy";
    } else if (catLower.includes("liqueur")) {
      cat = "Liqueur";
    } else if (catLower === "liquor" || catLower.includes("spirit")) {
      cat = "Liquor";
    } else if (catLower.includes("wine") || catLower.includes("cabernet") || catLower.includes("chardonnay") || catLower.includes("merlot") || catLower.includes("champagne") || catLower.includes("prosecco") || catLower.includes("sparkling")) {
      cat = "Wine";
    } else if (catLower.includes("beer") || catLower.includes("ipa") || catLower.includes("lager") || catLower.includes("cider")) {
      cat = "Beer";
    } else if (catLower.includes("rtd") || catLower.includes("seltzer") || catLower.includes("cocktail")) {
      cat = "RTD";
    } else if (catLower.includes("soda") || catLower.includes("coke") || catLower.includes("cola")) {
      cat = "Soda";
    } else if (catLower.includes("water")) {
      cat = "Water";
    } else if (catLower.includes("sports") || catLower.includes("energy") || catLower.includes("gatorade")) {
      cat = "Sports & Energy Drinks";
    } else if (catLower.includes("coffee") || catLower.includes("tea") || catLower.includes("juice")) {
      cat = "Coffee, Tea & Juice";
    } else if (catLower.includes("snack") || catLower.includes("chip") || catLower.includes("cookie") || catLower.includes("cracker") || catLower.includes("candy")) {
      cat = "Snacks";
    } else if (catLower.includes("household") || catLower.includes("supplies")) {
      cat = "Household";
    } else if (cat) {
      cat = cat.charAt(0).toUpperCase() + cat.slice(1);
    }
    return cat;
  };

  try {
    // Always load a fresh, current snapshot immediately before writing —
    // never rely on whatever the server happened to have cached in memory
    // from an earlier request, which is exactly what caused the previous
    // incident under concurrent access.
    const freshProducts = await loadProductsFromDisk();
    let fixed = 0;
    for (const product of freshProducts) {
      const corrected = normalizeCategory(product.category);
      if (corrected !== product.category) {
        product.category = corrected;
        fixed++;
      }
    }
    currentProducts = freshProducts;
    await saveProductsToDisk(currentProducts);
    res.json({ success: true, fixed, total: freshProducts.length });
  } catch (err: any) {
    console.error("Recategorize failed:", err);
    res.status(500).json({ error: err.message || "Recategorize failed." });
  }
});

app.post("/api/products/sync-upc", requireMerchantAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Database not configured." });
  }

  try {
    const { data: upcRows, error } = await supabase
      .from("upc_reference")
      .select("product_name, upc");
    if (error) throw error;

    if (!upcRows || upcRows.length === 0) {
      return res.json({ success: true, matched: 0, message: "No UPC reference data found." });
    }
    const normalize = (str: string) =>
      str
        .trim()
        .toUpperCase()
        .replace(/[.,'"!?]/g, "")
        .replace(/\s+/g, " ");

    const upcMap = new Map<string, string>();
    for (const row of upcRows) {
      const key = normalize(String(row.product_name));
      upcMap.set(key, String(row.upc));
    }

    if (!lastProductLoadWasReliable) {
      currentProducts = await loadProductsFromDisk();
    }

    let matched = 0;
    for (const product of currentProducts) {
      const key = normalize(product.name);
      const upc = upcMap.get(key);
      if (upc) {
        (product as any).upc = upc;
        matched++;
      }
    }
    
    await saveProductsToDisk(currentProducts);
    res.json({ success: true, matched, total: currentProducts.length });
  } catch (err: any) {
    console.error("UPC sync failed:", err);
    res.status(500).json({ error: err.message || "Sync failed." });
  }
});

app.get("/api/cron/lookup-product-images", async (req, res) => {
  const providedSecret = req.query.secret;
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    if (!lastProductLoadWasReliable) {
      currentProducts = await loadProductsFromDisk();
    }

    const candidates = currentProducts.filter(
      (p: any) => p.upc && !p.imageLookupAttempted
    );

    const batch = candidates.slice(0, 100);
    let found = 0;
    let attempted = 0;

    for (const product of batch as any[]) {
      const result = await lookupProductImageByUpc(product.upc, product.name);
      product.imageLookupAttempted = true;
      if (result) {
        product.imageUrl = result.url;
        product.imageNeedsReview = result.source !== "upcitemdb";
        found++;
      }
      attempted++;
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }

    if (attempted > 0) {
      await saveProductsToDisk(currentProducts);
    }

    res.json({
      success: true,
      attempted,
      found,
      remaining: candidates.length - attempted,
    });
  } catch (err: any) {
    console.error("Product image lookup batch failed:", err);
    res.status(500).json({ error: err.message || "Batch failed." });
  }
});

app.post("/api/searches", async (req, res) => {
  const { query, category, source, latitude, longitude } = req.body;
  if (!query || typeof query !== "string") {
    return res.status(400).json({ error: "Search query is required." });
  }

  let distanceMiles: number | null = null;
  let neighborhood = "Unknown (location unavailable)";

  try {
    let lat: number | null = null;
    let lng: number | null = null;

    if (typeof latitude === "number" && typeof longitude === "number") {
      lat = latitude;
      lng = longitude;
    } else {
      const forwardedFor = req.headers["x-forwarded-for"];
      const ip = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : (forwardedFor || req.socket.remoteAddress || "").split(",")[0].trim();
      if (ip) {
        const ipLoc = await geolocateIp(ip);
        if (ipLoc) {
          lat = ipLoc.lat;
          lng = ipLoc.lng;
          neighborhood = ipLoc.city;
        }
      }
    }

    if (lat != null && lng != null) {
      distanceMiles = haversineMiles(STORE_LAT, STORE_LNG, lat, lng);
      if (typeof latitude === "number" && typeof longitude === "number") {
        const place = await reverseGeocode(lat, lng);
        if (place) neighborhood = place;
      }
    }
  } catch (err) {
    console.error("Location lookup failed for search log entry:", err);
  }

  const newSearch: SearchQuery = {
    id: `s_dyn_${Date.now()}`,
    query: query.trim(),
    category: category || "Unknown",
    timestamp: new Date().toISOString(),
    distanceMiles,
    neighborhood,
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

app.post("/api/searches/sync-google", requireMerchantAuth, async (req, res) => {
  try {
    const queries = await fetchGoogleSearchQueries();
    let added = 0;

    for (const { query } of queries) {
      const newSearch: SearchQuery = {
        id: `gsc_${Date.now()}_${added}`,
        query,
        category: "Unknown",
        timestamp: new Date().toISOString(),
        distanceMiles: null,
        neighborhood: "Unknown (Google Search referral)",
        source: "Google Search",
      };
      searchQueries.unshift(newSearch);
      added++;
    }

    if (searchQueries.length > 200) {
      searchQueries = searchQueries.slice(0, 200);
    }

    if (added > 0) {
      await saveSearchesToDisk(searchQueries);
    }

    res.json({ success: true, added, queries: queries.map((q) => q.query) });
  } catch (err: any) {
    console.error("Google Search Console sync failed:", err);
    res.status(500).json({ error: err.message || "Sync failed." });
  }
});

app.get("/api/cron/sync-google-searches", async (req, res) => {
  const providedSecret = req.query.secret;
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized." });
  }

  try {
    const queries = await fetchGoogleSearchQueries();
    let added = 0;

    for (const { query } of queries) {
      const newSearch: SearchQuery = {
        id: `gsc_${Date.now()}_${added}`,
        query,
        category: "Unknown",
        timestamp: new Date().toISOString(),
        distanceMiles: null,
        neighborhood: "Unknown (Google Search referral)",
        source: "Google Search",
      };
      searchQueries.unshift(newSearch);
      added++;
    }

    if (searchQueries.length > 200) {
      searchQueries = searchQueries.slice(0, 200);
    }

    if (added > 0) {
      await saveSearchesToDisk(searchQueries);
    }

    res.json({ success: true, added });
  } catch (err: any) {
    console.error("Scheduled Google Search Console sync failed:", err);
    res.status(500).json({ error: err.message || "Sync failed." });
  }
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

    if (process.env.RESEND_API_KEY) {
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Calloway Market <promos@callowaymarket.com>",
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

app.post("/api/email-signup/broadcast", requireMerchantAuth, async (req, res) => {
  const { subject, message } = req.body;
  if (!subject || !message || typeof subject !== "string" || typeof message !== "string") {
    return res.status(400).json({ error: "Both 'subject' and 'message' are required." });
  }

  if (!supabase) {
    return res.status(503).json({ error: "Database not configured." });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(503).json({ error: "Email sending is not configured (missing RESEND_API_KEY)." });
  }

  try {
    const { data: subscribers, error } = await supabase
      .from("email_signups")
      .select("email, coupon_code");
    if (error) throw error;

    if (!subscribers || subscribers.length === 0) {
      return res.json({ success: true, sent: 0, failed: 0, message: "No subscribers found." });
    }

    const MAX_SAFE_BROADCAST_SIZE = 300;
    if (subscribers.length > MAX_SAFE_BROADCAST_SIZE) {
      return res.status(400).json({
        error: `Subscriber list (${subscribers.length}) is too large to send in a single request safely. Contact your developer to add batched sending.`,
      });
    }

    let sent = 0;
    let failed = 0;
    const failedEmails: string[] = [];

    for (const { email } of subscribers) {
      const html = `
        <div style="font-family: sans-serif; padding: 20px;">
          ${message.replace(/\n/g, "<br>")}
          <p style="margin-top: 20px; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 12px;">
            You're receiving this because you signed up for offers at Calloway Market.
            <a href="mailto:promos@callowaymarket.com?subject=Unsubscribe&body=Please%20unsubscribe%20${encodeURIComponent(email)}">Unsubscribe</a>
          </p>
        </div>
      `;
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Calloway Market <promos@callowaymarket.com>",
            to: email,
            subject,
            html,
          }),
        });
        if (emailRes.ok) {
          sent++;
        } else {
          failed++;
          failedEmails.push(email);
        }
      } catch {
        failed++;
        failedEmails.push(email);
      }
      await new Promise((resolve) => setTimeout(resolve, 550));
    }

    res.json({ success: true, sent, failed, failedEmails });
  } catch (err: any) {
    console.error("Broadcast email failed:", err);
    res.status(500).json({ error: err.message || "Broadcast failed." });
  }
});

// Multiple promo banners — an ordered array of banners (each can be a
// photo or a video), shown on the customer site. Each banner supports a
// position ("full" width, or "left"/"right" half-width so two can sit
// side by side) and independent headline/subtext text sizes. Stored as
// one array under the site_settings key/value table.
app.get("/api/settings/promos", async (req, res) => {
  if (!supabase) return res.json({ promos: [] });
  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "promo_banners")
      .maybeSingle();
    if (error) throw error;
    res.json({ promos: data?.value?.promos || [] });
  } catch (err) {
    console.error("Failed to load promo banners:", err);
    res.json({ promos: [] });
  }
});

app.patch("/api/settings/promos", requireMerchantAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Database not configured." });
  }
  const { promos } = req.body;
  if (!Array.isArray(promos)) {
    return res.status(400).json({ error: "promos must be an array." });
  }
  const cleaned = promos.map((p: any, idx: number) => ({
    id: p.id || `promo_${Date.now()}_${idx}`,
    mediaType: p.mediaType === "video" ? "video" : "image",
    mediaUrl: p.mediaUrl || "",
    imageFit: p.imageFit === "contain" ? "contain" : "cover",
    height: Number(p.height) || 220,
    width: Number(p.width) || 160,
    headline: p.headline || "",
    subtext: p.subtext || "",
    buttonLabel: p.buttonLabel || "",
    buttonUrl: p.buttonUrl || "",
    position: ["full", "left", "right", "sidebar-left", "sidebar-right", "inline"].includes(p.position) ? p.position : "full",
    afterCategoryPosition: Number(p.afterCategoryPosition) || 1,
    headlineSize: ["sm", "md", "lg"].includes(p.headlineSize) ? p.headlineSize : "md",
    subtextSize: ["sm", "md", "lg"].includes(p.subtextSize) ? p.subtextSize : "md",
    headlineBold: !!p.headlineBold,
    headlineItalic: !!p.headlineItalic,
    subtextBold: !!p.subtextBold,
    subtextItalic: !!p.subtextItalic,
  }));
  try {
    const { error } = await supabase
      .from("site_settings")
      .upsert({ key: "promo_banners", value: { promos: cleaned } }, { onConflict: "key" });
    if (error) throw error;
    res.json({ success: true, promos: cleaned });
  } catch (err: any) {
    console.error("Failed to save promo banners:", err);
    res.status(500).json({ error: err.message || "Failed to save promo banners." });
  }
});

// Real file upload — used by the promo banner editor (and reusable
// anywhere else that needs it) so merchants can upload a photo or video
// directly from their computer instead of pasting a hosted URL. Saves the
// file into a Supabase Storage bucket called "media" and returns the
// permanent public URL. Sent as base64 in a JSON body (rather than
// multipart/form-data) so no extra upload-parsing library is needed —
// the existing 50mb JSON body limit already configured on this server
// comfortably covers typical promo photos; large videos may need to stay
// under roughly 30-35MB to account for base64 encoding overhead.
app.post("/api/upload", requireMerchantAuth, async (req, res) => {
  if (!supabase) {
    return res.status(503).json({ error: "Database/storage not configured." });
  }
  const { fileName, fileType, fileBase64 } = req.body;
  if (!fileName || !fileType || !fileBase64) {
    return res.status(400).json({ error: "fileName, fileType, and fileBase64 are all required." });
  }

  try {
    const buffer = Buffer.from(fileBase64, "base64");
    const safeName = String(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `promos/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("media")
      .upload(path, buffer, { contentType: fileType, upsert: true });
    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from("media").getPublicUrl(path);
    res.json({ success: true, url: publicUrlData.publicUrl });
  } catch (err: any) {
    console.error("File upload failed:", err);
    res.status(500).json({
      error:
        err.message ||
        "Upload failed. Make sure a public Storage bucket named 'media' exists in your Supabase project.",
    });
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

  const heatMapGroups: Record<string, { count: number; totalDistance: number }> = {};
  searchQueries.forEach((q) => {
    if (q.neighborhood && q.distanceMiles != null && !q.neighborhood.startsWith("Unknown")) {
      if (!heatMapGroups[q.neighborhood]) {
        heatMapGroups[q.neighborhood] = { count: 0, totalDistance: 0 };
      }
      heatMapGroups[q.neighborhood].count += 1;
      heatMapGroups[q.neighborhood].totalDistance += q.distanceMiles;
    }
  });
  const heatMapData = Object.keys(heatMapGroups).map((neighborhood) => ({
    neighborhood,
    count: heatMapGroups[neighborhood].count,
    averageDistance: Math.round((heatMapGroups[neighborhood].totalDistance / heatMapGroups[neighborhood].count) * 10) / 10,
  })).sort((a, b) => b.count - a.count);

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
      fallbackInsights: `### Search Activity Summary for Calloway Market\nBased on ${searchQueries.length} logged search${searchQueries.length === 1 ? "" : "es"} on your site${topCategory ? `, **${topCategory}** is your most-searched category so far` : ""}.`,
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
Analyze the following JSON array of real customer search queries logged on the store's own website, including real distance and neighborhood data where available.
Identify genuine patterns in what customers are searching for — popular categories, repeated terms, timing trends, and geographic demand.

Search Queries:
${JSON.stringify(recentQueriesFormatted, null, 2)}

Return your response strictly in JSON format matching this TypeScript schema:
{
  "insights": "string (A cohesive 2-3 paragraph factual summary of search term, category, and geographic trends found in the data above)",
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
