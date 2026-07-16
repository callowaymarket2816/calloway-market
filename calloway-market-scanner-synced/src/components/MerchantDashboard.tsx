import React, { useState, useEffect, useRef } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend
} from "recharts";
import { 
  TrendingUp, RefreshCw, Sparkles, MapPin, Search, AlertTriangle, 
  Layers, Package, Compass, Brain, CheckCircle, Upload, Plus, Clipboard, Check, Globe, Download,
  Link2, FileText, X, AlertCircle, Database, Info, Percent, DollarSign, Clock, Trash2,
  PackageCheck, PackageX, Star, Pencil, Save, Video, Image as ImageIcon, ArrowUp, ArrowDown, ShoppingBag
} from "lucide-react";
import { AnalyticsSummary, AiInsightsResponse, Product } from "../types";
import { motion } from "motion/react";

interface MerchantDashboardProps {
  products: Product[];
  onRefreshAllData: () => void;
  onRunAiInsights: () => Promise<AiInsightsResponse & { needsApiKey?: boolean }>;
  searchCount: number;
  merchantKey: string;
}

interface PromoBanner {
  id: string;
  mediaType: "image" | "video";
  mediaUrl: string;
  imageFit: "cover" | "contain";
  height: number;
  width: number;
  headline: string;
  subtext: string;
  buttonLabel: string;
  buttonUrl: string;
  position: "full" | "left" | "right" | "sidebar-left" | "sidebar-right" | "inline";
  afterCategoryPosition: number;
  headlineSize: "sm" | "md" | "lg";
  subtextSize: "sm" | "md" | "lg";
  headlineBold: boolean;
  headlineItalic: boolean;
  subtextBold: boolean;
  subtextItalic: boolean;
}

