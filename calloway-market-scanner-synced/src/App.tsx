import React, { useState, useEffect } from "react";
import { Product, AiInsightsResponse } from "./types";
import CustomerCatalog from "./components/CustomerCatalog";
import MerchantDashboard from "./components/MerchantDashboard";
import { Store, ShieldAlert, BarChart3, MapPin, Eye, Lock, CheckCircle2, AlertCircle, Phone, Clock, ArrowUp } from "lucide-react";
import callowayLogo from "./assets/calloway-logo.png";

export default function App() {
  const [viewMode, setViewMode] = useState<"customer" | "merchant">("customer");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchCount, setSearchCount] = useState(0); // Track customer activity to trigger refetches

  const [merchantKey, setMerchantKey] = useState<string>(() => {
    return sessionStorage.getItem("calloway_merchant_key") || "";
  });
  const [isUnlocked, setIsUnlocked] = useState<boolean>(() => {
    return !!sessionStorage.getItem("calloway_merchant_key");
  });
  const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);

  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);
  const [passcode, setPasscode] = useState("");
  const [passcodeError, setPasscodeError] = useState("");

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

  // Attempts to get the visitor's real GPS coordinates from their browser
  // (asks permission once). Resolves to null if denied, unavailable, or
  // the person doesn't respond within 5 seconds — the server automatically
  // falls back to IP-based location in that case, so this never blocks
  // the search from being logged.
  const getBrowserLocation = (): Promise<{ latitude: number; longitude: number } | null> => {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => resolve(null), // permission denied or error — fall back silently
        { timeout: 5000, maximumAge: 600000 } // reuse a location up to 10 min old
      );
    });
  };

  // Post search query to Express server to record local store demand logs.
  // Includes real GPS coordinates when the visitor grants browser location
  // access; the server falls back to IP-based location automatically when
  // they don't, so this always logs a real location either way.
  const handleSearchLog = async (query: string, category: string) => {
    try {
      const location = await getBrowserLocation();
      const res = await fetch("/api/searches", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          category,
          ...(location
            ? { latitude: location.latitude, longitude: location.longitude }
            : {}),
        }),
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
    <div className="min-h-screen bg-white flex flex-col font-sans text-gray-900">
      <header className="sticky top-0 bg-white border-b border-gray-100 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => {
                if (!isUnlocked) {
                  setIsPasscodeModalOpen(true);
                }
              }}
              title={isUnlocked ? "Merchant Mode Unlocked" : "Click to authenticate"}
            >
              <div>
                <img
                  src={callowayLogo}
                  alt="Calloway Market"
                  className="h-12 w-auto mb-1.5 group-hover:scale-105 transition"
                />
                <span className="text-[10px] uppercase font-bold tracking-widest text-amber-800 mt-1 block">
                  Bakersfield, CA {isUnlocked && "🔓"}
                </span>
              </div>
            </div>

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

      <footer className="bg-white border-t border-gray-100 py-8 text-gray-500 font-light">
        <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-amber-900 mt-0.5 shrink-0" />
            <span>2816 Calloway Dr, Unit 100<br />Bakersfield, CA 93312</span>
          </div>
          <div className="flex items-start gap-2.5">
            <Phone className="w-4 h-4 text-amber-900 mt-0.5 shrink-0" />
            <a href="tel:+16618296889" className="hover:text-amber-900 transition">(661) 829-6889</a>
          </div>
          <div className="flex items-start gap-2.5">
            <Clock className="w-4 h-4 text-amber-900 mt-0.5 shrink-0" />
            <span>Mon–Thu: 6AM–12AM<br />Fri–Sat: 6AM–2AM<br />Sun: 7AM–11PM</span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 mt-6 pt-6 border-t border-gray-100 text-center text-xs">
          <div 
            onClick={() => setIsPasscodeModalOpen(true)}
            className="cursor-pointer hover:text-amber-900 transition active:scale-98 font-medium inline-block"
            title="Merchant Login"
          >
            <span>© 2026 Calloway Market.</span>
          </div>
        </div>
      </footer>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 right-6 z-30 w-11 h-11 rounded-full bg-[#E4002B] text-white flex items-center justify-center shadow-lg hover:bg-[#c40025] transition cursor-pointer"
          title="Back to top"
        >
          <ArrowUp className="w-5 h-5" />
        </button>
      )}

      {isPasscodeModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 max-w-sm w-full p-6 shadow-2xl relative space-y-4">
            <button
              onClick={() => {
                setIsPasscodeModalOpen(false);
                setPasscode("");
                setPasscodeError("");
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 text-sm cursor-pointer"
            >
              ✕
            </button>
            
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-amber-50 text-amber-900 rounded-full flex items-center justify-center mx-auto border border-amber-200">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-serif italic text-lg text-gray-900">Merchant Authentication</h3>
              <p className="text-xs text-gray-500 font-light leading-relaxed">
                Please enter the secure Calloway Market passcode to activate store inventory and real-time demand insights.
              </p>
            </div>

            <form onSubmit={handleUnlock} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[9px] uppercase tracking-widest font-bold text-gray-400">
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
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-amber-900 focus:border-amber-900 transition text-center font-mono tracking-widest"
                />
              </div>

              {passcodeError && (
                <div className="p-3 bg-rose-50 text-rose-700 rounded-xl text-[10px] font-medium flex items-center gap-2 border border-rose-200 leading-normal">
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
                  className="flex-1 py-2.5 bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold rounded-xl transition cursor-pointer border border-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-950 hover:bg-amber-900 text-white text-xs font-semibold rounded-xl transition cursor-pointer"
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
