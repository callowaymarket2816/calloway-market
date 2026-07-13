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

// ---------------------------------------------------------------------------
// LOCATION TRACKING
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// GOOGLE SEARCH CONSOLE INTEGRATION
// ---------------------------------------------------------------------------
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