export default function MerchantDashboard({ products, onRefreshAllData, onRunAiInsights, searchCount, merchantKey }: MerchantDashboardProps) {
  const [activityLogs, setActivityLogs] = useState<{ id: string; action: string; timestamp: string }[]>(() => {
    try {
      const stored = localStorage.getItem("calloway_activity_logs");
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error(e);
    }
    const now = Date.now();
    return [
      { id: "init", action: "Bakersfield inventory portal launched", timestamp: new Date(now - 120000).toLocaleTimeString() },
      { id: "analytics-load", action: "Loaded organic market demand data", timestamp: new Date(now - 60000).toLocaleTimeString() },
      { id: "ready", action: "Showroom catalog synchronized with DoorDash", timestamp: new Date(now - 30000).toLocaleTimeString() }
    ];
  });

  const logAction = (action: string) => {
    const newLog = {
      id: Math.random().toString(36).substring(2, 11),
      action,
      timestamp: new Date().toLocaleTimeString()
    };
    setActivityLogs(prev => {
      const updated = [newLog, ...prev].slice(0, 10);
      try {
        localStorage.setItem("calloway_activity_logs", JSON.stringify(updated));
      } catch (e) {
        console.error(e);
      }
      return updated;
    });
  };

  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [aiReport, setAiReport] = useState<AiInsightsResponse & { needsApiKey?: boolean } | null>(null);
  const [isLoadingAnalytics, setIsLoadingAnalytics] = useState(true);
  const [isLoadingAi, setIsLoadingAi] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demandFilter, setDemandFilter] = useState<"all" | "google" | "website">("all");

  // Inventory Upload Portal States
  const [uploadTab, setUploadTab] = useState<"manual" | "bulk" | "smart">("smart");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadMarkupMargin, setUploadMarkupMargin] = useState<number>(20); // Applied Store Pricing Markup
  const [autoPublish, setAutoPublish] = useState<boolean>(true); // Skip manual preview step, publish instantly

  // Manual Form States
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("Whiskey");
  const [newOrigin, setNewOrigin] = useState("");
  const [newAbv, setNewAbv] = useState("40%");
  const [newSize, setNewSize] = useState("750ml");
  const [newStockStatus, setNewStockStatus] = useState("In Stock");
  const [newTastingNotes, setNewTastingNotes] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFoodPairing, setNewFoodPairing] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newUpc, setNewUpc] = useState("");

  // Bulk Paste State
  const [bulkText, setBulkText] = useState("");

  // Google Sheets & Drag-and-Drop States
  const [sheetUrl, setSheetUrl] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [parsedPreviewItems, setParsedPreviewItems] = useState<any[]>([]);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  // Inventory Deletion States
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [isTogglingStockId, setIsTogglingStockId] = useState<string | null>(null);
  const [isTogglingFeaturedId, setIsTogglingFeaturedId] = useState<string | null>(null);

  // Inline product editing — name, category, price, and other fields.
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const openEditModal = (product: Product) => {
    setEditingProduct(product);
    setEditForm({
      name: product.name,
      category: product.category,
      origin: product.origin || "",
      abv: product.abv || "",
      size: product.size || "",
      price: product.price ?? "",
      storePrice: (product as any).storePrice ?? "",
      stockStatus: product.stockStatus,
      description: product.description || "",
      foodPairing: product.foodPairing || "",
      tastingNotes: product.tastingNotes ? product.tastingNotes.join(", ") : "",
      imageUrl: (product as any).imageUrl || "",
      upc: (product as any).upc || "",
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSavingEdit(true);
    try {
      const payload: any = {
        name: editForm.name,
        category: editForm.category,
        origin: editForm.origin,
        abv: editForm.abv,
        size: editForm.size,
        stockStatus: editForm.stockStatus,
        description: editForm.description,
        foodPairing: editForm.foodPairing,
        tastingNotes: editForm.tastingNotes,
        imageUrl: editForm.imageUrl,
        upc: editForm.upc,
      };
      if (editForm.price !== "") payload.price = editForm.price;
      if (editForm.storePrice !== "") payload.storePrice = editForm.storePrice;

      const res = await fetch(`/api/products/${editingProduct.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setUploadMessage(`"${editForm.name}" was updated successfully.`);
        logAction(`Edited product details: "${editForm.name}"`);
        setEditingProduct(null);
        onRefreshAllData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setUploadMessage(errData.error || "Failed to save changes.");
      }
    } catch (err: any) {
      setUploadMessage(`Error saving changes: ${err.message || err}`);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Barcode scanner — designed for a physical USB/Bluetooth barcode
  // scanner, which works by "typing" the scanned digits into whatever text
  // field is focused, followed by an Enter key. No camera or special
  // library needed — just an always-ready, auto-focused input field.
  // If the code matches an existing product, opens that product's edit
  // form directly. If no match is found, switches to the Manual Bottle
  // Entry tab with the scanned UPC pre-filled so it can be added as new.
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scanInputValue, setScanInputValue] = useState("");
  const scanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isScannerOpen && scanInputRef.current) {
      scanInputRef.current.focus();
    }
  }, [isScannerOpen]);

  const handleScanInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const upc = scanInputValue.trim();
      if (upc) {
        handleBarcodeDetected(upc);
      }
      setScanInputValue("");
    }
  };

  // Strips leading zeros before comparing UPCs. This matters because many
  // barcode scanners output a 12-digit UPC-A code as a 13-digit EAN-13 by
  // adding a leading zero (UPC-A is technically a subset of EAN-13) — so a
  // scanned "0888109050047" needs to still match a stored "888109050047".
  const normalizeUpc = (code: string) => String(code).replace(/^0+/, "");

  const handleBarcodeDetected = (upc: string) => {
    setIsScannerOpen(false);
    const normalizedScanned = normalizeUpc(upc);
    const match = products.find(
      (p: any) => p.upc && normalizeUpc(p.upc) === normalizedScanned
    );
    if (match) {
      setUploadMessage(`Found existing product for UPC ${upc}: "${match.name}". Opening its edit form.`);
      openEditModal(match);
    } else {
      setUploadTab("manual");
      setNewUpc(upc);
      setUploadMessage(`No existing product found for UPC ${upc}. Fill in the details below to add it as new.`);
      logAction(`Scanned new UPC not yet in inventory: ${upc}`);
    }
  };
  const [promos, setPromos] = useState<PromoBanner[]>([]);
  const [isLoadingPromos, setIsLoadingPromos] = useState(true);
  const [isSavingPromos, setIsSavingPromos] = useState(false);
  const [promoMessage, setPromoMessage] = useState<string | null>(null);
  const [uploadingMediaId, setUploadingMediaId] = useState<string | null>(null);

  const handleMediaFileUpload = async (promoId: string, file: File) => {
    setUploadingMediaId(promoId);
    setPromoMessage(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip the "data:<mime>;base64," prefix — the server only needs
          // the raw base64 payload plus the file's type/name separately.
          const commaIdx = result.indexOf(",");
          resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
        };
        reader.onerror = () => reject(new Error("Could not read the selected file."));
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ fileName: file.name, fileType: file.type, fileBase64: base64 }),
      });

      if (res.ok) {
        const data = await res.json();
        updatePromo(promoId, "mediaUrl", data.url);
        setPromoMessage("File uploaded! Remember to click Save All Promo Banners to publish it.");
      } else {
        const errData = await res.json().catch(() => ({}));
        setPromoMessage(errData.error || "Upload failed.");
      }
    } catch (err: any) {
      setPromoMessage(`Upload error: ${err.message || err}`);
    } finally {
      setUploadingMediaId(null);
    }
  };

  useEffect(() => {
    fetch("/api/settings/promos")
      .then((r) => r.json())
      .then((data) => setPromos(data.promos || []))
      .catch(() => {})
      .finally(() => setIsLoadingPromos(false));
  }, []);

  const addPromo = () => {
    setPromos((prev) => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        mediaType: "image",
        mediaUrl: "",
        imageFit: "cover",
        height: 220,
        width: 160,
        headline: "",
        subtext: "",
        buttonLabel: "",
        buttonUrl: "",
        position: "full",
        afterCategoryPosition: 1,
        headlineSize: "md",
        subtextSize: "md",
        headlineBold: true,
        headlineItalic: false,
        subtextBold: false,
        subtextItalic: false,
      },
    ]);
  };

  const updatePromo = (id: string, field: keyof PromoBanner, value: any) => {
    setPromos((prev) => prev.map((p) => (p.id === id ? { ...p, [field]: value } : p)));
  };

  const removePromo = (id: string) => {
    setPromos((prev) => prev.filter((p) => p.id !== id));
  };

  const movePromo = (id: string, direction: -1 | 1) => {
    setPromos((prev) => {
      const idx = prev.findIndex((p) => p.id === id);
      const targetIdx = idx + direction;
      if (idx === -1 || targetIdx < 0 || targetIdx >= prev.length) return prev;
      const updated = [...prev];
      const temp = updated[idx];
      updated[idx] = updated[targetIdx];
      updated[targetIdx] = temp;
      return updated;
    });
  };

  const handleSavePromos = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingPromos(true);
    setPromoMessage(null);
    try {
      const res = await fetch("/api/settings/promos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ promos }),
      });
      if (res.ok) {
        const data = await res.json();
        setPromos(data.promos || []);
        setPromoMessage("Promo banners saved! They're now live on your customer site.");
        logAction("Updated customer-facing promo banners");
      } else {
        const errData = await res.json().catch(() => ({}));
        setPromoMessage(errData.error || "Failed to save promo banners.");
      }
    } catch (err: any) {
      setPromoMessage(`Error saving promo banners: ${err.message || err}`);
    } finally {
      setIsSavingPromos(false);
    }
  };

  // Delete all inventory on server
  const handleDeleteAllInventory = async () => {
    if (!window.confirm("Are you absolutely sure you want to delete ALL inventory? This action is irreversible and will empty the customer showroom catalog.")) {
      return;
    }
    
    setIsDeletingAll(true);
    try {
      const res = await fetch("/api/products", {
        method: "DELETE",
        headers: { "X-Merchant-Key": merchantKey },
      });
      if (res.ok) {
        setUploadMessage("All inventory was successfully deleted from the Bakersfield showroom database.");
        logAction("CLEARED ENTIRE SHOWROOM INVENTORY CATALOG");
        onRefreshAllData();
      } else {
        setUploadMessage("Failed to delete inventory. Please try again.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadMessage(`Error deleting inventory: ${err.message || err}`);
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Delete a single product
  const handleDeleteProduct = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from the active stock?`)) {
      return;
    }
    setIsDeletingId(id);
    try {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        headers: { "X-Merchant-Key": merchantKey },
      });
      if (res.ok) {
        setUploadMessage(`"${name}" was successfully removed from the active stock.`);
        logAction(`Removed item: "${name}"`);
        onRefreshAllData();
      } else {
        setUploadMessage("Failed to delete the selected product.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadMessage(`Error removing product: ${err.message || err}`);
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleToggleStock = async (id: string, name: string, currentStatus: string) => {
    setIsTogglingStockId(id);
    try {
      const res = await fetch(`/api/products/${id}/stock`, {
        method: "PATCH",
        headers: { "X-Merchant-Key": merchantKey },
      });
      if (res.ok) {
        const result = await res.json();
        setUploadMessage(`"${name}" marked as ${result.stockStatus}.`);
        logAction(`Toggled stock for "${name}": ${currentStatus} → ${result.stockStatus}`);
        onRefreshAllData();
      } else {
        setUploadMessage("Failed to update stock status.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadMessage(`Error updating stock status: ${err.message || err}`);
    } finally {
      setIsTogglingStockId(null);
    }
  };

  const handleToggleFeatured = async (id: string, name: string, currentlyFeatured: boolean) => {
    setIsTogglingFeaturedId(id);
    try {
      const res = await fetch(`/api/products/${id}/featured`, {
        method: "PATCH",
        headers: { "X-Merchant-Key": merchantKey },
      });
      if (res.ok) {
        const result = await res.json();
        setUploadMessage(
          result.featured
            ? `"${name}" added to Featured This Month.`
            : `"${name}" removed from Featured This Month.`
        );
        logAction(`Toggled featured for "${name}": ${currentlyFeatured} → ${result.featured}`);
        onRefreshAllData();
      } else {
        setUploadMessage("Failed to update featured status.");
      }
    } catch (err: any) {
      console.error(err);
      setUploadMessage(`Error updating featured status: ${err.message || err}`);
    } finally {
      setIsTogglingFeaturedId(null);
    }
  };

  // Inventory Filtering States
  const [manageSearchQuery, setManageSearchQuery] = useState("");
  const [manageCategoryFilter, setManageCategoryFilter] = useState("All");
  const [showMissingUpcOnly, setShowMissingUpcOnly] = useState(false);

  // Smart Parser for CSV and Google Sheets
  // Brand-name lookups used as a fallback when a product's category is a
  // generic bucket ("Liquor") and its raw category text has no specific
  // spirit-type keyword left to detect — which is exactly the situation
  // for products whose original spreadsheet only ever had one "Liquor"
  // sheet with no further breakdown. In that case, the only remaining
  // signal for what kind of spirit something actually is lives in its
  // product NAME (both generic words like "whiskey", and specific brand
  // names like "Jack Daniels" or "Patron").
  const WHISKEY_BRANDS = ["jack daniel", "jim beam", "crown royal", "jameson", "maker's mark", "makers mark", "buffalo trace", "wild turkey", "evan williams", "seagram's 7", "seagrams 7", "fireball", "canadian club", "dewar's", "dewars", "johnnie walker", "chivas", "glenlivet", "glenfiddich", "knob creek", "woodford", "bulleit", "ezra brooks", "old forester", "four roses", "jack daniel's", "1792", "elijah craig", "basil hayden", "crown apple"];
  const TEQUILA_BRANDS = ["patron", "don julio", "jose cuervo", "hornitos", "espolon", "casamigos", "herradura", "milagro", "cazadores", "sauza", "olmeca", "1800", "clase azul", "avion"];
  const VODKA_BRANDS = ["smirnoff", "tito's", "titos", "grey goose", "absolut", "svedka", "ketel one", "stolichnaya", "stoli", "skyy", "pinnacle", "new amsterdam", "deep eddy", "belvedere", "ciroc"];
  const GIN_BRANDS = ["tanqueray", "bombay", "beefeater", "hendrick's", "hendricks", "gordon's", "gordons", "seagram's gin", "seagrams gin"];
  const RUM_BRANDS = ["bacardi", "captain morgan", "malibu", "myers", "mount gay", "kraken", "sailor jerry", "cruzan"];
  const BRANDY_BRANDS = ["hennessy", "courvoisier", "remy martin", "martell", "e&j", "e & j", "christian brothers", "paul masson"];
  const LIQUEUR_BRANDS = ["baileys", "bailey's", "kahlua", "grand marnier", "cointreau", "disaronno", "jagermeister", "jägermeister", "southern comfort", "amaretto", "triple sec", "chambord", "frangelico", "midori"];

  const guessSpiritTypeFromName = (name: string): string | null => {
    const n = (name || "").toLowerCase();
    if (n.includes("whiskey") || n.includes("whisky") || n.includes("bourbon") || n.includes("scotch") || n.includes("rye") || WHISKEY_BRANDS.some((b) => n.includes(b))) return "Whiskey";
    if (n.includes("tequila") || n.includes("mezcal") || TEQUILA_BRANDS.some((b) => n.includes(b))) return "Tequila";
    if (n.includes("vodka") || VODKA_BRANDS.some((b) => n.includes(b))) return "Vodka";
    if (n.includes(" gin ") || n.startsWith("gin ") || n.endsWith(" gin") || GIN_BRANDS.some((b) => n.includes(b))) return "Gin";
    if (n.includes("rum") || RUM_BRANDS.some((b) => n.includes(b))) return "Rum";
    if (n.includes("brandy") || n.includes("cognac") || BRANDY_BRANDS.some((b) => n.includes(b))) return "Brandy";
    if (n.includes("liqueur") || n.includes("schnapps") || LIQUEUR_BRANDS.some((b) => n.includes(b))) return "Liqueur";
    return null;
  };

  // Maps a raw/messy category string (from a spreadsheet, or an existing
  // product's current category) to the correct real department name.
  // Shared by both the CSV import parser and the "Fix Existing Categories"
  // one-time cleanup button, so both use the exact same logic. Accepts the
  // product name too, since a generic category like "Liquor" often has no
  // specific spirit-type info left in the category text itself — the name
  // is the only remaining place that information can come from.
  const normalizeCategory = (rawCategory: string, productName: string = ""): string => {
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
      // Generic bucket with no specific type in the category text itself —
      // try to work out the real spirit type from the product name instead.
      cat = guessSpiritTypeFromName(productName) || "Liquor";
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

  // One-time cleanup: re-applies the correct category to every EXISTING
  // product already in live inventory, without re-uploading anything (so
  // there's no risk of creating duplicates). Only products whose computed
  // category actually differs from their current one get updated; prices,
  // names, descriptions, and everything else is left untouched.
  const [isRecategorizing, setIsRecategorizing] = useState(false);

  const handleRecategorizeAll = async () => {
    const needsFix = (products || []).filter((p) => normalizeCategory(p.category) !== p.category);
    if (needsFix.length === 0) {
      setUploadMessage("Every product's category already matches the correct department — nothing to fix.");
      return;
    }
    if (
      !window.confirm(
        `${needsFix.length} product(s) will have their category corrected (e.g. moved from "Liquor" into "Whiskey"/"Tequila"/"Rum"/etc). Nothing else about these products changes. Continue?`
      )
    ) {
      return;
    }

    setIsRecategorizing(true);
    setUploadMessage(null);

    try {
      // Runs as a single, safe operation on the server — one read of the
      // current live data, one write back — instead of many simultaneous
      // requests from the browser, which previously caused a real data-loss
      // incident on this server's delete-and-rewrite save pattern.
      const res = await fetch("/api/products/recategorize", {
        method: "POST",
        headers: { "X-Merchant-Key": merchantKey },
      });
      if (res.ok) {
        const data = await res.json();
        setUploadMessage(`Successfully recategorized ${data.fixed} product(s) into their correct departments.`);
        logAction(`Fixed categories on ${data.fixed} existing products (moved out of generic "Liquor" into specific spirit types)`);
        onRefreshAllData();
      } else {
        const errData = await res.json().catch(() => ({}));
        setUploadMessage(errData.error || "Failed to fix categories.");
      }
    } catch (err: any) {
      setUploadMessage(`Error fixing categories: ${err.message || err}`);
    } finally {
      setIsRecategorizing(false);
    }
  };

  const parseCSV = (text: string) => {
    // Clean UTF-8 BOM
    text = text.replace(/^\ufeff/i, "").trim();
    if (!text) return [];

    // Split into raw lines handling quotes
    const lines: string[] = [];
    let currentLine = "";
    let insideQuote = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        insideQuote = !insideQuote;
      } else if (char === '\n' && !insideQuote) {
        lines.push(currentLine);
        currentLine = "";
      } else if (char === '\r' && !insideQuote) {
        // Skip carriage return
      } else {
        currentLine += char;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }

    if (lines.length === 0) return [];

    // Auto-detect delimiter from the first line
    const firstLine = lines[0];
    let delimiter = ",";
    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;

    if (semicolons > commas && semicolons > tabs) {
      delimiter = ";";
    } else if (tabs > commas && tabs > semicolons) {
      delimiter = "\t";
    }

    const parseCSVLine = (line: string, delim: string) => {
      const cells: string[] = [];
      let currentCell = "";
      let inQuote = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuote = !inQuote;
        } else if (char === delim && !inQuote) {
          cells.push(currentCell.trim());
          currentCell = "";
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim());
      return cells.map(cell => {
        if (cell.startsWith('"') && cell.endsWith('"')) {
          return cell.slice(1, -1).replace(/""/g, '"').trim();
        }
        return cell;
      });
    };

    const firstRowCells = parseCSVLine(lines[0], delimiter);
    const headerKeywords = ["name", "product", "spirit", "bottle", "category", "abv", "alcohol", "size", "volume", "stock", "status", "origin", "distillery", "notes", "tasting", "description", "price", "cost", "msrp", "wholesale", "value", "rate", "usd"];
    
    const hasHeader = firstRowCells.some(cell => {
      const val = cell.toLowerCase().trim();
      return headerKeywords.some(keyword => val.includes(keyword));
    });

    let headers: string[] = [];
    let startIdx = 0;

    if (hasHeader) {
      headers = firstRowCells.map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
      startIdx = 1;
    } else {
      headers = [];
      startIdx = 0;
    }

    const parsedRows: any[] = [];

    for (let l = startIdx; l < lines.length; l++) {
      const rowLine = lines[l].trim();
      if (!rowLine) continue;
      const cells = parseCSVLine(rowLine, delimiter);
      if (cells.length === 0 || !cells[0]) continue;

      const p: any = {};
      
      if (hasHeader && headers.length > 0) {
        headers.forEach((header, index) => {
          const val = cells[index] || "";
          if (header.includes("name") || header === "product" || header === "spirit" || header === "bottle" || header === "title") {
            p.name = val;
          } else if (header.includes("category") || header === "type") {
            p.category = val;
          } else if (header.includes("origin") || header.includes("distillery") || header === "source" || header === "maker" || header === "location") {
            p.origin = val;
          } else if (header.includes("abv") || header.includes("alcohol") || header.includes("proof") || header === "percent") {
            p.abv = val;
          } else if (header.includes("size") || header.includes("volume") || header === "ml" || header === "bottle_size") {
            p.size = val;
          } else if (header.includes("stock") || header === "status" || header === "availability" || header === "qty" || header === "quantity") {
            p.stockStatus = val;
          } else if (header.includes("notes") || header.includes("tasting") || header === "flavors" || header === "taste") {
            p.tastingNotes = val;
          } else if (header.includes("desc")) {
            p.description = val;
          } else if (header.includes("pair")) {
            p.foodPairing = val;
          } else if (header.includes("price") || header.includes("cost") || header.includes("msrp") || header.includes("wholesale") || header.includes("value") || header === "rate" || header === "usd") {
            p.rawPrice = val;
          }
        });
      }

      if (!p.name && cells[0]) {
        p.name = cells[0];
        p.category = cells[1] || "Whiskey";
        p.size = cells[2] || "750ml";
        p.stockStatus = cells[3] || "In Stock";
        p.origin = cells[4] || "Bakersfield Import Selection";
        p.abv = cells[5] || "40%";
        p.tastingNotes = cells[6] || "";
        p.description = cells[7] || "";
        p.rawPrice = cells[8] || "";
      }

      if (p.name) {
        let stock = p.stockStatus || "In Stock";
        const stockLower = stock.toLowerCase();
        if (stockLower.includes("out") || stockLower === "no" || stockLower === "0" || stockLower === "sold") {
          stock = "Out of Stock";
        } else if (stockLower.includes("limit") || stockLower.includes("few") || stockLower.includes("low")) {
          stock = "Limited Stock";
        } else if (stockLower.includes("special") || stockLower.includes("order")) {
          stock = "Special Order Only";
        } else {
          stock = "In Stock";
        }

        const cat = normalizeCategory(p.category || "");

        let calculatedFinalPrice: number | undefined = undefined;
        if (p.rawPrice) {
          const cleaned = String(p.rawPrice).replace(/[^0-9.]/g, "");
          const parsedNum = parseFloat(cleaned);
          if (parsedNum > 0) {
            calculatedFinalPrice = Math.round(parsedNum * (1 + uploadMarkupMargin / 100) * 100) / 100;
          }
        }

        parsedRows.push({
          name: p.name,
          category: cat,
          origin: p.origin || "",
          abv: p.abv || "",
          size: p.size || "",
          stockStatus: stock,
          tastingNotes: p.tastingNotes ? String(p.tastingNotes).split(/[|;,]/).map(t => t.trim()).filter(Boolean) : [],
          description: p.description || "",
          foodPairing: p.foodPairing || "",
          imageColor: "from-indigo-950 to-slate-900",
          iconName: "Package",
          price: calculatedFinalPrice,
          marginPercent: uploadMarkupMargin
        });
      }
    }

    return parsedRows;
  };

  const getGoogleSheetsCsvUrl = (url: string) => {
    url = url.trim();
    
    if (url.includes("output=csv") || url.includes("format=csv")) {
      return url;
    }

    if (url.includes("/spreadsheets/d/e/")) {
      const match = url.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]+)/);
      if (match) {
        const publishId = match[1];
        return `https://docs.google.com/spreadsheets/d/e/${publishId}/pub?output=csv`;
      }
    }

    const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (idMatch) {
      const spreadsheetId = idMatch[1];
      
      let gid = "0";
      const gidMatch = url.match(/gid=([0-9]+)/);
      if (gidMatch) {
        gid = gidMatch[1];
      }
      
      return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
    }

    return url;
  };

  const handleSheetImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sheetUrl.trim()) return;

    setIsFetchingSheet(true);
    setUploadMessage(null);
    setParsedPreviewItems([]);

    try {
      const exportUrl = getGoogleSheetsCsvUrl(sheetUrl);
      
      const response = await fetch("/api/proxy-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ url: exportUrl })
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to fetch spreadsheet. Confirm that the Google Sheet sharing setting is set to 'Anyone with the link can view'.");
      }

      const data = await response.json();
      if (!data.csvData) {
        throw new Error("No CSV export data received. Please verify the URL or ensure 'Anyone with the link can view' is active.");
      }

      const parsed = parseCSV(data.csvData);
      if (parsed.length === 0) {
        throw new Error("No valid products could be parsed from the spreadsheet columns. Verify column headers or row values.");
      }

      if (autoPublish) {
        confirmParsedImport(parsed);
      } else {
        setParsedPreviewItems(parsed);
        setUploadMessage(`Successfully parsed ${parsed.length} products from your Google Sheet! Please review the summary and click import below.`);
      }
    } catch (err: any) {
      setUploadMessage(`Google Sheets Sync Failed: ${err.message}`);
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      handleFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      handleFile(file);
    }
  };

  const handleFile = (file: File) => {
    setUploadMessage(null);
    setParsedPreviewItems([]);
    
    const fileName = file.name;
    const isCsv = fileName.toLowerCase().endsWith(".csv");
    const isJson = fileName.toLowerCase().endsWith(".json");

    if (!isCsv && !isJson) {
      setUploadMessage("Format Error: Only .csv and .json files are accepted.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        if (!text) throw new Error("File content is empty.");

        let parsed: any[] = [];
        if (isJson) {
          const raw = JSON.parse(text);
          const rawArray = Array.isArray(raw) ? raw : [raw];
          parsed = rawArray.map(item => ({
            name: item.name || item.ProductName || item.spirit || "",
            category: item.category || item.Category || "",
            origin: item.origin || item.Origin || item.distillery || item.Distillery || "",
            abv: item.abv || item.ABV || "",
            size: item.size || item.Size || "",
            stockStatus: item.stockStatus || item.StockStatus || "In Stock",
            tastingNotes: Array.isArray(item.tastingNotes) 
              ? item.tastingNotes 
              : (item.tastingNotes ? String(item.tastingNotes).split(",").map((t: string) => t.trim()) : []),
            description: item.description || item.Description || "Luxury reserve bottle added to showcase catalog.",
            foodPairing: item.foodPairing || item.FoodPairing || "Assorted light bites",
            imageColor: "from-indigo-950 to-slate-900",
            iconName: "Wine"
          }));
        } else {
          parsed = parseCSV(text);
        }

        if (parsed.length === 0) {
          throw new Error("No product listings parsed from file rows.");
        }

        if (autoPublish) {
          confirmParsedImport(parsed);
        } else {
          setParsedPreviewItems(parsed);
          setUploadMessage(`Successfully parsed ${parsed.length} products from local file "${fileName}"!`);
        }
      } catch (err: any) {
        setUploadMessage(`Local File Parse Failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const confirmParsedImport = async (itemsOverride?: any[]) => {
    const items = Array.isArray(itemsOverride) ? itemsOverride : parsedPreviewItems;
    if (items.length === 0) return;

    setIsUploading(true);
    setUploadMessage(null);

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ products: items }),
      });

      if (res.ok) {
        const reply = await res.json();
        setUploadMessage(`Success! Published ${reply.count} products to the live Bakersfield showroom catalog with +${uploadMarkupMargin}% pricing markup applied!`);
        setParsedPreviewItems([]);
        setSheetUrl("");
        onRefreshAllData();
        logAction(`Imported & published ${reply.count} showroom items (Markup: +${uploadMarkupMargin}%)`);
      } else {
        let errMsg = "Failed to post parsed listings to the showroom.";
        try {
          const errData = await res.json();
          if (errData && errData.error) {
            errMsg = errData.error;
          }
        } catch (_) {
          try {
            const text = await res.text();
            if (text) errMsg = text;
          } catch (_) {}
        }
        throw new Error(errMsg);
      }
    } catch (e: any) {
      setUploadMessage(`Catalog Publish Failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const downloadProductsCsv = () => {
    if (!products || products.length === 0) return;

    const headers = [
      "Product ID",
      "Name",
      "Category",
      "Origin/Distillery",
      "ABV",
      "Size",
      "Stock Status",
      "Tasting Notes",
      "Description"
    ];

    const rows = products.map((p) => [
      p.id,
      p.name,
      p.category,
      p.origin || "N/A",
      p.abv || "N/A",
      p.size || "N/A",
      p.stockStatus,
      p.tastingNotes ? p.tastingNotes.join(" | ") : "N/A",
      p.description || "N/A"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            const escaped = String(val).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `calloway_product_catalog_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadDemandLogsCsv = () => {
    if (!analytics || !analytics.recentSearches || analytics.recentSearches.length === 0) return;

    const headers = [
      "Inquiry ID",
      "Query Term",
      "Category",
      "Source/Channel",
      "Timestamp",
      "Bakersfield Neighborhood"
    ];

    const rows = analytics.recentSearches.map((s) => [
      s.id,
      s.query,
      s.category || "N/A",
      s.source,
      s.timestamp,
      s.location || "N/A"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            const escaped = String(val).replace(/"/g, '""');
            return `"${escaped}"`;
          })
          .join(",")
      )
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `calloway_demand_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadSampleTemplateCsv = () => {
    const headers = [
      "Name", "Category", "Size", "Stock Status", "Origin", "ABV", "Tasting Notes", "Description", "Cost / Price"
    ];
    const rows = [
      [
        "Macallan 18 Year Double Cask",
        "Whiskey",
        "750ml",
        "In Stock",
        "Speyside, Scotland",
        "43%",
        "Dried fruit | Sweet ginger | Toffee | Rich orange",
        "An iconic single malt Scotch whisky matured in sherry-seasoned American and European oak casks.",
        "149.99"
      ],
      [
        "Clase Azul Reposado Tequila",
        "Tequila",
        "750ml",
        "Limited Stock",
        "Jalisco, Mexico",
        "40%",
        "Hazelnut | Vanilla | Cloves | Smooth Agave",
        "A symbol of Mexican tradition and culture, made with slow-cooked 100% Blue Weber Agave.",
        "119.99"
      ],
      [
        "Dom Perignon Vintage Champagne",
        "Champagne",
        "750ml",
        "Special Order Only",
        "Champagne, France",
        "12.5%",
        "White flowers | Stone fruit | Toasty brioche | Mineral",
        "A luxurious vintage champagne characterized by vibrant acidity, fine bubbles, and rich depth.",
        "229.99"
      ]
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "calloway_inventory_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleManualProductAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsUploading(true);
    setUploadMessage(null);

    const parsedPrice = parseFloat(newPrice);
    const calculatedFinalPrice = !isNaN(parsedPrice)
      ? Math.round(parsedPrice * (1 + uploadMarkupMargin / 100) * 100) / 100
      : undefined;

    const singleProduct = {
      name: newName,
      category: newCategory,
      origin: newOrigin || "",
      abv: newAbv || "",
      size: newSize || "",
      stockStatus: newStockStatus,
      tastingNotes: newTastingNotes ? newTastingNotes.split(",").map((t) => t.trim()) : [],
      description: newDescription || "",
      foodPairing: newFoodPairing || "",
      imageColor: "from-amber-950 to-slate-900",
      iconName: "Wine",
      price: calculatedFinalPrice,
      marginPercent: uploadMarkupMargin,
      upc: newUpc || undefined,
    };

    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ products: singleProduct }),
      });
      if (res.ok) {
        setUploadMessage(`Successfully added "${newName}" to active stock!`);
        logAction(`Manually registered spirit: "${newName}" (${newCategory})`);
        setNewName("");
        setNewOrigin("");
        setNewTastingNotes("");
        setNewDescription("");
        setNewFoodPairing("");
        setNewPrice("");
        setNewUpc("");
        onRefreshAllData();
      } else {
        throw new Error("Failed to register spirit.");
      }
    } catch (e: any) {
      setUploadMessage(`Upload Failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) return;

    setIsUploading(true);
    setUploadMessage(null);

    let parsedProducts = [];
    try {
      if (bulkText.trim().startsWith("[") || bulkText.trim().startsWith("{")) {
        const parsed = JSON.parse(bulkText);
        parsedProducts = Array.isArray(parsed) ? parsed : [parsed];
      } else {
        const lines = bulkText.split("\n");
        parsedProducts = lines
          .map((line) => {
            const parts = line.split(",").map((p) => p.trim());
            if (parts.length === 0 || !parts[0]) return null;
            return {
              name: parts[0],
              category: parts[1] || "",
              size: parts[2] || "",
              stockStatus: parts[3] || "In Stock",
              description: "",
              marginPercent: uploadMarkupMargin
            };
          })
          .filter(Boolean);
      }

      if (parsedProducts.length === 0) {
        throw new Error("Could not parse any valid product rows.");
      }

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ products: parsedProducts }),
      });

      if (res.ok) {
        const reply = await res.json();
        setUploadMessage(`Successfully imported ${reply.count} products into live inventory!`);
        logAction(`Batch imported ${reply.count} products via raw text pasting`);
        setBulkText("");
        onRefreshAllData();
      } else {
        throw new Error("Failed to batch import.");
      }
    } catch (e: any) {
      setUploadMessage(`Import Error: Ensure correct JSON syntax or comma-separated columns. Details: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // Fetch compiled analytics from backend
  const fetchAnalytics = async () => {
    setIsLoadingAnalytics(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/summary");
      if (!res.ok) throw new Error("Failed to load search logs from server.");
      const data = await res.json();
      setAnalytics(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong.");
    } finally {
      setIsLoadingAnalytics(false);
    }
  };

  // Trigger server-side Gemini AI demand audit
  const runAiAudit = async () => {
    setIsLoadingAi(true);
    try {
      const data = await onRunAiInsights();
      setAiReport(data);
      logAction("Gemini AI Market Insight scan completed successfully");
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsLoadingAi(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [searchCount]);

  useEffect(() => {
    if (analytics) {
      runAiAudit();
    }
  }, [analytics === null]);

  const handleManualRefresh = () => {
    fetchAnalytics();
    runAiAudit();
    onRefreshAllData();
    logAction("Triggered manual refresh of local catalog and audit metrics");
  };

  const CHART_COLORS = [
    "#78350f",
    "#9a3412",
    "#155e75",
    "#115e59",
    "#3730a3",
    "#86198f",
    "#9f1239",
    "#1e293b",
  ];

  const formatTimeAgo = (isoString: string) => {
    const past = new Date(isoString).getTime();
    const diffMs = Date.now() - past;
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    
    return new Date(isoString).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const activeCategories = analytics
    ? (demandFilter === "google"
        ? analytics.googlePopularCategories
        : demandFilter === "website"
          ? analytics.websitePopularCategories
          : analytics.popularCategories)
    : [];

  const activeBrands = analytics
    ? (demandFilter === "google"
        ? analytics.googlePopularBrands
        : demandFilter === "website"
          ? analytics.websitePopularBrands
          : [])
    : [];

  const activeCategoriesTotal = activeCategories.reduce((acc, cat) => acc + cat.value, 0);

  // Extracts real product-level buying intent from the search log: every
  // time a customer clicks "Add to Cart" or the Grubhub button on a
  // specific product, it gets logged as "DoorDash Redirect: <name>" or
  // "Grubhub Redirect: <name>". This counts those, per product, as the
  // closest honest proxy this system has for "what's actually moving" —
  // it is NOT connected to a cash register/POS, so this reflects real
  // clicked buying intent, not confirmed completed sales.
  const mostOrderedProducts = (() => {
    if (!analytics) return [];
    const counts: Record<string, number> = {};
    analytics.recentSearches.forEach((s) => {
      const match = s.query.match(/^(?:DoorDash|Grubhub) Redirect: (.+)$/);
      if (match && match[1] && match[1] !== "Store Order") {
        const name = match[1];
        counts[name] = (counts[name] || 0) + 1;
      }
    });
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  })();
  const activeBrandsTotal = activeBrands.reduce((acc, brand) => acc + brand.value, 0);

  // Every distinct category actually present in live inventory right now —
  // used instead of a fixed hardcoded list, so any real department (like
  // "Add On" or anything else that exists in your data) is always
  // selectable/filterable, not just a preset handful of names.
  const uniqueCategories = Array.from(
    new Set((products || []).map((p) => p.category).filter((c): c is string => !!c && c.trim().length > 0))
  ).sort();

  const missingUpcCount = (products || []).filter((p: any) => !p.upc).length;

  const filteredActiveProducts = (products || []).filter((p: any) => {
    const matchesSearch = p.name.toLowerCase().includes(manageSearchQuery.toLowerCase()) || 
                          p.origin.toLowerCase().includes(manageSearchQuery.toLowerCase()) || 
                          (p.description || "").toLowerCase().includes(manageSearchQuery.toLowerCase());
    const matchesCategory = manageCategoryFilter === "All" || p.category === manageCategoryFilter;
    const matchesUpcFilter = !showMissingUpcOnly || !p.upc;
    return matchesSearch && matchesCategory && matchesUpcFilter;
  });

  return (
    <div className="space-y-8" id="merchant-view">
      {/* Merchant Title & Control Strip */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-6">
        <div>
          <span className="text-xs font-semibold tracking-widest text-indigo-700 uppercase block mb-1">
            Secure Merchant Portal
          </span>
          <h1 className="text-3xl font-serif text-gray-900 tracking-tight">
            Store Demand Analytics
          </h1>
          <p className="text-sm text-gray-500 font-light mt-1">
            Real-time insights of what customers are actively searching for near Calloway Market in Bakersfield.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={downloadProductsCsv}
            disabled={!products || products.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-950 text-white hover:bg-amber-900 transition rounded-xl text-xs font-semibold uppercase tracking-wider shadow-sm cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            title="Download active showroom inventory as CSV"
          >
            <Download className="w-3.5 h-3.5 text-amber-300 animate-bounce" />
            Export Catalog (.csv)
          </button>
          
          <button
            onClick={downloadDemandLogsCsv}
            disabled={!analytics || !analytics.recentSearches || analytics.recentSearches.length === 0}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-950 text-white hover:bg-indigo-900 transition rounded-xl text-xs font-semibold uppercase tracking-wider shadow-sm cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
            title="Download customer search logs as CSV"
          >
            <Download className="w-3.5 h-3.5 text-indigo-300" />
            Export Search Logs (.csv)
          </button>

          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-semibold uppercase tracking-wider text-gray-700 hover:bg-gray-50 transition shadow-sm cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingAnalytics ? "animate-spin" : ""}`} />
            Refresh Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-xl text-sm flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>Error compiling store data: {error}</span>
        </div>
      )}

      {/* KPI Overviews */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center shrink-0">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 block uppercase tracking-wider">Total Inquiries logged</span>
            <span className="text-2xl font-bold text-gray-900 font-mono">
              {analytics?.recentSearches.length || 0}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-800 flex items-center justify-center shrink-0">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 block uppercase tracking-wider">Active neighborhoods</span>
            <span className="text-2xl font-bold text-gray-900 font-mono">
              {analytics?.heatMapData.length || 0} Districts
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center shrink-0">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 block uppercase tracking-wider">Top Searched Category</span>
            <span className="text-xl font-bold text-gray-900 truncate max-w-[180px] block font-serif">
              {analytics?.popularCategories[0]?.name || "None"}
            </span>
          </div>
        </div>
      </div>

      {/* Dynamic Segment Filter */}
      <div className="bg-white rounded-2xl border border-gray-100 p-4 md:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-serif text-gray-900 tracking-tight flex items-center gap-2">
            <Globe className="w-4 h-4 text-amber-900 animate-pulse" />
            Bakersfield Consumer Demand Channels
          </h2>
          <p className="text-xs text-gray-400 font-light mt-0.5">
            Toggle channels to see what categories and brands people are searching for, tagged by source.
          </p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/50 self-start sm:self-center">
          <button
            onClick={() => setDemandFilter("all")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition duration-150 cursor-pointer ${
              demandFilter === "all"
                ? "bg-white text-amber-950 shadow-xs font-bold"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            All Channels
          </button>
          <button
            onClick={() => setDemandFilter("google")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition duration-150 flex items-center gap-1.5 cursor-pointer ${
              demandFilter === "google"
                ? "bg-rose-900 text-white shadow-xs font-bold"
                : "text-gray-500 hover:text-rose-900"
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span>
            Google Searches
          </button>
          <button
            onClick={() => setDemandFilter("website")}
            className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition duration-150 cursor-pointer ${
              demandFilter === "website"
                ? "bg-indigo-950 text-white shadow-xs font-bold"
                : "text-gray-500 hover:text-indigo-950"
            }`}
          >
            Calloway Web
          </button>
        </div>
      </div>

      {/* Primary Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Visual Charts */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Chart 1: Category Demand Pie */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-amber-800" />
                <h3 className="font-serif text-lg text-gray-900">
                  {demandFilter === "all" 
                    ? "Inquiries by Spirits Category (All Channels)" 
                    : demandFilter === "google"
                      ? "Google Search: Category Demand Distribution"
                      : "Calloway Website: Category Inquiry Share"}
                </h3>
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full uppercase font-bold tracking-wider border ${
                demandFilter === "google" 
                  ? "bg-rose-50 text-rose-800 border-rose-200/40" 
                  : demandFilter === "website"
                    ? "bg-indigo-50 text-indigo-800 border-indigo-200/40"
                    : "bg-amber-50 text-amber-800 border-amber-200/40"
              }`}>
                {demandFilter === "all" ? "Total Share" : demandFilter === "google" ? "Google Search" : "Web Channel"}
              </span>
            </div>

            {isLoadingAnalytics ? (
              <div className="h-64 flex items-center justify-center">
                <div className="w-8 h-8 border-3 border-amber-900 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : analytics && activeCategories.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-12 items-center gap-4">
                <div className="md:col-span-7 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={activeCategories}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {activeCategories.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: "#fff", 
                          border: "1px solid #f1f5f9", 
                          borderRadius: "12px",
                          boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)"
                        }} 
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="md:col-span-5 space-y-2 max-h-64 overflow-y-auto pr-2">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Category Breakdown</h4>
                  {activeCategories.map((cat, idx) => {
                    const pct = activeCategoriesTotal > 0
                      ? Math.round((cat.value / activeCategoriesTotal) * 100)
                      : 0;
                    return (
                      <div key={cat.name} className="flex items-center justify-between text-xs py-1 border-b border-gray-50">
                        <div className="flex items-center gap-2">
                          <span 
                            className="w-2.5 h-2.5 rounded-full shrink-0" 
                            style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                          />
                          <span className="font-medium text-gray-700">{cat.name}</span>
                        </div>
                        <span className="text-gray-500 font-mono font-semibold">{pct}% ({cat.value})</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-center text-gray-400">
                <p>No queries found for this selected segment.</p>
              </div>
            )}
          </div>

          {/* Chart 2 / Brand Leaderboard: Conditional based on filter */}
          {demandFilter === "all" ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2 border-b border-gray-50 pb-3">
                <MapPin className="w-5 h-5 text-gray-400" />
                <div>
                  <h3 className="font-serif text-lg text-gray-900">Neighborhood Search Hotspots</h3>
                  <p className="text-xs text-gray-400 font-light mt-0.5">Not connected yet — this needs a real location data source.</p>
                </div>
              </div>
              <div className="h-40 flex flex-col items-center justify-center text-center text-gray-400 gap-2">
                <p className="text-sm">No real location data is connected yet.</p>
                <p className="text-xs max-w-sm">To see genuine geographic search trends, connect Google Search Console for your domain, or add real customer geolocation with their consent.</p>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-900" />
                  <div>
                    <h3 className="font-serif text-lg text-gray-900">
                      {demandFilter === "google" ? "Brand Demand Leaderboard (Google-tagged)" : "Website Traffic: Brand Inquiry Leaderboard"}
                    </h3>
                    <p className="text-xs text-gray-400 font-light mt-0.5">
                      {demandFilter === "google"
                        ? "Searches tagged as Google-originated on this site. Not a live Google Trends/Search Console feed — connect Search Console separately for verified Google data."
                        : "Specific product labels being searched on our catalog."}
                    </p>
                  </div>
                </div>
                <span className={`text-[10px] px-2.5 py-1 rounded-full uppercase font-bold tracking-wider border ${
                  demandFilter === "google"
                    ? "bg-rose-50 text-rose-800 border-rose-200/40"
                    : "bg-indigo-50 text-indigo-800 border-indigo-200/40"
                }`}>
                  {demandFilter === "google" ? "Self-Reported" : "Site Catalog"}
                </span>
              </div>

              <div className="space-y-4 pt-2">
                {activeBrands && activeBrands.length > 0 ? (
                  activeBrands.slice(0, 6).map((brand, idx) => {
                    const maxVal = Math.max(...activeBrands.map((b) => b.value));
                    const percentWidth = maxVal > 0 ? Math.round((brand.value / maxVal) * 100) : 0;
                    const sharePct = activeBrandsTotal > 0 ? Math.round((brand.value / activeBrandsTotal) * 100) : 0;
                    
                    return (
                      <div key={brand.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-gray-400 font-bold text-[10px] w-5">#{idx + 1}</span>
                            <span className="font-medium text-gray-800">{brand.name}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500 font-mono text-[11px]">
                            <span>{brand.value} queries</span>
                            <span className="text-gray-300">•</span>
                            <span className="font-semibold text-amber-900">{sharePct}% share</span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <motion.div 
                            className={`h-full rounded-full ${
                              demandFilter === "google" 
                                ? "bg-gradient-to-r from-rose-900 to-amber-700" 
                                : "bg-gradient-to-r from-indigo-950 to-indigo-700"
                            }`}
                            initial={{ width: 0 }}
                            animate={{ width: `${percentWidth}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                          />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-gray-400 text-xs font-light">
                    No brand query data recorded for this channel segment yet. Try simulating some queries below!
                  </div>
                )}
              </div>
            </div>
          )}

        </div>

        {/* Right Column: Live Query Feeds & Trending Words */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Trending Searches list */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-700" />
              <h3 className="font-serif text-lg text-gray-900">Trending Local Terms</h3>
            </div>

            {isLoadingAnalytics ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : analytics && analytics.trendingQueries.length > 0 ? (
              <div className="space-y-3">
                {analytics.trendingQueries.map((trend, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50/75 rounded-xl border border-gray-100">
                    <div className="space-y-0.5">
                      <span className="text-sm font-semibold text-gray-800">{trend.text}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide block">{trend.category}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-gray-200/50 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 font-mono">
                      <span>{trend.count}</span>
                      <span className="text-[9px] text-gray-400 uppercase font-bold">hits</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 text-sm font-light">
                No organic searches registered yet today.
              </div>
            )}
          </div>

          {/* Most Ordered Products — real click-through demand */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-[#E4002B]" />
              <div>
                <h3 className="font-serif text-lg text-gray-900">Most Ordered Products</h3>
                <p className="text-[10px] text-gray-400 font-light">Based on real DoorDash/Grubhub click-throughs — not connected to a cash register.</p>
              </div>
            </div>

            {isLoadingAnalytics ? (
              <div className="space-y-3 py-6">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 bg-gray-50 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : mostOrderedProducts.length > 0 ? (
              <div className="space-y-2">
                {mostOrderedProducts.map((item, idx) => (
                  <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50/75 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-gray-400 font-bold text-[10px] w-4 shrink-0">#{idx + 1}</span>
                      <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-gray-200/50 px-2.5 py-1 rounded-lg text-xs font-semibold text-gray-700 font-mono shrink-0">
                      <span>{item.count}</span>
                      <span className="text-[9px] text-gray-400 uppercase font-bold">clicks</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-8 text-center text-gray-400 text-sm font-light">
                No product order clicks logged yet. This fills in as customers click "Add to Cart" or Grubhub on specific products.
              </div>
            )}
          </div>

          {/* Live Search Stream */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg text-gray-900">Live Search Stream</h3>
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full animate-pulse border border-emerald-100">
                <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full"></span> Live Stream
              </span>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
              {isLoadingAnalytics ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-gray-50 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : analytics && analytics.recentSearches.length > 0 ? (
                (() => {
                  const filtered = analytics.recentSearches;
                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-gray-400 text-xs font-light">
                        No recent searches yet.
                      </div>
                    );
                  }
                  return filtered.map((q) => {
                    const isGoogle = q.source === "Google Search";
                    return (
                      <div key={q.id} className="p-3 border border-gray-100 rounded-xl hover:bg-slate-50/50 transition">
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-medium text-gray-900 font-sans">{q.query}</span>
                              <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 tracking-wider rounded-sm border ${
                                isGoogle 
                                  ? "bg-rose-50 text-rose-600 border-rose-200/50" 
                                  : "bg-amber-50 text-amber-800 border-amber-200/50"
                              }`}>
                                {isGoogle ? "Google Search" : "Website"}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-[10px] text-gray-400 font-light flex-wrap">
                              <span>{q.category}</span>
                              <span>•</span>
                              <span className="flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" /> {q.neighborhood} ({q.distanceMiles}mi)</span>
                            </div>
                          </div>
                          <span className="text-[10px] text-gray-400 shrink-0 font-mono">{formatTimeAgo(q.timestamp)}</span>
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="py-12 text-center text-gray-400 text-sm font-light">
                  No active searches. Customers searching the site will stream here instantly!
                </div>
              )}
            </div>
          </div>

          {/* Merchant Activity Log Widget */}
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-700" />
                <h3 className="font-serif text-lg text-gray-900">Merchant Activity Log</h3>
              </div>
              <span className="text-[10px] bg-indigo-50 text-indigo-800 px-2.5 py-1 rounded-full uppercase font-bold tracking-wider border border-indigo-100">
                Actions Log
              </span>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-2">
              {activityLogs.length > 0 ? (
                activityLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-gray-50/75 rounded-xl border border-gray-100/80 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="font-medium text-gray-800">{log.action}</p>
                      <span className="text-[9px] text-gray-400 font-mono flex items-center gap-1">
                        <Clock className="w-2.5 h-2.5" /> {log.timestamp}
                      </span>
                    </div>
                    <span className="shrink-0 text-[8px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold font-mono uppercase">
                      Success
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-gray-400 text-sm font-light">
                  No merchant actions logged yet.
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {/* Inventory Management & Upload Hub */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-10 shadow-sm space-y-8 my-12" id="inventory-manager">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <span className="text-xs font-semibold tracking-widest text-amber-800 uppercase block mb-1">
              Showroom Stock Management
            </span>
            <h2 className="text-2xl font-serif text-gray-900 tracking-tight flex items-center gap-2">
              <Upload className="w-5 h-5 text-amber-900" />
              Inventory Upload & Stock Registry
            </h2>
            <p className="text-xs text-gray-500 font-light mt-1">
              Publish single high-end arrivals or paste bulk-imported files (JSON or CSV rows) to update Calloway Market's active customer catalog instantly.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsScannerOpen(true);
            }}
            className="px-4 py-2.5 bg-indigo-950 hover:bg-indigo-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Search className="w-3.5 h-3.5" />
            Scan Barcode
          </button>
        </div>

        {/* Barcode Scanner Modal — designed for a physical barcode scanner
            device, which just types the code into this focused input. */}
        {isScannerOpen && (
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setIsScannerOpen(false)}
          >
            <div
              className="bg-white rounded-2xl border border-gray-200 max-w-md w-full p-6 shadow-2xl space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-serif text-gray-900">Scan a Product Barcode</h3>
                <button
                  onClick={() => setIsScannerOpen(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-gray-500">
                Scan the barcode with your scanner now — it types directly into the field below and submits
                automatically. If it matches something already in your inventory, its edit form opens right away.
                If it's brand new, you'll be switched to the Manual Bottle Entry tab with the UPC pre-filled.
              </p>
              <input
                ref={scanInputRef}
                type="text"
                value={scanInputValue}
                onChange={(e) => setScanInputValue(e.target.value)}
                onKeyDown={handleScanInputKeyDown}
                placeholder="Ready to scan..."
                autoFocus
                className="w-full px-4 py-3 bg-gray-50 border-2 border-dashed border-amber-300 rounded-xl text-center font-mono text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-900 focus:border-amber-900 transition"
              />
              <button
                type="button"
                onClick={() => setIsScannerOpen(false)}
                className="w-full py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tab Selector */}
        <div className="flex border-b border-gray-100 pb-px gap-2">
          <button
            onClick={() => {
              setUploadTab("smart");
              setUploadMessage(null);
              setParsedPreviewItems([]);
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 cursor-pointer transition ${
              uploadTab === "smart"
                ? "border-amber-900 text-amber-950"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Google Sheets & Smart Upload
          </button>
          <button
            onClick={() => {
              setUploadTab("manual");
              setUploadMessage(null);
              setParsedPreviewItems([]);
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 cursor-pointer transition ${
              uploadTab === "manual"
                ? "border-amber-900 text-amber-950"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Manual Bottle Entry
          </button>
          <button
            onClick={() => {
              setUploadTab("bulk");
              setUploadMessage(null);
              setParsedPreviewItems([]);
            }}
            className={`pb-3 text-xs font-bold uppercase tracking-wider border-b-2 px-4 cursor-pointer transition ${
              uploadTab === "bulk"
                ? "border-amber-900 text-amber-950"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            Bulk Copy-Paste Upload
          </button>
        </div>

        {/* Global Upload Controls & Pricing Margin Configurator */}
        <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
          
          {/* Pricing Margin Markup */}
          <div className="space-y-2 md:col-span-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-amber-900 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-800">Applied Pricing Markup Margin</h4>
                  <p className="text-[10px] text-gray-400 font-light">Set default markup margin percentage applied on inventory import.</p>
                </div>
              </div>
              <span className="text-xs font-extrabold text-amber-900 font-mono bg-amber-50 px-2.5 py-1 rounded border border-amber-200">+{uploadMarkupMargin}% Markup</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="5"
                max="150"
                step="5"
                value={uploadMarkupMargin}
                onChange={(e) => setUploadMarkupMargin(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-900"
              />
              <div className="flex gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setUploadMarkupMargin(prev => Math.max(5, prev - 5))}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-gray-200 text-gray-700 text-[10px] font-bold rounded-lg transition"
                >
                  -5%
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMarkupMargin(prev => Math.min(150, prev + 5))}
                  className="px-2 py-1 bg-white hover:bg-slate-100 border border-gray-200 text-gray-700 text-[10px] font-bold rounded-lg transition"
                >
                  +5%
                </button>
              </div>
            </div>
          </div>

          {/* Instant Direct Publish & Sample Template Download */}
          <div className="space-y-3 bg-white p-3.5 rounded-xl border border-gray-100 flex flex-col justify-center">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoPublish}
                onChange={(e) => setAutoPublish(e.target.checked)}
                className="w-4 h-4 rounded text-amber-950 border-gray-300 focus:ring-amber-900 cursor-pointer"
              />
              <div className="space-y-0.5">
                <span className="text-[11px] font-semibold text-gray-700 block">Auto-Publish Directly</span>
                <span className="text-[9px] text-gray-400 font-light block leading-none">Skip preview, publish instantly to live showroom</span>
              </div>
            </label>
            <button
              type="button"
              onClick={downloadSampleTemplateCsv}
              className="w-full py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 hover:text-slate-900 text-[10px] font-bold uppercase tracking-wider rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              Download Sample CSV Template
            </button>
          </div>
          
        </div>

        {uploadMessage && (
          <div className={`p-4 rounded-xl text-xs font-medium flex items-center gap-3 border ${
            uploadMessage.toLowerCase().includes("failed") || uploadMessage.toLowerCase().includes("error")
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}>
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{uploadMessage}</span>
          </div>
        )}

        {uploadTab === "smart" ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Option A: Google Sheet Importer */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-gray-100 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <Globe className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-serif text-sm font-semibold text-gray-800">Import from Google Sheets</h3>
                    <p className="text-[11px] text-gray-400 font-light">Paste a shared Google Spreadsheet URL to dynamically map and import live listings.</p>
                  </div>
                </div>

                <form onSubmit={handleSheetImport} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-[9px] uppercase font-bold text-gray-500 tracking-wider mb-1">Google Sheet Shareable Link</label>
                    <div className="relative flex items-center">
                      <Link2 className="absolute left-3 w-4 h-4 text-gray-400" />
                      <input
                        type="url"
                        required
                        placeholder="https://docs.google.com/spreadsheets/d/.../edit?usp=sharing"
                        value={sheetUrl}
                        onChange={(e) => setSheetUrl(e.target.value)}
                        className="w-full pl-9 pr-3 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isFetchingSheet}
                    className="w-full py-2.5 bg-emerald-950 hover:bg-emerald-900 text-emerald-200 hover:text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center gap-2 cursor-pointer disabled:bg-gray-100 disabled:text-gray-400"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFetchingSheet ? "animate-spin" : ""}`} />
                    {isFetchingSheet ? "Syncing Google Sheet..." : "Connect & Fetch Sheet"}
                  </button>
                </form>

                <div className="bg-white p-3 rounded-xl border border-gray-100 text-[10px] text-gray-500 space-y-1.5 leading-relaxed">
                  <span className="font-bold text-gray-700 block uppercase tracking-wide text-[9px]">Google Sheet Instructions:</span>
                  <p>1. In Google Sheets, ensure the document is shared as <span className="font-medium text-amber-900">"Anyone with the link can view"</span>, or click <span className="font-medium text-amber-900">File &gt; Share &gt; Publish to Web</span>.</p>
                  <p>2. Ensure columns have recognizable headers in row 1 (e.g. <span className="font-semibold text-slate-700">"Name"</span>, <span className="font-semibold text-slate-700">"Category"</span>, <span className="font-semibold text-slate-700">"Stock Status"</span>, <span className="font-semibold text-slate-700">"ABV"</span>, <span className="font-semibold text-slate-700">"Size"</span>).</p>
                </div>
              </div>

              {/* Option B: Local File Drag-and-Drop */}
              <div className="bg-slate-50/50 p-5 rounded-2xl border border-gray-100 flex flex-col justify-between space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-800 flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-serif text-sm font-semibold text-gray-800">Drag &amp; Drop Spreadsheet Files</h3>
                    <p className="text-[11px] text-gray-400 font-light">Instantly parse offline inventory tables (CSV or JSON format) directly from your computer.</p>
                  </div>
                </div>

                {/* Drag Drop Area */}
                <div
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 relative min-h-[140px] ${
                    dragActive 
                      ? "border-amber-900 bg-amber-50/30" 
                      : "border-gray-200 hover:border-amber-900 bg-white"
                  }`}
                >
                  <input
                    type="file"
                    accept=".csv,.json"
                    onChange={handleFileChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className={`w-8 h-8 text-gray-400 transition ${dragActive ? "text-amber-800 scale-110" : ""}`} />
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-gray-700">Drag &amp; drop .csv or .json here</p>
                    <p className="text-[10px] text-gray-400">or click to browse local files</p>
                  </div>
                </div>

                <div className="text-[10px] text-gray-400 font-light leading-relaxed">
                  <span className="font-semibold text-gray-600">CSV Columns:</span> Name, Category, Size, Stock Status, Origin, ABV, Tasting Notes (Optional).
                </div>
              </div>

            </div>

            {/* Smart Import Preview Block */}
            {parsedPreviewItems.length > 0 && (
              <div className="bg-slate-50 p-5 rounded-2xl border border-amber-900/10 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-amber-800" />
                    <div>
                      <h4 className="font-serif text-sm font-semibold text-slate-800">Smart Registry Import Preview</h4>
                      <p className="text-[10px] text-slate-400">Review mapped products parsed from your spreadsheet before committing to active inventory.</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setParsedPreviewItems([])}
                      className="px-3 py-1.5 bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Clear Preview
                    </button>
                    <button
                      onClick={() => confirmParsedImport()}
                      disabled={isUploading}
                      className="px-4 py-1.5 bg-amber-950 hover:bg-amber-900 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition shadow-sm cursor-pointer disabled:bg-gray-300 animate-pulse"
                    >
                      {isUploading ? "Uploading Live..." : `Publish ${parsedPreviewItems.length} Products`}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-72 border border-slate-200/60 rounded-xl bg-white shadow-xs">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="py-2.5 px-4">Spirit / Bottle</th>
                        <th className="py-2.5 px-4">Category</th>
                        <th className="py-2.5 px-4">Origin / Distillery</th>
                        <th className="py-2.5 px-4">ABV</th>
                        <th className="py-2.5 px-4">Size</th>
                        <th className="py-2.5 px-4">Target Markup</th>
                        <th className="py-2.5 px-4">Final Price</th>
                        <th className="py-2.5 px-4">Stock Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {parsedPreviewItems.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-4 font-medium text-slate-800">{item.name}</td>
                          <td className="py-2 px-4 text-slate-500">
                            <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-semibold">{item.category}</span>
                          </td>
                          <td className="py-2 px-4 text-slate-500">{item.origin}</td>
                          <td className="py-2 px-4 font-mono text-slate-500">{item.abv}</td>
                          <td className="py-2 px-4 font-mono text-slate-500">{item.size}</td>
                          <td className="py-2 px-4 font-mono text-xs font-semibold text-amber-900">+{item.marginPercent || uploadMarkupMargin}%</td>
                          <td className="py-2 px-4 font-mono text-xs font-semibold text-slate-800">${item.price ? Number(item.price).toFixed(2) : ""}</td>
                          <td className="py-2 px-4">
                            <span className={`text-[10px] font-semibold ${
                              item.stockStatus.toLowerCase().includes("out") 
                                ? "text-rose-600" 
                                : item.stockStatus.toLowerCase().includes("limit")
                                ? "text-amber-600"
                                : "text-emerald-600"
                            }`}>{item.stockStatus}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        ) : uploadTab === "manual" ? (
          <form onSubmit={handleManualProductAdd} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Spirit / Bottle Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Clase Azul Reposado Tequila"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Category</label>
                <input
                  type="text"
                  list="manual-category-options"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Pick an existing one or type a brand new department"
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
                <datalist id="manual-category-options">
                  {uniqueCategories.map((cat) => (
                    <option key={cat} value={cat} />
                  ))}
                </datalist>
                <p className="text-[10px] text-gray-400 mt-1">
                  Suggestions come from your real live inventory — type any new department name (like "Add On") if
                  it doesn't exist yet.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Stock Status</label>
                <select
                  value={newStockStatus}
                  onChange={(e) => setNewStockStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                >
                  <option value="In Stock">In Stock</option>
                  <option value="Limited Stock">Limited Stock</option>
                  <option value="Special Order Only">Special Order Only</option>
                  <option value="Out of Stock">Out of Stock</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Origin / Distillery</label>
                <input
                  type="text"
                  placeholder="e.g. Jalisco, Mexico"
                  value={newOrigin}
                  onChange={(e) => setNewOrigin(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Volume Size</label>
                <input
                  type="text"
                  placeholder="e.g. 750ml"
                  value={newSize}
                  onChange={(e) => setNewSize(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Alcohol ABV</label>
                <input
                  type="text"
                  placeholder="e.g. 40%"
                  value={newAbv}
                  onChange={(e) => setNewAbv(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Base Cost / Price ($)</label>
                <input
                  type="text"
                  placeholder="e.g. 89.99 (Optional)"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">UPC (Optional)</label>
                <input
                  type="text"
                  placeholder="Scan or type barcode"
                  value={newUpc}
                  onChange={(e) => setNewUpc(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Tasting Notes (comma sep)</label>
                <input
                  type="text"
                  placeholder="e.g. Sweet Agave, Vanilla"
                  value={newTastingNotes}
                  onChange={(e) => setNewTastingNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Description Specs</label>
                <textarea
                  rows={2}
                  placeholder="Enter custom distillery story or tasting overview..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition resize-none font-light"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Gourmet Food Pairing</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Works exquisitely with Wagyu steak, premium blue cheese..."
                  value={newFoodPairing}
                  onChange={(e) => setNewFoodPairing(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition resize-none font-light"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isUploading}
              className="px-5 py-3 bg-amber-950 hover:bg-amber-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer disabled:bg-gray-300"
            >
              <Plus className="w-4 h-4 text-amber-300" />
              {isUploading ? "Registering..." : "Add to Live Customer Showroom"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleBulkImport} className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Paste JSON Array or Comma-Separated rows</label>
                <button
                  type="button"
                  onClick={() => {
                    setBulkText(
                      `[\n  {\n    "name": "Bakersfield Reserve Bourbon 100 Proof",\n    "category": "Whiskey",\n    "size": "750ml",\n    "abv": "50%",\n    "stockStatus": "Limited Stock",\n    "tastingNotes": "Burnt Oak, Vanilla Bean, Molasses",\n    "description": "Calloway Market\\'s proprietary signature barrel selection."\n  }\n]`
                    );
                  }}
                  className="text-[10px] font-bold text-indigo-700 hover:text-indigo-950 underline bg-transparent border-none cursor-pointer"
                >
                  Load Sample JSON Template
                </button>
              </div>
              <textarea
                rows={5}
                required
                placeholder='Paste raw database rows or JSON array. Example:&#13;Macallan 18, Whiskey, 750ml, Limited Stock&#13;Don Julio Real, Tequila, 750ml, In Stock'
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                className="w-full p-4 bg-gray-50/70 border border-gray-200 rounded-xl text-xs font-mono focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition resize-none"
              />
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between text-xs text-gray-400">
              <div className="space-y-0.5">
                <span className="font-semibold text-gray-500 block">Accepted Formats:</span>
                <p className="font-light leading-relaxed">
                  1. **JSON Array**: Objects containing `name`, `category`, `size`, `abv`, `stockStatus`, `description` keys.&#13;
                  2. **CSV List**: One line per bottle in format: `Bottle Name, Category, Size, Stock Status`
                </p>
              </div>

              <button
                type="submit"
                disabled={isUploading}
                className="px-5 py-3 bg-amber-950 hover:bg-amber-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer disabled:bg-gray-300 shrink-0"
              >
                <Upload className="w-4 h-4 text-amber-300" />
                {isUploading ? "Importing Bulk Data..." : "Import Stock Array"}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Promo Banner Manager — supports multiple photo or video banners,
          each with its own text size and position (full/left/right). */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-10 shadow-sm space-y-6 my-12" id="promo-banner-manager">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold tracking-widest text-rose-700 uppercase block mb-1">
              Customer Site Promo Banners
            </span>
            <h2 className="text-2xl font-serif text-gray-900 tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-rose-600" />
              Photo & Video Promo Banners
            </h2>
            <p className="text-xs text-gray-500 font-light mt-1">
              These appear under the search bar on your customer-facing site, in the order shown below. Use the
              up/down arrows to reorder, and set "Left Half" / "Right Half" on two consecutive promos to place
              them side by side instead of full width.
            </p>
          </div>
          <button
            type="button"
            onClick={addPromo}
            className="px-4 py-2.5 bg-amber-950 hover:bg-amber-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 text-amber-300" />
            Add New Promo
          </button>
        </div>

        {promoMessage && (
          <div className={`p-4 rounded-xl text-xs font-medium flex items-center gap-3 border ${
            promoMessage.toLowerCase().includes("failed") || promoMessage.toLowerCase().includes("error")
              ? "bg-rose-50 text-rose-800 border-rose-200"
              : "bg-emerald-50 text-emerald-800 border-emerald-200"
          }`}>
            <CheckCircle className="w-4 h-4 shrink-0" />
            <span>{promoMessage}</span>
          </div>
        )}

        {isLoadingPromos ? (
          <div className="h-32 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-amber-900 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <form onSubmit={handleSavePromos} className="space-y-6">
            {promos.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                <p className="text-sm text-gray-500">No promo banners yet. Click "Add New Promo" to create one.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {promos.map((promo, idx) => (
                  <div key={promo.id} className="border border-gray-200 rounded-2xl p-5 space-y-4 bg-slate-50/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Promo #{idx + 1}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePromo(promo.id, -1)}
                          disabled={idx === 0}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePromo(promo.id, 1)}
                          disabled={idx === promos.length - 1}
                          className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removePromo(promo.id)}
                          className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                          title="Remove this promo"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updatePromo(promo.id, "mediaType", "image")}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition flex items-center justify-center gap-1.5 ${promo.mediaType === "image" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                          >
                            <ImageIcon className="w-3.5 h-3.5" /> Photo
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePromo(promo.id, "mediaType", "video")}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition flex items-center justify-center gap-1.5 ${promo.mediaType === "video" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                          >
                            <Video className="w-3.5 h-3.5" /> Video
                          </button>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">
                            {promo.mediaType === "video" ? "Video URL (direct .mp4 link)" : "Image URL"}
                          </label>
                          <input
                            type="url"
                            placeholder={promo.mediaType === "video" ? "https://example.com/promo.mp4" : "https://i.imgur.com/yourimage.jpg"}
                            value={promo.mediaUrl}
                            onChange={(e) => updatePromo(promo.id, "mediaUrl", e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                          />
                          <div className="flex items-center gap-2 mt-2">
                            <div className="flex-1 h-px bg-gray-200"></div>
                            <span className="text-[9px] text-gray-400 uppercase font-bold">or</span>
                            <div className="flex-1 h-px bg-gray-200"></div>
                          </div>
                          <label className={`mt-2 w-full py-2.5 border-2 border-dashed rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${
                            uploadingMediaId === promo.id
                              ? "border-amber-300 bg-amber-50 text-amber-700"
                              : "border-gray-200 hover:border-amber-900 text-gray-600 hover:text-amber-900"
                          }`}>
                            <input
                              type="file"
                              accept={promo.mediaType === "video" ? "video/*" : "image/*"}
                              className="hidden"
                              disabled={uploadingMediaId === promo.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleMediaFileUpload(promo.id, file);
                                e.target.value = "";
                              }}
                            />
                            <Upload className="w-3.5 h-3.5" />
                            {uploadingMediaId === promo.id ? "Uploading..." : "Upload from Computer"}
                          </label>
                        </div>

                        <div>
                          <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Position on Page</label>
                          <div className="grid grid-cols-3 gap-2">
                            <button
                              type="button"
                              onClick={() => updatePromo(promo.id, "position", "full")}
                              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition ${promo.position === "full" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                            >
                              Full Width
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePromo(promo.id, "position", "left")}
                              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition ${promo.position === "left" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                            >
                              Left Half
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePromo(promo.id, "position", "right")}
                              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition ${promo.position === "right" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                            >
                              Right Half
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePromo(promo.id, "position", "sidebar-left")}
                              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition ${promo.position === "sidebar-left" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                            >
                              Side (Left)
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePromo(promo.id, "position", "sidebar-right")}
                              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition ${promo.position === "sidebar-right" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                            >
                              Side (Right)
                            </button>
                            <button
                              type="button"
                              onClick={() => updatePromo(promo.id, "position", "inline")}
                              className={`py-2 rounded-lg text-[11px] font-bold uppercase transition ${promo.position === "inline" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                            >
                              Between Categories
                            </button>
                          </div>
                          {(promo.position === "sidebar-left" || promo.position === "sidebar-right") && (
                            <p className="text-[10px] text-amber-700 mt-1.5">
                              Side banners pin to the edge of the screen and stay visible while scrolling. They only show on
                              larger screens (tablet/desktop) — there's no room for them on phones. If you add more than one
                              banner to the same side, they now stack vertically in order (use the up/down arrows above to
                              control which one appears first). For a wide/landscape photo, try a larger Width and shorter
                              Height; for a tall/portrait photo, try a narrower Width and taller Height — use "Contain" below
                              so the whole photo shows without being cropped or stretched, regardless of its shape.
                            </p>
                          )}
                          {promo.position === "inline" && (
                            <div className="mt-2 space-y-1.5">
                              <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                                Insert After Category Number
                              </label>
                              <input
                                type="number"
                                min="1"
                                value={promo.afterCategoryPosition}
                                onChange={(e) => updatePromo(promo.id, "afterCategoryPosition", Math.max(1, Number(e.target.value)))}
                                className="w-full px-3.5 py-2 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                              />
                              <p className="text-[10px] text-amber-700">
                                e.g. enter "2" to show this banner right after the 2nd category section a customer
                                scrolls past on the home page (counting from the top, in the order categories appear).
                              </p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updatePromo(promo.id, "imageFit", "cover")}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition ${promo.imageFit === "cover" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                          >
                            Cover (fill & crop)
                          </button>
                          <button
                            type="button"
                            onClick={() => updatePromo(promo.id, "imageFit", "contain")}
                            className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase transition ${promo.imageFit === "contain" ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-600"}`}
                          >
                            Contain (show full media)
                          </button>
                        </div>

                        <div className={promo.position.startsWith("sidebar") ? "grid grid-cols-2 gap-3" : ""}>
                          <div>
                            <div className="flex items-center justify-between mb-1.5">
                              <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                                {promo.position.startsWith("sidebar") ? "Height" : "Banner Height"}
                              </label>
                              <span className="text-xs font-mono font-semibold text-amber-900">{promo.height}px</span>
                            </div>
                            <input
                              type="range"
                              min="120"
                              max={promo.position.startsWith("sidebar") ? 1200 : 400}
                              step="10"
                              value={promo.height}
                              onChange={(e) => updatePromo(promo.id, "height", Number(e.target.value))}
                              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-900"
                            />
                          </div>
                          {promo.position.startsWith("sidebar") && (
                            <div>
                              <div className="flex items-center justify-between mb-1.5">
                                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Width</label>
                                <span className="text-xs font-mono font-semibold text-amber-900">{promo.width}px</span>
                              </div>
                              <input
                                type="range"
                                min="100"
                                max="500"
                                step="10"
                                value={promo.width}
                                onChange={(e) => updatePromo(promo.id, "width", Number(e.target.value))}
                                className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-amber-900"
                              />
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Headline</label>
                            <div className="flex gap-1 items-center">
                              <button
                                type="button"
                                onClick={() => updatePromo(promo.id, "headlineBold", !promo.headlineBold)}
                                className={`w-6 h-6 rounded text-[11px] font-extrabold transition flex items-center justify-center ${promo.headlineBold ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-500"}`}
                                title="Bold"
                              >
                                B
                              </button>
                              <button
                                type="button"
                                onClick={() => updatePromo(promo.id, "headlineItalic", !promo.headlineItalic)}
                                className={`w-6 h-6 rounded text-[11px] italic font-semibold transition flex items-center justify-center ${promo.headlineItalic ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-500"}`}
                                title="Italic"
                              >
                                I
                              </button>
                              <span className="w-px h-4 bg-gray-200 mx-0.5"></span>
                              {(["sm", "md", "lg"] as const).map((size) => (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() => updatePromo(promo.id, "headlineSize", size)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${promo.headlineSize === size ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-500"}`}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Buy 2, Save More"
                            value={promo.headline}
                            onChange={(e) => updatePromo(promo.id, "headline", e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Subtext</label>
                            <div className="flex gap-1 items-center">
                              <button
                                type="button"
                                onClick={() => updatePromo(promo.id, "subtextBold", !promo.subtextBold)}
                                className={`w-6 h-6 rounded text-[11px] font-extrabold transition flex items-center justify-center ${promo.subtextBold ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-500"}`}
                                title="Bold"
                              >
                                B
                              </button>
                              <button
                                type="button"
                                onClick={() => updatePromo(promo.id, "subtextItalic", !promo.subtextItalic)}
                                className={`w-6 h-6 rounded text-[11px] italic font-semibold transition flex items-center justify-center ${promo.subtextItalic ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-500"}`}
                                title="Italic"
                              >
                                I
                              </button>
                              <span className="w-px h-4 bg-gray-200 mx-0.5"></span>
                              {(["sm", "md", "lg"] as const).map((size) => (
                                <button
                                  key={size}
                                  type="button"
                                  onClick={() => updatePromo(promo.id, "subtextSize", size)}
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${promo.subtextSize === size ? "bg-amber-950 text-white" : "bg-gray-100 text-gray-500"}`}
                                >
                                  {size}
                                </button>
                              ))}
                            </div>
                          </div>
                          <input
                            type="text"
                            placeholder="e.g. Mix any 6 bottles of wine and save 10%"
                            value={promo.subtext}
                            onChange={(e) => updatePromo(promo.id, "subtext", e.target.value)}
                            className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Button Label</label>
                            <input
                              type="text"
                              placeholder="e.g. Shop Now"
                              value={promo.buttonLabel}
                              onChange={(e) => updatePromo(promo.id, "buttonLabel", e.target.value)}
                              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Button Link (optional)</label>
                            <input
                              type="url"
                              placeholder="Leave blank to open order sheet"
                              value={promo.buttonUrl}
                              onChange={(e) => updatePromo(promo.id, "buttonUrl", e.target.value)}
                              className="w-full px-3.5 py-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider">Live Preview</label>
                        <div
                          className="rounded-2xl overflow-hidden relative bg-gray-100 border border-gray-200 mx-auto"
                          style={{
                            height: `${promo.height}px`,
                            width: promo.position.startsWith("sidebar") ? `${promo.width}px` : "100%",
                          }}
                        >
                          {promo.mediaUrl && promo.mediaType === "video" ? (
                            <video
                              src={promo.mediaUrl}
                              autoPlay
                              muted
                              loop
                              playsInline
                              className={`absolute inset-0 w-full h-full ${promo.imageFit === "contain" ? "object-contain bg-gray-900" : "object-cover"}`}
                            />
                          ) : promo.mediaUrl ? (
                            <img
                              src={promo.mediaUrl}
                              alt="Promo preview"
                              className={`absolute inset-0 w-full h-full ${promo.imageFit === "contain" ? "object-contain bg-gray-900" : "object-cover"}`}
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : null}
                          {(promo.headline || promo.subtext || promo.buttonLabel) && (
                            <div className="absolute inset-0 bg-black/25 flex flex-col justify-center px-6">
                              {promo.headline && (
                                <h2 className={`text-white leading-tight max-w-xs drop-shadow-lg ${
                                  promo.headlineSize === "sm" ? "text-lg" : promo.headlineSize === "lg" ? "text-4xl" : "text-2xl"
                                } ${promo.headlineBold ? "font-extrabold" : "font-medium"} ${promo.headlineItalic ? "italic" : ""}`}>
                                  {promo.headline}
                                </h2>
                              )}
                              {promo.subtext && (
                                <p className={`text-white/90 mt-1 max-w-xs drop-shadow ${
                                  promo.subtextSize === "sm" ? "text-xs" : promo.subtextSize === "lg" ? "text-lg" : "text-sm"
                                } ${promo.subtextBold ? "font-bold" : "font-normal"} ${promo.subtextItalic ? "italic" : ""}`}>
                                  {promo.subtext}
                                </p>
                              )}
                              {promo.buttonLabel && (
                                <span className="mt-3 self-start px-5 py-2 bg-white text-black text-xs font-bold rounded-full">
                                  {promo.buttonLabel}
                                </span>
                              )}
                            </div>
                          )}
                          {!promo.mediaUrl && !promo.headline && !promo.subtext && !promo.buttonLabel && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-xs">
                              Nothing configured yet.
                            </div>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400">
                          {promo.position === "full"
                            ? "Displays full width on the site."
                            : promo.position === "left" || promo.position === "right"
                              ? `Displays as ${promo.position} half — pair with another half-width promo to sit side by side.`
                              : `Pins to the ${promo.position === "sidebar-left" ? "left" : "right"} edge of the screen, visible while scrolling (desktop/tablet only).`}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button
              type="submit"
              disabled={isSavingPromos}
              className="px-5 py-2.5 bg-amber-950 hover:bg-amber-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer disabled:bg-gray-300"
            >
              <Save className="w-3.5 h-3.5 text-amber-300" />
              {isSavingPromos ? "Saving..." : "Save All Promo Banners"}
            </button>
          </form>
        )}
      </div>

      {/* Active Showroom Catalog & Deletion Manager */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-10 shadow-sm space-y-6 my-12" id="active-catalog-manager">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-5">
          <div>
            <span className="text-xs font-semibold tracking-widest text-rose-700 uppercase block mb-1">
              Active Showroom Control
            </span>
            <h2 className="text-2xl font-serif text-gray-900 tracking-tight flex items-center gap-2">
              <Database className="w-5 h-5 text-rose-700" />
              Live Showroom Inventory
            </h2>
            <p className="text-xs text-gray-500 font-light mt-1">
              Browse, search, delete individual items, or securely wipe all live products from the customer database.
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleRecategorizeAll}
              disabled={isRecategorizing || !products || products.length === 0}
              className="px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:bg-gray-50 disabled:text-gray-400 border border-indigo-200/50 hover:border-indigo-200 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-xs"
              title="Re-sort existing products (e.g. generic 'Liquor') into their correct specific department (Whiskey, Tequila, Rum, etc.) without re-uploading anything"
            >
              <RefreshCw className={`w-4 h-4 ${isRecategorizing ? "animate-spin" : ""}`} />
              {isRecategorizing ? "Fixing..." : "Fix Existing Categories"}
            </button>
            <button
              type="button"
              onClick={handleDeleteAllInventory}
              disabled={isDeletingAll || !products || products.length === 0}
              className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 disabled:bg-gray-50 disabled:text-gray-400 border border-rose-200/50 hover:border-rose-200 rounded-xl text-xs font-bold uppercase tracking-wider transition flex items-center gap-2 cursor-pointer shadow-xs"
              title="Delete all products from the live database"
            >
              <Trash2 className="w-4 h-4" />
              {isDeletingAll ? "Clearing..." : "Delete All Inventory"}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search active stock, or scan a barcode here..."
              value={manageSearchQuery}
              onChange={(e) => setManageSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const trimmed = manageSearchQuery.trim();
                  // A physical barcode scanner just types into whatever
                  // field is focused — this box included — then sends
                  // Enter. If what got typed looks like a UPC (a long,
                  // purely numeric string) rather than a name someone
                  // would actually search for, treat it as a scan instead
                  // of a text search, so it doesn't just filter the table
                  // down to zero results.
                  if (/^\d{8,14}$/.test(trimmed)) {
                    e.preventDefault();
                    setManageSearchQuery("");
                    handleBarcodeDetected(trimmed);
                  }
                }
              }}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowMissingUpcOnly((prev) => !prev)}
              className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition cursor-pointer shrink-0 border whitespace-nowrap ${
                showMissingUpcOnly
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
              }`}
              title="Show only products that don't have a UPC attached — these won't be found by barcode scanning yet"
            >
              Missing UPC ({missingUpcCount})
            </button>
          </div>
          
          <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0 scrollbar-none">
            <span className="text-xs text-gray-400 shrink-0 uppercase font-bold tracking-wider mr-1">Filter:</span>
            {["All", ...uniqueCategories].map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setManageCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer shrink-0 border ${
                  manageCategoryFilter === cat
                    ? "bg-amber-950 text-white border-amber-950 shadow-xs"
                    : "bg-white text-gray-600 border-gray-200/60 hover:bg-gray-50"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Inventory List */}
        {products && products.length > 0 ? (
          <div className="border border-gray-100 rounded-xl overflow-hidden shadow-xs bg-gray-50/20">
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] uppercase font-bold text-slate-400 tracking-wider font-mono">
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Origin / Sourced</th>
                    <th className="py-3 px-4">Size</th>
                    <th className="py-3 px-4">ABV</th>
                    <th className="py-3 px-4">Live Price</th>
                    <th className="py-3 px-4">Stock Status</th>
                    <th className="py-3 px-4">Last Updated</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredActiveProducts.length > 0 ? (
                    filteredActiveProducts.map((product) => (
                      <tr key={product.id} className="hover:bg-slate-50/50 transition">
                        <td className="py-3 px-4 font-medium text-slate-900 font-sans">
                          <div className="flex items-center gap-2">
                            <span>{product.name}</span>
                            {!(product as any).upc && (
                              <span className="bg-rose-50 text-rose-600 border border-rose-200 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide shrink-0">
                                No UPC
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10px] font-semibold">{product.category}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-500">{product.origin || "N/A"}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{product.size}</td>
                        <td className="py-3 px-4 font-mono text-slate-500">{product.abv}</td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-800">
                          {product.price ? `$${Number(product.price).toFixed(2)}` : "N/A"}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-semibold ${
                            product.stockStatus.toLowerCase().includes("out") 
                              ? "text-rose-600" 
                              : product.stockStatus.toLowerCase().includes("limit")
                              ? "text-amber-600"
                              : "text-emerald-600"
                          }`}>{product.stockStatus}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[10px] font-mono whitespace-nowrap">
                          {(product as any).updatedAt
                            ? new Date((product as any).updatedAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "—"}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(product)}
                            className="p-1.5 text-gray-400 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition cursor-pointer inline-flex items-center mr-1"
                            title="Edit product details"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleFeatured(product.id, product.name, !!product.featured)}
                            disabled={isTogglingFeaturedId === product.id}
                            className={`p-1.5 rounded-lg transition disabled:text-gray-200 cursor-pointer inline-flex items-center mr-1 ${
                              product.featured
                                ? "text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                                : "text-gray-400 hover:text-amber-500 hover:bg-amber-50"
                            }`}
                            title={product.featured ? "Remove from Featured This Month" : "Add to Featured This Month"}
                          >
                            <Star className="w-3.5 h-3.5" fill={product.featured ? "currentColor" : "none"} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleStock(product.id, product.name, product.stockStatus)}
                            disabled={isTogglingStockId === product.id}
                            className={`p-1.5 rounded-lg transition disabled:text-gray-200 cursor-pointer inline-flex items-center mr-1 ${
                              product.stockStatus === "In Stock"
                                ? "text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                                : "text-gray-400 hover:text-emerald-600 hover:bg-emerald-50"
                            }`}
                            title={product.stockStatus === "In Stock" ? "Mark as out of stock" : "Mark as back in stock"}
                          >
                            {product.stockStatus === "In Stock" ? (
                              <PackageX className="w-3.5 h-3.5" />
                            ) : (
                              <PackageCheck className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(product.id, product.name)}
                            disabled={isDeletingId === product.id}
                            className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition disabled:text-gray-200 cursor-pointer inline-flex items-center"
                            title="Remove product"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-gray-400 font-light">
                        No active stock matching your search filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="bg-slate-50 px-4 py-3 border-t border-gray-100 text-[10px] text-gray-400 font-medium flex justify-between items-center">
              <span>Showing {filteredActiveProducts.length} of {products.length} registered products</span>
              <span>Bakersfield Showroom database</span>
            </div>
          </div>
        ) : (
          <div className="py-12 text-center border border-dashed border-gray-200 rounded-xl bg-gray-50/50">
            <Database className="w-8 h-8 text-gray-300 mx-auto mb-3 animate-pulse" />
            <p className="text-sm font-medium text-gray-600">No Inventory Found</p>
            <p className="text-xs text-gray-400 font-light mt-1 max-w-sm mx-auto leading-relaxed">
              The active stock database is completely empty. Use Google Sheets sync or Manual entry above to register new gourmet snacks, premium sodas, and fine spirits!
            </p>
          </div>
        )}
      </div>

      {/* AI Market Insights Segment */}
      <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-6 md:p-8 border border-slate-800 shadow-xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-400/20 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-serif">Gemini Retail Consultant Audit</h3>
                {aiReport && (
                  <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    aiReport.needsApiKey 
                      ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
                      : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  }`}>
                    {aiReport.needsApiKey ? "Heuristic Emulation Mode" : "Live Gemini 3.5 Active"}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 font-light mt-0.5">AI analyzing geographic clusters and search terms to automate restocking advice.</p>
            </div>
          </div>
          <button
            onClick={runAiAudit}
            disabled={isLoadingAi}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800/40 text-white font-medium rounded-xl text-sm transition shadow-sm flex items-center gap-2 cursor-pointer shrink-0"
          >
            <Sparkles className="w-4 h-4 text-amber-300" />
            {isLoadingAi ? "Auditing Search Corpus..." : "Re-Run AI Stock Audit"}
          </button>
        </div>

        {isLoadingAi ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <div className="w-8 h-8 border-3 border-indigo-400 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-300 font-light font-serif">Analyzing local market data...</p>
          </div>
        ) : aiReport ? (
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start pt-2">
            
            <div className="md:col-span-7 bg-white/5 border border-white/10 rounded-xl p-5 md:p-6 space-y-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase text-indigo-400 tracking-wider">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                <span>Executive Demand Report</span>
              </div>
              
              <div className="text-xs text-slate-200 leading-relaxed font-light space-y-3 whitespace-pre-line border-t border-white/5 pt-3">
                {aiReport.insights}
              </div>
              
              <div className="text-[10px] text-slate-500 text-right italic font-mono">
                Report generated at: {new Date(aiReport.generatedAt).toLocaleTimeString()}
              </div>
            </div>

            <div className="md:col-span-5 space-y-4">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                Automated Actions & Inventory Alerts
              </span>
              <div className="space-y-2.5">
                {aiReport.suggestions.map((suggestion, idx) => (
                  <div 
                    key={idx} 
                    className="flex items-start gap-3 p-3.5 bg-indigo-950/40 border border-indigo-500/10 rounded-xl text-xs hover:border-indigo-500/25 transition duration-150"
                  >
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-300 text-[10px] font-bold shrink-0 mt-0.5 border border-indigo-500/20">
                      {idx + 1}
                    </span>
                    <p className="text-slate-300 leading-relaxed font-light">{suggestion}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <div className="py-12 text-center bg-white/5 border border-white/5 rounded-xl text-slate-400 text-sm font-light">
            Click "Re-Run AI Stock Audit" to analyze real-time buyer demand near your store.
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setEditingProduct(null)}>
          <div
            className="bg-white rounded-2xl border border-gray-100 shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <span className="text-xs font-semibold tracking-widest text-indigo-700 uppercase block mb-1">
                  Edit Product
                </span>
                <h3 className="text-lg font-serif text-gray-900">{editingProduct.name}</h3>
              </div>
              <button
                onClick={() => setEditingProduct(null)}
                className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Product Name</label>
                  <input
                    type="text"
                    required
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Category</label>
                  <input
                    type="text"
                    value={editForm.category}
                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Regular Price ($)</label>
                  <input
                    type="text"
                    value={editForm.price}
                    onChange={(e) => setEditForm({ ...editForm, price: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">In-Store Price ($)</label>
                  <input
                    type="text"
                    value={editForm.storePrice}
                    onChange={(e) => setEditForm({ ...editForm, storePrice: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Stock Status</label>
                  <select
                    value={editForm.stockStatus}
                    onChange={(e) => setEditForm({ ...editForm, stockStatus: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  >
                    <option value="In Stock">In Stock</option>
                    <option value="Limited Stock">Limited Stock</option>
                    <option value="Special Order Only">Special Order Only</option>
                    <option value="Temporarily Out of Stock">Temporarily Out of Stock</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Origin</label>
                  <input
                    type="text"
                    value={editForm.origin}
                    onChange={(e) => setEditForm({ ...editForm, origin: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">ABV</label>
                  <input
                    type="text"
                    value={editForm.abv}
                    onChange={(e) => setEditForm({ ...editForm, abv: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Size</label>
                  <input
                    type="text"
                    value={editForm.size}
                    onChange={(e) => setEditForm({ ...editForm, size: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Tasting Notes (comma separated)</label>
                <input
                  type="text"
                  value={editForm.tastingNotes}
                  onChange={(e) => setEditForm({ ...editForm, tastingNotes: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">UPC Barcode</label>
                <input
                  type="text"
                  placeholder="Scan or type barcode to attach it to this product"
                  value={editForm.upc || ""}
                  onChange={(e) => setEditForm({ ...editForm, upc: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition font-mono"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  If your barcode scanner couldn't find this product automatically, scan it here (or type the code)
                  and save — future scans will then find it directly.
                </p>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Product Image URL</label>
                <div className="flex gap-3 items-start">
                  <input
                    type="url"
                    placeholder="https://i.imgur.com/yourimage.jpg"
                    value={editForm.imageUrl || ""}
                    onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                    className="flex-1 px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition"
                  />
                  <div className="w-16 h-16 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
                    {editForm.imageUrl ? (
                      <img
                        src={editForm.imageUrl}
                        alt="Preview"
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-gray-300" />
                    )}
                  </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">No file upload yet — paste a hosted image link (Imgur, Google Drive public link, etc.) instead. Products with a UPC also get real photos automatically from the daily lookup cron.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Description</label>
                  <textarea
                    rows={2}
                    value={editForm.description}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-bold text-gray-500 tracking-wider mb-1.5">Food Pairing</label>
                  <textarea
                    rows={2}
                    value={editForm.foodPairing}
                    onChange={(e) => setEditForm({ ...editForm, foodPairing: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-gray-50/70 border border-gray-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 bg-amber-950 hover:bg-amber-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition flex items-center gap-2 cursor-pointer disabled:bg-gray-300"
                >
                  <Save className="w-3.5 h-3.5 text-amber-300" />
                  {isSavingEdit ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-5 py-2.5 border border-gray-200 text-gray-600 hover:bg-gray-50 font-semibold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
