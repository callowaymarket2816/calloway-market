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

async function saveSearchesToDisk(searches: SearchQuery[]): Promise
