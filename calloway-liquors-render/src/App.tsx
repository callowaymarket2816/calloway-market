import React, { useState, useEffect } from "react";
import { Product, AiInsightsResponse } from "./types";
import CustomerCatalog from "./components/CustomerCatalog";
import MerchantDashboard from "./components/MerchantDashboard";
import { Store, ShieldAlert, BarChart3, MapPin, Eye, Lock, CheckCircle2, AlertCircle } from "lucide-react";

export default function App() {
  const [viewMode, setViewMode] = useState<"customer" | "merchant">("customer");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchCount, setSearchCount] = useState(0); // Track customer activity to trigger refetches

  // Merchant lock/unlock state.
  // SECURITY FIX: previously stored a plain "true"/"false" flag in
  // localStorage that persisted forever and proved nothing to the server.
  // Now we store the actual verified merchant key in sessionStorage (cleared
  // when the browser tab closes) and re-send it on every merchant request.
  const [merchantKey, setMerchantKey] = useState<string>(() => {
    return sessionStorage.getItem("calloway_merchant_key") || "";
  });
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return !!sessionStorage.getItem("calloway_merchant_key");
  });
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");

  // Fetch initial product catalog from server
  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/products");
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch (error) {
      console.error("Failed to fetch products:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Post search query to Express server to record local store demand logs
  const handleSearchLog = async (query: string, category: string) => {
    try {
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, category }),
      });
      if (res.ok) {
        // Increment search count to trigger real-time updates inside the dashboard if it's open
        setSearchCount((prev) => prev + 1);
      }
    } catch (error) {
      console.error("Failed to log search on server:", error);
    }
  };

  // Run server-side Gemini AI insights
  const handleRunAiInsights = async (): Promise<AiInsightsResponse & { needsApiKey?: boolean }> => {
    try {
      const res = await fetch("/api/analytics/ai-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Key": merchantKey,
        },
      });
      if (!res.ok) throw new Error("Failed to load AI retail audit.");
      return await res.json();
    } catch (error) {
      console.error(error);
      return {
        insights: "Could not generate AI insights at this time.",
        suggestions: ["Ensure server connectivity is fully established."],
        generatedAt: new Date().toISOString(),
      };
    }
  };

  // Handle Passcode Unlock
  // SECURITY FIX: previously this checked the entered passcode against
  // hardcoded plaintext strings ("calloway2816", "2816", "calloway") visible
  // to anyone who opened browser dev tools, and unlocking only flipped a
  // local boolean — the real API endpoints were never actually protected.
  //
  // Now: the entered code IS the merchant key, and we verify it against the
  // server itself (which checks it against MERCHANT_API_KEY, a real secret
  // set in your hosting platform's environment variables, never in code).
  // Only a server-confirmed correct key unlocks merchant features, and that
  // same key is then sent on every merchant request going forward.
  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasscodeError("");
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Merchant-Key": passcode.trim(),
        },
        body: JSON.stringify({ products: [] }), // no-op verification call, adds nothing
      });
      if (res.status === 401 || res.status === 503) {
        setPasscodeError(
          res.status === 503
            ? "Merchant login is not configured on this server yet. Set MERCHANT_API_KEY in your hosting secrets."
            : "Invalid access key. Please check with the store owner."
        );
        return;
      }
      if (!res.ok) {
        setPasscodeError("Could not verify access key. Please try again.");
        return;
      }
      // Server confirmed this key is valid — store it for this session only.
      setMerchantKey(passcode.trim());
      sessionStorage.setItem("calloway_merchant_key", passcode.trim());
      setIsUnlocked(true);
      setViewMode("merchant");
      setIsPasscodeModalOpen(false);
      setPasscode("");
    } catch (error) {
      setPasscodeError("Could not reach the server to verify access. Check your connection.");
    }
  };

  const handleLockMerchant = () => {
    setIsUnlocked(false);
    setMerchantKey("");
    sessionStorage.removeItem("calloway_merchant_key");
    setViewMode("customer");
  };

  return (
    <div className="min-h-screen bg-[#0C0B0A] flex flex-col font-sans text-[#F4F1ED]">
      {/* Universal Top Nav */}
      <header className="sticky top-0 bg-[#0C0B0A] border-b border-[#F4F1ED]/10 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Elegant Store Branding - Click circle 3 times or double click to trigger modal */}
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => {
                if (!isUnlocked) {
                  setIsPasscodeModalOpen(true);
                }
              }}
              title={isUnlocked ? "Merchant Mode Unlocked" : "Click to authenticate"}
            >
              <div className="w-10 h-10 rounded-full bg-[#C4A484] text-[#0C0B0A] flex items-center justify-center font-serif text-lg font-semibold shadow-inner group-hover:scale-105 transition">
                C
              </div>
              <div>
                <h1 className="text-xl font-serif font-semibold text-[#F4F1ED] tracking-tight leading-none group-hover:text-[#C4A484] transition">
                  Calloway Market
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-800 mt-1 block">
                  Bakersfield, CA {isUnlocked && "🔓"}
                </span>
              </div>
            </div>

            {/* Portal Toggle Tabs - ONLY shown if unlocked */}
            {isUnlocked ? (
              <div className="flex bg-gray-100 p-1 rounded-xl border border-gray-200/55">
                <button
                  onClick={() => setViewMode("customer")}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                    viewMode === "customer"
                      ? "bg-white text-amber-950 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  <Store className="w-3.5 h-3.5" />
                  Customer Showroom
                </button>
                <button
                  onClick={() => setViewMode("merchant")}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold tracking-wide uppercase transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                    viewMode === "merchant"
                      ? "bg-amber-950 text-white shadow-sm"
                      : "text-gray-600 hover:text-amber-900"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Merchant Portal
                </button>
                <button
                  onClick={handleLockMerchant}
                  className="px-2.5 py-2 text-gray-400 hover:text-rose-600 rounded-lg text-xs transition cursor-pointer"
                  title="Lock Merchant Portal"
                >
                  <Lock className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="text-xs text-gray-400 font-mono tracking-widest uppercase flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Bakersfield, CA
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className={`flex-grow max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-10 ${viewMode === "merchant" ? "bg-slate-50/50 text-gray-800" : ""}`}>
        {viewMode === "customer" ? (
          <CustomerCatalog
            products={products}
            isLoading={isLoading}
            onSearchLog={handleSearchLog}
          />
        ) : (
          <MerchantDashboard
            products={products}
            onRefreshAllData={fetchProducts}
            onRunAiInsights={handleRunAiInsights}
            searchCount={searchCount}
            merchantKey={merchantKey}
          />
        )}
      </main>

      {/* Subtle Visual Info Footer Bar */}
      <footer className="bg-[#0C0B0A] border-t border-[#F4F1ED]/10 py-6 text-center text-xs text-[#F4F1ED]/40 font-light">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-[#C4A484]" />
            <span>Calloway Market • Bakersfield, CA</span>
          </div>
          <div 
            onClick={() => setIsPasscodeModalOpen(true)}
            className="cursor-pointer hover:text-[#C4A484] transition active:scale-98 font-medium"
            title="Merchant Login"
          >
            <span>© 2026 Calloway Market.</span>
          </div>
        </div>
      </footer>

      {/* Passcode Unlock Modal */}
      {isPasscodeModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#121110] rounded-2xl border border-[#F4F1ED]/10 max-w-sm w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => {
                setIsPasscodeModalOpen(false);
                setPasscode("");
                setPasscodeError("");
              }}
              className="absolute top-4 right-4 text-[#F4F1ED]/40 hover:text-[#F4F1ED]/70 text-sm cursor-pointer"
            >
              ✕
            </button>
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-[#C4A484]/10 text-[#C4A484] rounded-full flex items-center justify-center mx-auto border border-[#C4A484]/20">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-serif italic text-lg text-[#F4F1ED]">Merchant Authentication</h3>
              <p className="text-xs text-[#F4F1ED]/50 font-light leading-relaxed">
                Please enter the secure Calloway Market passcode to activate store inventory and real-time demand insights.
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[9px] uppercase tracking-widest font-bold text-[#F4F1ED]/40">
                  Access Key Passcode
                </label>
                <input
                  type="password"
                  autoFocus
                  required
                  placeholder="Enter store passcode"
                  value={passcode}
                  onChange={(e) => {
                    setPasscode(e.target.value);
                    setPasscodeError("");
                  }}
                  className="w-full px-3.5 py-2.5 bg-[#0C0B0A] border border-[#F4F1ED]/10 rounded-xl text-xs text-[#F4F1ED] focus:outline-none focus:ring-1 focus:ring-[#C4A484] focus:border-[#C4A484] transition text-center font-mono tracking-widest"
                />
              </div>

              {passcodeError && (
                <div className="p-3 bg-rose-950/30 text-rose-300 rounded-xl text-[10px] font-medium flex items-center gap-2 border border-rose-900/30 leading-normal">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{passcodeError}</span>
                </div>
              )}

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasscodeModalOpen(false);
                    setPasscode("");
                    setPasscodeError("");
                  }}
                  className="flex-1 py-2.5 bg-[#0C0B0A] hover:bg-[#1a1816] text-[#F4F1ED]/70 text-xs font-semibold rounded-xl transition cursor-pointer border border-[#F4F1ED]/10"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-[#C4A484] hover:bg-[#b8956f] text-[#0C0B0A] text-xs font-semibold rounded-xl transition cursor-pointer"
                >
                  Authenticate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

