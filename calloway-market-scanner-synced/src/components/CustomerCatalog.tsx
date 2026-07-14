import React, { useState, useRef, useEffect } from "react";
import { Search, MapPin, Inbox, CheckCircle2, ChevronRight, ChevronLeft, ChevronUp, FileText, Info, ShoppingBag, ShoppingCart, Menu, Home, Store, X, Wine, Martini, Beer, Zap, Cookie, CupSoda, Package, Droplet, Coffee } from "lucide-react";
import { Product } from "../types";
import { motion, AnimatePresence } from "motion/react";
import callowayLogo from "../assets/calloway-logo.png";

interface CustomerCatalogProps {
  products: Product[];
  isLoading: boolean;
  onSearchLog: (query: string, category: string) => void;
}

interface PromoSettings {
  imageUrl: string;
  height: number;
  headline: string;
  subtext: string;
  buttonLabel: string;
  buttonUrl: string;
}

export default function CustomerCatalog({ products, isLoading, onSearchLog }: CustomerCatalogProps) {
  const triggerSearchFetch = () => {};

  const DOORDASH_STORE_ID = "34675059";
  const GRUBHUB_RESTAURANT_SLUG = "calloway-market-2816-calloway-dr-bakersfield";
  const GRUBHUB_RESTAURANT_ID = "6330952";

  const getDoorDashUrl = (product?: Product) => {
    return `https://www.doordash.com/convenience/store/${DOORDASH_STORE_ID}?event_type=autocomplete&pickup=false`;
  };

  const getGrubhubUrl = (product?: Product) => {
    return `https://www.grubhub.com/restaurant/${GRUBHUB_RESTAURANT_SLUG}/${GRUBHUB_RESTAURANT_ID}`;
  };

  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Promo banner — fetched from the merchant-editable settings endpoint.
  // Falls back to nothing shown if the merchant hasn't configured one yet.
  const [promo, setPromo] = useState<PromoSettings | null>(null);
  useEffect(() => {
    fetch("/api/settings/promo")
      .then((r) => r.json())
      .then(setPromo)
      .catch(() => {});
  }, []);

  const [signupEmail, setSignupEmail] = useState("");
  const [signupStatus, setSignupStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [signupCouponCode, setSignupCouponCode] = useState("");
  const [signupErrorMsg, setSignupErrorMsg] = useState("");

  const handleEmailSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signupEmail.trim()) return;
    setSignupStatus("loading");
    setSignupErrorMsg("");
    try {
      const res = await fetch("/api/email-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signupEmail.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.couponCode) {
        setSignupCouponCode(data.couponCode);
        setSignupStatus("success");
      } else {
        setSignupErrorMsg(data.error || "Something went wrong. Please try again.");
        setSignupStatus("error");
      }
    } catch (err) {
      setSignupErrorMsg("Could not reach the server. Please check your connection and try again.");
      setSignupStatus("error");
    }
  };

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isInquiring, setIsInquiring] = useState(false);
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryContact, setInquiryContact] = useState("");
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  // Order choice sheet — shown whenever the person taps "Add to cart" on a
  // product, or the "Order" tab in the bottom nav. Lets them pick DoorDash
  // or Grubhub instead of always going straight to one service.
  const [orderSheetProduct, setOrderSheetProduct] = useState<Product | null>(null);
  const [showGenericOrderSheet, setShowGenericOrderSheet] = useState(false);
  const orderSheetOpen = !!orderSheetProduct || showGenericOrderSheet;

  const closeOrderSheet = () => {
    setOrderSheetProduct(null);
    setShowGenericOrderSheet(false);
  };

  const handleAddToDoorDash = (product: Product) => {
    onSearchLog(`DoorDash Redirect: ${product.name}`, product.category);
    triggerSearchFetch();
    window.open(getDoorDashUrl(product), "_blank");
  };

  const handleAddToGrubhub = (product: Product) => {
    onSearchLog(`Grubhub Redirect: ${product.name}`, product.category);
    triggerSearchFetch();
    window.open(getGrubhubUrl(product), "_blank");
  };

  const confirmOrderChoice = (service: "doordash" | "grubhub") => {
    if (orderSheetProduct) {
      if (service === "doordash") handleAddToDoorDash(orderSheetProduct);
      else handleAddToGrubhub(orderSheetProduct);
    } else {
      onSearchLog(`${service === "doordash" ? "DoorDash" : "Grubhub"} Redirect: Store Order`, "Order");
      window.open(service === "doordash" ? getDoorDashUrl() : getGrubhubUrl(), "_blank");
    }
    closeOrderSheet();
  };

  // Store Info — replaces the previous non-functional "Account" tab, since
  // there's no customer login system on this site. Shows real store details.
  const [isStoreInfoOpen, setIsStoreInfoOpen] = useState(false);

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName.trim() || !inquiryContact.trim()) return;
    if (selectedProduct) {
      onSearchLog(`Inquiry: ${selectedProduct.name}`, selectedProduct.category);
      triggerSearchFetch();
    }
    setInquirySubmitted(true);
    setTimeout(() => {
      setIsInquiring(false);
      setInquirySubmitted(false);
      setInquiryName("");
      setInquiryContact("");
      setSelectedProduct(null);
    }, 4000);
  };

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean)));

  const term = searchTerm.toLowerCase();
  const searchActive = term.trim().length >= 2;
  const searchResults = products.filter((product) => {
    if (!searchActive) return false;
    return (
      product.name.toLowerCase().includes(term) ||
      (product.description && product.description.toLowerCase().includes(term)) ||
      (product.subcategory && product.subcategory.toLowerCase().includes(term)) ||
      (product.origin && product.origin.toLowerCase().includes(term)) ||
      product.tastingNotes.some((note) => note.toLowerCase().includes(term))
    );
  });

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchTerm.trim().length >= 2) {
      onSearchLog(searchTerm.trim(), "Search");
      triggerSearchFetch();
    }
  };

  const getStockBadgeColor = (status: Product["stockStatus"]) => {
    switch (status) {
      case "In Stock":
        return "bg-emerald-50 text-emerald-700 border-emerald-200";
      case "Limited Stock":
        return "bg-amber-50 text-amber-700 border-amber-200";
      case "Special Order Only":
        return "bg-indigo-50 text-indigo-700 border-indigo-200";
      case "Temporarily Out of Stock":
        return "bg-rose-50 text-rose-700 border-rose-200";
      default:
        return "bg-gray-50 text-gray-600 border-gray-200";
    }
  };

  const getCategoryIcon = (iconName?: string) => {
    switch (iconName) {
      case "Wine": return Wine;
      case "Martini": return Martini;
      case "Beer": return Beer;
      case "Zap": return Zap;
      case "Cookie": return Cookie;
      case "CupSoda": return CupSoda;
      case "Droplet": return Droplet;
      case "Coffee": return Coffee;
      default: return Package;
    }
  };

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollRow = (key: string, dir: 1 | -1) => {
    const el = rowRefs.current.get(key);
    if (el) el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  const ProductCard = ({ product }: { product: Product }) => {
    const IconComp = getCategoryIcon(product.iconName);
    const displayPrice = product.storePrice ?? product.price;
    return (
      <div
        onClick={() => setSelectedProduct(product)}
        className="snap-start shrink-0 w-[220px] bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:shadow-md transition"
      >
        <div className="h-36 bg-gray-50 flex items-center justify-center relative">
          {product.featured && (
            <span className="absolute top-2 left-2 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full">
              Featured
            </span>
          )}
          {(product as any).imageUrl ? (
            <img
              src={(product as any).imageUrl}
              alt={product.name}
              className="w-full h-full object-contain p-3"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            <IconComp className="w-14 h-14 text-gray-300" strokeWidth={1.5} />
          )}
        </div>
        <div className="p-3.5 space-y-2">
          <h3 className="text-[15px] font-semibold text-gray-900 leading-snug line-clamp-2 min-h-[40px]">
            {product.name}
          </h3>
          <div className="flex items-center justify-between">
            {displayPrice ? (
              <span className="text-lg font-bold text-gray-900">${displayPrice.toFixed(2)}</span>
            ) : (
              <span className="text-xs text-gray-400 uppercase">Price unavailable</span>
            )}
            <span className={`text-[9px] uppercase tracking-wide px-2 py-0.5 border rounded-full font-bold ${getStockBadgeColor(product.stockStatus)}`}>
              {product.stockStatus === "In Stock" ? "In Stock" : "Limited"}
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOrderSheetProduct(product);
            }}
            className="w-full py-2.5 bg-[#E4002B] hover:bg-[#c40025] text-white text-sm font-bold rounded-full transition cursor-pointer"
          >
            Add to cart
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-10 bg-white pb-24" id="customer-view">
      <div className="bg-[#111111] text-white px-4 py-3 flex items-center justify-between">
        <button className="p-1.5" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </button>
        <img src={callowayLogo} alt="Calloway Market" className="h-9 w-auto" />
        <div className="flex items-center gap-1 text-xs font-semibold">
          <ShoppingBag className="w-4 h-4 text-[#E4002B]" />
          <div className="text-right leading-tight">
            <div className="text-gray-300 text-[10px] font-normal">Delivery</div>
            <div className="underline">Bakersfield</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <form onSubmit={handleSearchSubmit} className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search Calloway Market"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3 bg-gray-100 rounded-full text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-[#E4002B]/30 text-sm"
          />
        </form>
      </div>

      {promo && (promo.imageUrl || promo.headline) && (
        <div className="px-4 pt-4">
          <div
            className="rounded-2xl overflow-hidden relative bg-gray-100"
            style={{ height: `${promo.height || 220}px` }}
          >
            {promo.imageUrl && (
              <img
                src={promo.imageUrl}
                alt={promo.headline || "Promotion"}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            )}
            {(promo.headline || promo.subtext || promo.buttonLabel) && (
              <div className="absolute inset-0 bg-black/25 flex flex-col justify-center px-6">
                {promo.headline && (
                  <h2 className="text-white text-2xl font-extrabold leading-tight max-w-xs drop-shadow-lg">
                    {promo.headline}
                  </h2>
                )}
                {promo.subtext && (
                  <p className="text-white/90 text-sm mt-1 max-w-xs drop-shadow">{promo.subtext}</p>
                )}
                {promo.buttonLabel && (
                  <button
                    onClick={() =>
                      promo.buttonUrl
                        ? window.open(promo.buttonUrl, "_blank")
                        : setShowGenericOrderSheet(true)
                    }
                    className="mt-3 self-start px-5 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-gray-100 transition cursor-pointer"
                  >
                    {promo.buttonLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#1a1a1a] to-[#3a3a3a] text-white p-6">
          {signupStatus === "success" ? (
            <div className="space-y-2">
              <p className="text-sm font-bold uppercase tracking-wide text-[#ff6b81]">You're In!</p>
              <p className="font-mono text-2xl bg-black/30 rounded-lg py-3 px-4 inline-block select-all">
                {signupCouponCode}
              </p>
              <p className="text-white/50 text-[11px]">
                Show this at checkout for 10% off. Excludes cigarettes, tobacco, lotto & lottery. Must be 21+.
              </p>
            </div>
          ) : (
            <form onSubmit={handleEmailSignup} className="space-y-3">
              <h2 className="text-xl font-extrabold leading-snug">Get 10% Off<br/>Your Next Visit</h2>
              <p className="text-white/60 text-xs">Enter your email for an instant coupon code.</p>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="you@email.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  disabled={signupStatus === "loading"}
                  className="flex-1 px-4 py-2.5 bg-white/10 border border-white/20 rounded-full text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-[#E4002B]/50"
                />
                <button
                  type="submit"
                  disabled={signupStatus === "loading"}
                  className="px-5 py-2.5 bg-[#E4002B] hover:bg-[#c40025] text-white text-xs font-bold rounded-full transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {signupStatus === "loading" ? "..." : "Get Code"}
                </button>
              </div>
              {signupStatus === "error" && <p className="text-rose-300 text-xs">{signupErrorMsg}</p>}
            </form>
          )}
        </div>
      </div>

      {searchActive && (
        <div className="px-4 pt-6 space-y-4">
          <h2 className="text-lg font-extrabold text-gray-900">
            Results for "{searchTerm}"
          </h2>
          {searchResults.length === 0 ? (
            <div className="bg-gray-50 rounded-2xl p-8 text-center space-y-3">
              <Inbox className="w-8 h-8 text-gray-300 mx-auto" />
              <p className="text-sm text-gray-500">No items found. Try a different search term.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {searchResults.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      )}

      {!searchActive && !isLoading && (
        <div className="pt-6 space-y-8">
          {categories.map((category) => {
            const items = products.filter((p) => p.category === category).slice(0, 16);
            if (items.length === 0) return null;
            return (
              <div key={category}>
                <div className="px-4 flex items-center justify-between mb-3">
                  <h2 className="text-lg font-extrabold text-gray-900">{category}</h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => scrollRow(category, -1)}
                      className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition cursor-pointer"
                      aria-label={`Scroll ${category} left`}
                    >
                      <ChevronLeft className="w-4 h-4 text-gray-700" />
                    </button>
                    <button
                      onClick={() => scrollRow(category, 1)}
                      className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition cursor-pointer"
                      aria-label={`Scroll ${category} right`}
                    >
                      <ChevronRight className="w-4 h-4 text-gray-700" />
                    </button>
                  </div>
                </div>
                <div
                  ref={(el) => { if (el) rowRefs.current.set(category, el); }}
                  className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2 scrollbar-hide"
                  style={{ scrollbarWidth: "none" }}
                >
                  {items.map((product) => (
                    <ProductCard key={product.id} product={product} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-28 space-y-4">
          <div className="w-8 h-8 border-2 border-[#E4002B] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-400 text-sm">Loading products...</p>
        </div>
      )}

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-20 right-4 z-40 w-12 h-12 rounded-full bg-[#111111] text-white flex items-center justify-center shadow-lg hover:bg-[#2a2a2a] transition cursor-pointer"
          title="Back to top"
          aria-label="Scroll back to top"
        >
          <ChevronUp className="w-6 h-6" />
        </button>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex items-center justify-around py-2.5 z-40">
        <button
          onClick={() => searchInputRef.current?.focus()}
          className="flex flex-col items-center gap-1 text-gray-500 hover:text-[#E4002B] transition cursor-pointer"
        >
          <Search className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Search</span>
        </button>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="flex flex-col items-center gap-1 text-[#E4002B] transition cursor-pointer"
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Home</span>
        </button>
        <button
          onClick={() => setIsStoreInfoOpen(true)}
          className="flex flex-col items-center gap-1 text-gray-500 hover:text-[#E4002B] transition cursor-pointer"
        >
          <Store className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Store Info</span>
        </button>
        <button
          type="button"
          onClick={() => setShowGenericOrderSheet(true)}
          className="flex flex-col items-center gap-1 text-gray-500 hover:text-[#E4002B] transition cursor-pointer"
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Order</span>
        </button>
      </div>

      {/* Order choice sheet — DoorDash or Grubhub */}
      <AnimatePresence>
        {orderSheetOpen && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
            onClick={closeOrderSheet}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-gray-900">Choose delivery service</h3>
                <button onClick={closeOrderSheet} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {orderSheetProduct && (
                <p className="text-sm text-gray-500">{orderSheetProduct.name}</p>
              )}
              <button
                onClick={() => confirmOrderChoice("doordash")}
                className="w-full py-3.5 bg-[#FF3008] hover:bg-[#E52B07] text-white font-bold text-sm rounded-full transition cursor-pointer flex items-center justify-center gap-2"
              >
                🛵 Order on DoorDash
              </button>
              <button
                onClick={() => confirmOrderChoice("grubhub")}
                className="w-full py-3.5 bg-[#F63440] hover:bg-[#d92b36] text-white font-bold text-sm rounded-full transition cursor-pointer flex items-center justify-center gap-2"
              >
                🍔 Order on Grubhub
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Store Info sheet */}
      <AnimatePresence>
        {isStoreInfoOpen && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
            onClick={() => setIsStoreInfoOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-gray-900">Calloway Market</h3>
                <button onClick={() => setIsStoreInfoOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-[#E4002B] shrink-0 mt-0.5" />
                <p className="text-sm text-gray-700">2816 Calloway Dr #100<br/>Bakersfield, CA 93312</p>
              </div>
              <p className="text-xs text-gray-400">
                For current hours, phone, and directions, use the map/DoorDash listing or contact the store directly.
              </p>
              <button
                onClick={() => {
                  setIsStoreInfoOpen(false);
                  setShowGenericOrderSheet(true);
                }}
                className="w-full py-3 bg-[#E4002B] hover:bg-[#c40025] text-white font-bold text-sm rounded-full transition cursor-pointer"
              >
                Order Delivery
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Product Detail Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-white border border-gray-200 w-full max-w-2xl rounded-2xl overflow-hidden shadow-2xl my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {(selectedProduct as any).imageUrl ? (
                <div className="bg-gray-50 relative flex items-center justify-center" style={{ minHeight: "260px" }}>
                  <div className="flex justify-between items-start absolute top-4 left-4 right-4 z-10">
                    <span className="text-[11px] uppercase tracking-[0.12em] bg-white/90 px-3 py-1 border border-gray-200 rounded-full font-bold text-gray-700">
                      {selectedProduct.category}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedProduct(null);
                        setIsInquiring(false);
                        setInquirySubmitted(false);
                      }}
                      className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 p-1.5 rounded-full transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <img
                    src={(selectedProduct as any).imageUrl}
                    alt={selectedProduct.name}
                    className="max-h-56 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
              ) : (
                <div className={`bg-gradient-to-br ${selectedProduct.imageColor} text-white p-8 relative`}>
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
                  <div className="flex justify-between items-start relative z-10">
                    <span className="text-[11px] uppercase tracking-[0.12em] bg-black/40 px-3 py-1 border border-white/10 rounded-full font-bold text-white">
                      {selectedProduct.category}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedProduct(null);
                        setIsInquiring(false);
                        setInquirySubmitted(false);
                      }}
                      className="text-white/85 hover:text-white hover:bg-white/10 p-1.5 rounded-full transition cursor-pointer"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}

              <div className="px-6 md:px-8 pt-6">
                <h2 className="text-2xl md:text-3xl font-extrabold text-gray-900">{selectedProduct.name}</h2>
                <p className="text-gray-400 font-mono text-xs uppercase tracking-wider mt-2">
                  Origin: {selectedProduct.origin} • {selectedProduct.category === "Snack" ? "Type: Gourmet Snack" : (selectedProduct.category === "Soda" || selectedProduct.abv === "0%" || selectedProduct.abv === "0" || selectedProduct.abv === "0.0%" ? "Type: Non-Alcoholic Soda" : `Strength: ${selectedProduct.abv}`)} • Volume: {selectedProduct.size}
                </p>
              </div>

              <div className="p-6 md:p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                {!isInquiring ? (
                  <>
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-2">The Story</h4>
                        <p className="text-gray-600 text-sm leading-relaxed">{selectedProduct.description}</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                          <h4 className="text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-3">Tasting Profile</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedProduct.tastingNotes.map((note, idx) => (
                              <span key={idx} className="text-xs px-2.5 py-1 bg-white border border-gray-200 rounded-full text-gray-700">
                                {note}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                          <h4 className="text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-3">Epicurean Pairing</h4>
                          <p className="text-gray-600 text-xs leading-relaxed italic">"{selectedProduct.foodPairing}"</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-red-50 border border-red-100 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-1.5">Delivery Options</h4>
                        <span className="text-sm font-semibold text-gray-800">Available via DoorDash or Grubhub</span>
                      </div>
                      <span className="text-xs text-emerald-700 font-bold uppercase tracking-wider bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1">
                        Bakersfield Courier Active
                      </span>
                    </div>

                    <div className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <Info className="w-5 h-5 text-[#E4002B] shrink-0 mt-0.5" />
                      <div className="text-xs text-gray-600 space-y-1">
                        <span className="font-bold text-gray-900 block uppercase tracking-wider">Availability Status: {selectedProduct.stockStatus}</span>
                        <p className="leading-relaxed">
                          This item is carried at Calloway Market on Calloway Drive. For immediate checkout and courier delivery to your doorstep, please order directly through DoorDash or Grubhub.
                        </p>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-gray-100 flex flex-col md:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => handleAddToDoorDash(selectedProduct)}
                        className="flex-1 px-6 py-4 bg-[#FF3008] text-white hover:bg-[#E52B07] font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer rounded-full"
                      >
                        🛵 Order on DoorDash
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddToGrubhub(selectedProduct)}
                        className="flex-1 px-6 py-4 bg-[#F63440] text-white hover:bg-[#d92b36] font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer rounded-full"
                      >
                        🍔 Order on Grubhub
                      </button>
                      <button
                        onClick={() => setIsInquiring(true)}
                        className="flex-1 px-6 py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer rounded-full"
                      >
                        <FileText className="w-4 h-4" /> Submit Inquiry
                      </button>
                      <button
                        onClick={() => setSelectedProduct(null)}
                        className="px-6 py-4 border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-bold text-[11px] uppercase tracking-widest transition cursor-pointer rounded-full"
                      >
                        Keep Browsing
                      </button>
                    </div>
                  </>
                ) : (
                  <form onSubmit={handleInquirySubmit} className="space-y-6">
                    {inquirySubmitted ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-8 space-y-5"
                      >
                        <div className="w-16 h-16 bg-red-50 text-[#E4002B] border border-red-200 rounded-full flex items-center justify-center mx-auto">
                          <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-extrabold text-gray-900">Inquiry Logged</h3>
                          <p className="text-gray-600 text-sm max-w-md mx-auto leading-relaxed">
                            Your inquiry for <span className="font-medium text-gray-900">{selectedProduct.name}</span> has been recorded.
                          </p>
                        </div>
                        <p className="text-[10px] uppercase tracking-widest text-[#E4002B] bg-red-50 border border-red-200 rounded-full px-4 py-3 max-w-sm mx-auto">
                          For immediate ordering, please use the DoorDash or Grubhub links — inquiries here are not yet monitored for callbacks.
                        </p>
                      </motion.div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <h3 className="font-extrabold text-xl text-gray-900">Product Inquiry Form</h3>
                          <p className="text-gray-500 text-xs leading-relaxed">
                            Submit your contact details and we'll follow up about this item.
                          </p>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-2">Your Full Name</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Jordan Smith"
                              value={inquiryName}
                              onChange={(e) => setInquiryName(e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#E4002B] focus:border-[#E4002B]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-2">Contact Number or Email</label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. +1 (555) 234-5678 or name@domain.com"
                              value={inquiryContact}
                              onChange={(e) => setInquiryContact(e.target.value)}
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#E4002B] focus:border-[#E4002B]"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#E4002B] tracking-[0.12em] mb-2">Special Notes / Quantity (Optional)</label>
                            <textarea
                              rows={2}
                              placeholder="e.g. Looking for a full case, or have a question about this item."
                              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-[#E4002B] focus:border-[#E4002B] resize-none"
                            />
                          </div>
                        </div>
                        <div className="pt-6 border-t border-gray-100 flex gap-3">
                          <button
                            type="submit"
                            className="flex-1 px-6 py-4 bg-gray-900 hover:bg-gray-800 text-white font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer rounded-full"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Submit Inquiry
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsInquiring(false)}
                            className="px-6 py-4 border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-bold text-[11px] uppercase tracking-widest transition cursor-pointer rounded-full"
                          >
                            Back to Details
                          </button>
                        </div>
                      </>
                    )}
                  </form>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
