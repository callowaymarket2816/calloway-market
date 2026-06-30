import React, { useState } from "react";
import { Search, SlidersHorizontal, MapPin, Inbox, CheckCircle2, ChevronRight, FileText, Info, ShoppingBag, Trash2, Wine, Martini, Beer, Zap, Cookie, CupSoda, Package, Droplet, Coffee } from "lucide-react";
import { Product } from "../types";
import { motion, AnimatePresence } from "motion/react";
import callowayLogo from "../assets/calloway-logo.png";

interface CustomerCatalogProps {
  products: Product[];
  isLoading: boolean;
  onSearchLog: (query: string, category: string) => void;
}

export default function CustomerCatalog({ products, isLoading, onSearchLog }: CustomerCatalogProps) {
  // FIX: "Live Bakersfield Demand Radar" was removed from the customer
  // view per request (the merchant dashboard already has an equivalent,
  // more complete "recent searches" view via analytics.recentSearches).
  // This also removes the 8-second polling loop that was hitting the
  // server continuously just to feed that now-removed widget.
  // triggerSearchFetch is kept as a harmless no-op since several
  // search/category handlers below still call it.
  const triggerSearchFetch = () => {};

  const formatLocalTimeAgo = (isoString: string) => {
    const past = new Date(isoString).getTime();
    const diffMs = Date.now() - past;
    const diffMins = Math.round(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return new Date(isoString).toLocaleDateString();
  };

  // REMOVED: a getProductPrice() fallback used to be here that invented a
  // price based on guessing the category (e.g. "any whiskey = $79.99") any
  // time a real price was missing. That's a real risk for a liquor store —
  // showing a customer a price you never set. Real prices now come directly
  // from your verified inventory data; if one is ever missing, the product
  // should show "Price unavailable" rather than a guess (see render logic
  // below).

  const DOORDASH_URL = "https://www.doordash.com/convenience/store/34675059?event_type=autocomplete&pickup=false";

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("All");

  // Email signup for 10% off coupon - real signups stored server-side via
  // /api/email-signup, which generates a genuine unique code per person
  // and saves the email for future promo use.
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
  
  // DoorDash Redirection States
  const [redirectingProduct, setRedirectingProduct] = useState<Product | null>(null);
  const [isRedirectModalOpen, setIsRedirectModalOpen] = useState(false);

  // Inquiry form states
  const [isInquiring, setIsInquiring] = useState(false);
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryContact, setInquiryContact] = useState("");
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  // Legacy Reservation Cart states (maintained for compatibility)
  const [cart, setCart] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartName, setCartName] = useState("");
  const [cartContact, setCartContact] = useState("");
  const [cartSubmitted, setCartSubmitted] = useState(false);

  // DoorDash Redirect action
  const handleAddToDoorDash = (product: Product) => {
    // Log the selection event in Calloway's analytics
    onSearchLog(`DoorDash Redirect: ${product.name}`, product.category);
    triggerSearchFetch();
    setRedirectingProduct(product);
    setIsRedirectModalOpen(true);
    
    // Attempt automatic popup redirect
    window.open(DOORDASH_URL, "_blank");
  };

  // Add/Remove from cart handlers
  const handleAddToCart = (product: Product) => {
    handleAddToDoorDash(product);
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const handleCartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartName.trim() || !cartContact.trim() || cart.length === 0) return;

    // Log the reservation searches for all bottles in the cart to sync with merchant analytics
    cart.forEach((bottle) => {
      onSearchLog(`Reserve Cart Order: ${bottle.name}`, bottle.category);
    });

    setCartSubmitted(true);
    setTimeout(() => {
      setCart([]);
      setIsCartOpen(false);
      setCartSubmitted(false);
      setCartName("");
      setCartContact("");
    }, 5000);
  };

  // FIX: this used to be a hardcoded fictional list ("Whiskey", "Tequila",
  // "Craft Beer"...) that didn't match any category name in your real
  // inventory (which uses "Liquor", "Beer", "RTD", "Soda", "Water", etc.) —
  // meaning category filtering silently wouldn't have worked at all on real
  // data. Categories are now derived directly from whatever products are
  // actually loaded, so this always matches reality.
  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  // NEW: subcategories available within the currently selected category
  // (e.g. clicking "Liquor" reveals Whiskey & Bourbon, Tequila & Mezcal,
  // Vodka, Gin, Rum, Brandy & Cognac, Cordials & Liqueurs as their own
  // filter options). Only computed for the active category, and resets to
  // "All" whenever the top-level category changes.
  const subcategories = selectedCategory === "All"
    ? []
    : ["All", ...Array.from(new Set(
        products
          .filter((p) => p.category === selectedCategory && p.subcategory)
          .map((p) => p.subcategory as string)
      ))];

  // Filter products based on search term and category.
  // FIX: origin and tastingNotes are empty for most real inventory items
  // (no fabricated data filled in for them), so matching only on those plus
  // name/description was weaker than it could be. Added subcategory, which
  // is real, populated data for about 1 in 5 items (e.g. "Whiskey & Bourbon")
  // and a useful extra search dimension where it exists.
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === "All" || product.category === selectedCategory;
    const matchesSubcategory = selectedSubcategory === "All" || product.subcategory === selectedSubcategory;
    const term = searchTerm.toLowerCase();
    const matchesSearch =
      product.name.toLowerCase().includes(term) ||
      (product.description && product.description.toLowerCase().includes(term)) ||
      (product.subcategory && product.subcategory.toLowerCase().includes(term)) ||
      (product.origin && product.origin.toLowerCase().includes(term)) ||
      product.tastingNotes.some((note) => note.toLowerCase().includes(term));
    return matchesCategory && matchesSubcategory && matchesSearch;
  });

  // Log search on backend when user presses Enter or clicks Search button
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchTerm.trim().length >= 2) {
      onSearchLog(searchTerm.trim(), selectedCategory);
      triggerSearchFetch();
    }
  };

  // If category changes, log a search to record user browsing interest
  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory("All"); // reset subcategory filter when switching categories
    if (category !== "All") {
      onSearchLog(`Browse Category: ${category}`, category);
      triggerSearchFetch();
    }
  };

  const handleInquirySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName.trim() || !inquiryContact.trim()) return;
    
    // Log inquiry search trigger
    if (selectedProduct) {
      onSearchLog(`Inquiry: ${selectedProduct.name}`, selectedProduct.category);
      triggerSearchFetch();
    }

    setInquirySubmitted(true);
    setTimeout(() => {
      // Reset form
      setIsInquiring(false);
      setInquirySubmitted(false);
      setInquiryName("");
      setInquiryContact("");
      setSelectedProduct(null);
    }, 4000);
  };

  const getStockBadgeColor = (status: Product["stockStatus"]) => {
    switch (status) {
      case "In Stock":
        return "bg-emerald-950/40 text-emerald-300 border-emerald-500/20";
      case "Limited Stock":
        return "bg-amber-950/40 text-amber-300 border-amber-500/20";
      case "Special Order Only":
        return "bg-indigo-950/40 text-indigo-300 border-indigo-500/20";
      case "Temporarily Out of Stock":
        return "bg-rose-950/40 text-rose-300 border-rose-500/20";
      default:
        return "bg-[#121110] text-[#F4F1ED]/60 border-[#F4F1ED]/10";
    }
  };

  // We don't have real product photos in the system. Rather than fake one,
  // each item's real iconName field (already set per category when the
  // inventory was built — Wine, Martini, Beer, Zap, Cookie, CupSoda,
  // Package, Droplet, Coffee) maps to an honest generic icon instead.
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

  return (
    <div className="space-y-12" id="customer-view">
      {/* Editorial Header */}
      <div className="text-center max-w-3xl mx-auto space-y-6 py-8">
        <span className="text-[13px] md:text-sm font-bold tracking-[0.15em] text-[#C4A484] uppercase block">
          Liquor, Beer &amp; Everyday Essentials
        </span>
        <img
          src={callowayLogo}
          alt="Calloway Market"
          className="h-36 md:h-48 w-auto mx-auto"
        />
        <p className="text-[#F4F1ED]/70 text-base md:text-lg leading-relaxed font-light uppercase">
          Welcome to <span className="font-medium text-[#F4F1ED]">Calloway Market</span> in Bakersfield, CA — liquor, beer, RTD, soda, water, sports & energy drinks, snacks, and more. To offer on-demand convenience and delivery, we have partnered with DoorDash. Selecting any item will redirect you to our DoorDash storefront to place your order.
        </p>

        {/* 10% off email signup - real signup, real unique code per person,
            stored server-side for future promo emails. */}
        <div className="max-w-md mx-auto bg-[#121110] border border-[#C4A484]/30 p-6 text-left">
          {signupStatus === "success" ? (
            <div className="text-center space-y-2">
              <p className="text-[#C4A484] text-sm font-bold uppercase tracking-wider">You're In!</p>
              <p className="text-[#F4F1ED]/70 text-xs">
                {signupCouponCode && "Show this code at checkout for 10% off:"}
              </p>
              <p className="font-mono text-2xl text-[#F4F1ED] bg-[#0C0B0A] border border-[#C4A484]/40 py-3 select-all">
                {signupCouponCode}
              </p>
              <p className="text-[#F4F1ED]/40 text-[10px]">
                Excludes cigarettes, tobacco, lotto & lottery. Limit one per transaction. Must be 21+.
              </p>
            </div>
          ) : (
            <form onSubmit={handleEmailSignup} className="space-y-3">
              <p className="text-[#F4F1ED] text-sm font-bold uppercase tracking-wider text-center">
                Get 10% Off Your Next Visit
              </p>
              <p className="text-[#F4F1ED]/50 text-xs text-center normal-case">
                Enter your email for an instant coupon code. We'll occasionally send special promos too.
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  placeholder="you@email.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  disabled={signupStatus === "loading"}
                  className="flex-1 px-3 py-2.5 bg-[#0C0B0A] border border-[#F4F1ED]/10 text-white text-sm normal-case focus:outline-none focus:ring-1 focus:ring-[#C4A484] focus:border-[#C4A484]"
                />
                <button
                  type="submit"
                  disabled={signupStatus === "loading"}
                  className="px-5 py-2.5 bg-[#C4A484] hover:bg-[#b8956f] text-black text-xs font-bold uppercase tracking-wider transition cursor-pointer disabled:opacity-50 shrink-0"
                >
                  {signupStatus === "loading" ? "..." : "Get Code"}
                </button>
              </div>
              {signupStatus === "error" && (
                <p className="text-rose-400 text-xs normal-case">{signupErrorMsg}</p>
              )}
            </form>
          )}
        </div>
      </div>

      {/* Featured This Month — manually curated by the merchant via the
          star toggle in the dashboard. Not based on sales data or any
          algorithm; only shows when at least one item is actually marked
          featured, so it never displays an empty or placeholder section.
          FIX: rebuilt larger (3 per row instead of 4, more padding) per
          request, plus a real icon-based image area using each product's
          actual category icon — we don't have real product photos, so
          this uses an honest generic icon rather than a fake photo. */}
      {products.some((p) => p.featured) && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <span className="text-base font-bold tracking-[0.15em] text-[#C4A484] uppercase">
              ⭐ Featured This Month
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
            {products.filter((p) => p.featured).map((product) => {
              const IconComp = getCategoryIcon(product.iconName);
              return (
                <div
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className="relative bg-[#121110] border-2 border-[#C4A484] hover:border-[#F4F1ED] cursor-pointer transition group overflow-hidden shadow-[0_0_24px_rgba(196,164,132,0.25)]"
                >
                  {/* Bold diagonal SPECIAL ribbon - clipped to the card's
                      overflow-hidden container so it never spills outside
                      the card's own bounds at any screen size. */}
                  <div className="absolute top-0 right-0 z-10 overflow-hidden w-28 h-28 pointer-events-none">
                    <div className="absolute top-[18px] right-[-32px] w-[150px] rotate-45 bg-[#C4A484] text-black text-center py-1 text-[11px] font-bold uppercase tracking-widest shadow-lg">
                      Special
                    </div>
                  </div>
                  <div className="h-40 bg-gradient-to-br from-[#1c1a18] to-[#0C0B0A] flex items-center justify-center border-b border-[#C4A484]/20">
                    <IconComp className="w-16 h-16 text-[#C4A484]/70 group-hover:text-[#C4A484] group-hover:scale-110 transition" strokeWidth={1.5} />
                  </div>
                  <div className="p-5">
                    <p className="font-serif text-lg text-[#F4F1ED] group-hover:text-[#C4A484] transition-colors line-clamp-2 mb-3">
                      {product.name}
                    </p>
                    <div className="flex items-baseline justify-between">
                      {(product.storePrice ?? product.price) ? (
                        <span className="text-2xl font-serif text-[#C4A484]">
                          ${(product.storePrice ?? product.price as number).toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-xs text-[#F4F1ED]/40 uppercase">Price unavailable</span>
                      )}
                      <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 border font-bold ${getStockBadgeColor(product.stockStatus)}`}>
                        {product.stockStatus === "In Stock" ? "In Stock" : "Limited"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and Search Bar - Editorial Box */}
      <div className="bg-[#121110] border border-[#F4F1ED]/10 p-6 md:p-8 space-y-8 shadow-2xl">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#F4F1ED]/45" />
            <input
              type="text"
              placeholder="Search by item name (e.g. 'Modelo', 'Doritos', 'Jack Daniel's')..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-[#0C0B0A] border border-[#F4F1ED]/10 rounded-none text-[#F4F1ED] placeholder-[#F4F1ED]/40 focus:outline-none focus:ring-1 focus:ring-[#C4A484] focus:border-[#C4A484] transition text-sm font-light"
            />
          </div>
          <button
            type="submit"
            className="px-8 py-4 bg-[#F4F1ED] hover:bg-[#F4F1ED]/90 text-black font-bold text-[11px] uppercase tracking-widest transition duration-150 shadow-lg cursor-pointer shrink-0"
          >
            Search Selection
          </button>
        </form>

        {/* Category Scroll */}
        <div className="space-y-3 pt-2 border-t border-[#F4F1ED]/5">
          <div className="flex items-center gap-2 text-[11px] font-bold text-[#C4A484] uppercase tracking-[0.12em]">
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Select Category</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const getCategoryEmoji = (cat: string) => {
                // FIX: previously only matched the old fictional category
                // names (Whiskey, Tequila, Craft Beer...) — none of which
                // exist in your real inventory. Updated to match your
                // actual department/subcategory names.
                switch (cat.toLowerCase()) {
                  case "liquor": return "🥃";
                  case "wine": return "🍷";
                  case "beer": return "🍺";
                  case "rtd": return "🧊";
                  case "soda": return "🥤";
                  case "water": return "💧";
                  case "sports & energy drinks": return "⚡";
                  case "snacks": return "🍪";
                  case "household": return "🧴";
                  case "coffee, tea & juice": return "☕";
                  default: return "🔍";
                }
              };
              return (
                <button
                  key={category}
                  onClick={() => handleCategorySelect(category)}
                  className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest border transition duration-150 cursor-pointer flex items-center gap-1.5 ${
                    selectedCategory === category
                      ? "bg-[#C4A484] text-black border-[#C4A484]"
                      : "bg-[#0C0B0A] text-[#F4F1ED]/60 border-[#F4F1ED]/10 hover:text-[#F4F1ED] hover:border-[#F4F1ED]/30"
                  }`}
                >
                  <span className="text-xs">{category === "All" ? "🏷️" : getCategoryEmoji(category)}</span>
                  <span>{category}</span>
                </button>
              );
            })}
          </div>

          {/* NEW: subcategory filters (e.g. Whiskey & Bourbon, Tequila &
              Mezcal, Gin, Vodka within Liquor) — only shown once a real
              top-level category is selected and it actually has
              subcategories to filter by. */}
          {subcategories.length > 1 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {subcategories.map((sub) => (
                <button
                  key={sub}
                  onClick={() => setSelectedSubcategory(sub)}
                  className={`px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider border transition duration-150 cursor-pointer ${
                    selectedSubcategory === sub
                      ? "bg-[#F4F1ED] text-black border-[#F4F1ED]"
                      : "bg-transparent text-[#F4F1ED]/50 border-[#F4F1ED]/10 hover:text-[#F4F1ED] hover:border-[#F4F1ED]/25"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Product Grid */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-28 space-y-4">
          <div className="w-8 h-8 border-2 border-[#C4A484] border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[#F4F1ED]/50 font-light font-serif italic text-sm tracking-wider">Uncorking our reserve list...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-[#121110] border border-[#F4F1ED]/10 py-16 px-6 text-center max-w-lg mx-auto space-y-6 shadow-2xl">
          <div className="w-12 h-12 bg-[#F4F1ED]/5 text-[#C4A484] rounded-full flex items-center justify-center mx-auto border border-[#F4F1ED]/10">
            <Inbox className="w-6 h-6" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif italic text-[#F4F1ED]">No Items Found</h3>
            <p className="text-[#F4F1ED]/60 text-xs leading-relaxed font-light">
              We couldn't find matches for "{searchTerm}" in {selectedSubcategory !== "All" ? `"${selectedSubcategory}"` : `category "${selectedCategory}"`}. Try a different search term, or browse another category.
            </p>
          </div>
          <button
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("All");
              setSelectedSubcategory("All");
            }}
            className="text-[#C4A484] font-semibold text-xs uppercase tracking-widest hover:underline cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredProducts.map((product) => (
            <motion.div
              layout
              key={product.id}
              onClick={() => setSelectedProduct(product)}
              className="bg-[#121110] border border-[#F4F1ED]/10 hover:border-[#C4A484]/30 transition duration-300 group flex flex-col justify-between overflow-hidden cursor-pointer shadow-xl relative"
            >
              {/* Product Visual Top */}
              <div className="p-6 pb-0">
                <div className={`h-44 bg-gradient-to-br ${product.imageColor} p-4 flex flex-col justify-between relative text-white overflow-hidden`}>
                  {/* Absolute subtle background pattern */}
                  <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
                  
                  <div className="flex justify-between items-start z-10">
                    <span className="text-[10px] font-bold tracking-[0.15em] uppercase bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-none text-[#F4F1ED] border border-white/10">
                      {product.category}
                    </span>
                    {/* FIX: previously always showed product.origin.split(",")[0]
                        — but real inventory items have origin: "" (most
                        snacks/drinks have no meaningful "origin"), so this
                        only renders when there's real data to show. */}
                    {product.origin && (
                      <span className="text-xs font-medium text-amber-200/90 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#C4A484]" /> {product.origin.split(",")[0]}
                      </span>
                    )}
                  </div>
                  
                  {/* Dynamic Silhouette representing item.
                      FIX: previously checked product.category === "Snack" / "Soda"
                      (singular, from the old fictional category list) — your
                      real departments are "Snacks" and "Soda" (plural/exact),
                      so these checks never actually matched real data. */}
                  {product.category === "Snacks" ? (
                    <div className="h-24 w-16 mx-auto bg-white/10 backdrop-blur-sm border border-white/20 rounded-t-md rounded-b-xl shadow-xl flex flex-col items-center justify-center group-hover:scale-105 transition-transform duration-300 relative z-10">
                      <div className="w-full h-1.5 bg-white/20 border-b border-white/10 mb-1"></div>
                      <span className="text-[9px] font-mono font-bold tracking-[0.1em] text-white/70 uppercase">
                        SNACK
                      </span>
                      <span className="text-[8px] font-mono text-white/40 mt-1">
                        {product.size}
                      </span>
                    </div>
                  ) : product.category === "Soda" ? (
                    <div className="h-24 w-11 mx-auto bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl shadow-xl flex flex-col items-center justify-between py-2 group-hover:scale-105 transition-transform duration-300 relative z-10">
                      <div className="w-5 h-1 bg-white/30 rounded-full"></div>
                      <span className="text-[9px] font-mono font-bold tracking-[0.15em] text-white/70 rotate-90 my-auto">
                        SODA
                      </span>
                      <span className="text-[8px] font-mono text-white/40">
                        {product.size}
                      </span>
                    </div>
                  ) : (
                    <div className="h-24 w-12 mx-auto bg-white/10 backdrop-blur-sm border border-white/20 shadow-xl flex items-center justify-center group-hover:scale-105 transition-transform duration-300 relative z-10">
                      <span className="text-[11px] font-bold tracking-[0.12em] text-white/60 rotate-90 whitespace-nowrap">
                        {product.size}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Info */}
              <div className="p-6 flex-1 flex flex-col justify-between space-y-5">
                <div className="space-y-2">
                  <h3 className="text-xl font-serif text-[#F4F1ED] group-hover:text-[#C4A484] transition-colors line-clamp-1">
                    {product.name}
                  </h3>
                  {product.description && (
                    <p className="text-xs text-[#F4F1ED]/60 font-light line-clamp-2 leading-relaxed">
                      {product.description}
                    </p>
                  )}
                </div>

                <div className="space-y-4 pt-2">
                  {/* Tasting notes previews — only render if real notes exist.
                      FIX: real inventory items have tastingNotes: [] (we
                      don't have real tasting-note data for a bag of chips
                      or a 2L Pepsi), so this section is hidden when empty
                      rather than rendering a blank row of pills. */}
                  {product.tastingNotes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {product.tastingNotes.slice(0, 3).map((note, idx) => (
                        <span key={idx} className="text-[10px] uppercase font-semibold tracking-wider px-2 py-1 bg-[#0C0B0A] border border-[#F4F1ED]/10 rounded-none text-[#F4F1ED]/85">
                          {note}
                        </span>
                      ))}
                      {product.tastingNotes.length > 3 && (
                        <span className="text-[10px] px-1.5 py-1 text-[#C4A484] font-medium uppercase tracking-wider">
                          +{product.tastingNotes.length - 3} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* FIX: previously showed the DoorDash price (with the
                      1.333x markup) on the website itself. Switched to show
                      the real in-store register price instead, per request.
                      Falls back to the DoorDash price only if storePrice is
                      somehow missing for an item, so nothing silently shows
                      blank — but storePrice is the real intended value. */}
                  <div className="flex items-baseline justify-between">
                    {(product.storePrice ?? product.price) ? (
                      <span className="text-2xl font-serif text-[#F4F1ED]">
                        ${(product.storePrice ?? product.price as number).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs text-[#F4F1ED]/40 uppercase tracking-wider">
                        Price unavailable
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-[#F4F1ED]/10 pt-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-mono text-[#F4F1ED]/50">
                        {/* FIX: same singular/plural category mismatch as
                            above, plus product.abv is now "" for most real
                            items rather than a real ABV value. */}
                        {product.size}
                        {product.size ? " • " : ""}
                        {product.category === "Snacks" || product.category === "Soda" || product.category === "Water" || !product.abv
                          ? ""
                          : `${product.abv} ABV`}
                      </span>
                      <div className="mt-1.5 flex items-center">
                        <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider bg-amber-950/40 border border-amber-900/40 px-2 py-0.5">
                          🛵 On-Demand Delivery
                        </span>
                      </div>
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2.5 py-1 border font-bold ${getStockBadgeColor(product.stockStatus)}`}>
                      {product.stockStatus}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#F4F1ED]/10 flex items-center justify-between text-xs gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent opening modal
                      handleAddToDoorDash(product);
                    }}
                    className="px-3.5 py-2 bg-[#FF3008] hover:bg-[#E52B07] text-white text-[9.5px] uppercase tracking-wider font-extrabold transition cursor-pointer border border-[#FF3008]/20 flex items-center gap-1 shadow-md"
                  >
                    <span>🛵</span> Order on DoorDash
                  </button>
                  <span className="text-[#F4F1ED]/40 flex items-center group-hover:text-[#F4F1ED] transition-colors uppercase tracking-widest text-[9px] font-bold">
                    View Specs <ChevronRight className="w-3 h-3 ml-0.5 text-[#C4A484]" />
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Product Details & Inquiry Modal */}
      <AnimatePresence>
        {selectedProduct && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="bg-[#121110] border border-[#F4F1ED]/10 w-full max-w-2xl overflow-hidden shadow-2xl my-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cover Banner */}
              <div className={`bg-gradient-to-br ${selectedProduct.imageColor} text-white p-8 relative`}>
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]"></div>
                
                <div className="flex justify-between items-start relative z-10">
                  <span className="text-[11px] uppercase tracking-[0.12em] bg-black/40 px-3 py-1 border border-white/10 font-bold text-white">
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
                    ✕
                  </button>
                </div>

                <div className="mt-8 space-y-2 relative z-10">
                  <h2 className="text-3xl md:text-4xl font-serif tracking-wide">{selectedProduct.name}</h2>
                  <p className="text-amber-100/90 font-mono text-xs uppercase tracking-wider">
                    Origin: {selectedProduct.origin} • {selectedProduct.category === "Snack" ? "Type: Gourmet Snack" : (selectedProduct.category === "Soda" || selectedProduct.abv === "0%" || selectedProduct.abv === "0" || selectedProduct.abv === "0.0%" ? "Type: Non-Alcoholic Soda" : `Strength: ${selectedProduct.abv}`)} • Volume: {selectedProduct.size}
                  </p>
                </div>
              </div>

              {/* Modal Body */}
              <div className="p-6 md:p-8 space-y-6 max-h-[60vh] overflow-y-auto">
                {!isInquiring ? (
                  <>
                    {/* Tasting Specs */}
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-2">The Story</h4>
                        <p className="text-[#F4F1ED]/80 text-sm leading-relaxed font-light">{selectedProduct.description}</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
                        {/* Tasting Notes */}
                        <div className="bg-[#0C0B0A] border border-[#F4F1ED]/10 p-5">
                          <h4 className="text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-3">Tasting Profile</h4>
                          <div className="flex flex-wrap gap-1.5">
                            {selectedProduct.tastingNotes.map((note, idx) => (
                              <span key={idx} className="text-xs px-2.5 py-1 bg-[#121110] border border-[#F4F1ED]/10 text-[#F4F1ED]">
                                {note}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Pairing Card */}
                        <div className="bg-[#0C0B0A] border border-[#F4F1ED]/10 p-5">
                          <h4 className="text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-3">Epicurean Pairing</h4>
                          <p className="text-[#F4F1ED]/80 text-xs leading-relaxed italic">
                            "{selectedProduct.foodPairing}"
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* DoorDash Integration Banner */}
                    <div className="bg-[#0C0B0A] border border-amber-950/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h4 className="text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-1.5">DoorDash Delivery Option</h4>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-[#F4F1ED]">
                            Available for Courier Delivery
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-400 font-bold uppercase tracking-wider bg-[#FF3008]/10 border border-[#FF3008]/20 px-3 py-1">
                        Bakersfield Courier Active
                      </span>
                    </div>

                    {/* Stock Status Notification Banner */}
                    <div className="flex items-start gap-3 bg-[#0C0B0A] border border-[#F4F1ED]/10 p-4">
                      <Info className="w-5 h-5 text-[#C4A484] shrink-0 mt-0.5" />
                      <div className="text-xs text-[#F4F1ED]/80 space-y-1">
                        <span className="font-bold text-[#F4F1ED] block uppercase tracking-wider">Availability Status: {selectedProduct.stockStatus}</span>
                        <p className="font-light leading-relaxed">
                          This curated selection is carried at Calloway Market on Calloway Drive. For immediate checkout and courier delivery to your doorstep, please order directly through our official DoorDash shop.
                        </p>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="pt-6 border-t border-[#F4F1ED]/10 flex flex-col md:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          handleAddToDoorDash(selectedProduct);
                        }}
                        className="flex-1 px-6 py-4 bg-[#FF3008] text-white hover:bg-[#E52B07] border border-[#FF3008]/30 font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer rounded-none"
                      >
                        🛵 Order on DoorDash & Deliver
                      </button>
                      <button
                        onClick={() => setIsInquiring(true)}
                        className="flex-1 px-6 py-4 bg-[#F4F1ED] hover:bg-[#F4F1ED]/90 text-black font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <FileText className="w-4 h-4" /> Submit Bespoke Inquiry & Reserve
                      </button>
                      <button
                        onClick={() => {
                          setSelectedProduct(null);
                        }}
                        className="px-6 py-4 border border-[#F4F1ED]/20 text-[#F4F1ED]/80 hover:text-[#F4F1ED] hover:bg-white/5 font-bold text-[11px] uppercase tracking-widest transition cursor-pointer"
                      >
                        Keep Browsing
                      </button>
                    </div>
                  </>
                ) : (
                  /* Inquiry Flow */
                  <form onSubmit={handleInquirySubmit} className="space-y-6">
                    {inquirySubmitted ? (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-center py-8 space-y-5"
                      >
                        <div className="w-16 h-16 bg-[#C4A484]/10 text-[#C4A484] border border-[#C4A484]/20 rounded-full flex items-center justify-center mx-auto shadow-inner">
                          <CheckCircle2 className="w-10 h-10" />
                        </div>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-serif italic text-[#F4F1ED]">Inquiry Logged</h3>
                          <p className="text-[#F4F1ED]/70 text-sm max-w-md mx-auto font-light leading-relaxed">
                            Your inquiry for <span className="font-medium text-[#F4F1ED]">{selectedProduct.name}</span> has been recorded.
                          </p>
                        </div>
                        <p className="text-[10px] uppercase tracking-widest text-[#C4A484] bg-[#0C0B0A] border border-[#F4F1ED]/10 px-4 py-3 max-w-sm mx-auto font-light">
                          {/* FIX: this used to promise "A sommelier will contact you
                              directly" and show a randomly-generated fake "client
                              file number" — but submitting this form never actually
                              notifies anyone or stores contact info for follow-up.
                              For real product, build a real notification (e.g. email
                              the merchant, or save to a real database) before
                              promising a callback. For now: order on DoorDash for
                              real-time stock and pricing. */}
                          For immediate ordering, please use the DoorDash link below — inquiries here are not yet monitored for callbacks.
                        </p>
                      </motion.div>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <h3 className="font-serif italic text-xl text-[#F4F1ED]">Product Inquiry Form</h3>
                          <p className="text-[#F4F1ED]/60 text-xs font-light leading-relaxed">
                            Submit your contact details and we'll follow up about this item.
                          </p>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-2">
                              Your Full Name
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. Jordan Smith"
                              value={inquiryName}
                              onChange={(e) => setInquiryName(e.target.value)}
                              className="w-full px-4 py-3 bg-[#0C0B0A] border border-[#F4F1ED]/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C4A484] focus:border-[#C4A484]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-2">
                              Contact Number or Email
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. +1 (555) 234-5678 or name@domain.com"
                              value={inquiryContact}
                              onChange={(e) => setInquiryContact(e.target.value)}
                              className="w-full px-4 py-3 bg-[#0C0B0A] border border-[#F4F1ED]/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C4A484] focus:border-[#C4A484]"
                            />
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold uppercase text-[#C4A484] tracking-[0.12em] mb-2">
                              Special Notes / Quantity (Optional)
                            </label>
                            <textarea
                              rows={2}
                              placeholder="e.g. Looking for a full case, or have a question about this item."
                              className="w-full px-4 py-3 bg-[#0C0B0A] border border-[#F4F1ED]/10 text-white text-sm focus:outline-none focus:ring-1 focus:ring-[#C4A484] focus:border-[#C4A484] resize-none font-light"
                            />
                          </div>
                        </div>

                        <div className="pt-6 border-t border-[#F4F1ED]/10 flex gap-3">
                          <button
                            type="submit"
                            className="flex-1 px-6 py-4 bg-[#F4F1ED] hover:bg-[#F4F1ED]/90 text-black font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" /> Submit Inquiry
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsInquiring(false)}
                            className="px-6 py-4 border border-[#F4F1ED]/20 text-[#F4F1ED]/80 hover:text-[#F4F1ED] hover:bg-white/5 font-bold text-[11px] uppercase tracking-widest transition cursor-pointer"
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

      {/* Floating DoorDash Storefront Button */}
      <div className="fixed bottom-6 right-6 z-40">
        <a
          href={DOORDASH_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="relative bg-[#FF3008] hover:bg-[#E52B07] text-white p-4 rounded-full shadow-2xl hover:scale-105 transition active:scale-95 group cursor-pointer flex items-center justify-center border border-white/10"
          title="Visit Calloway Market on DoorDash"
        >
          <ShoppingBag className="w-6 h-6 text-white" />
          <span className="absolute right-14 bg-[#121110] border border-[#F4F1ED]/10 text-[#C4A484] text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-sm shadow-xl hidden md:block whitespace-nowrap">
            Open DoorDash Shop
          </span>
        </a>
      </div>

      {/* DoorDash Redirect Overlay Modal */}
      <AnimatePresence>
        {isRedirectModalOpen && redirectingProduct && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-55" style={{ zIndex: 9999 }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121110] border border-[#F4F1ED]/10 p-8 max-w-md w-full text-center space-y-6 shadow-2xl relative"
            >
              <div className="w-16 h-16 bg-[#FF3008]/10 text-[#FF3008] border border-[#FF3008]/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                <ShoppingBag className="w-8 h-8" />
              </div>
              
              <div className="space-y-2">
                <span className="text-[11px] uppercase font-bold tracking-[0.12em] text-[#C4A484] block">
                  Delivery Coordination
                </span>
                <h3 className="text-2xl font-serif italic text-[#F4F1ED]">
                  Redirecting to DoorDash
                </h3>
                <p className="text-[#F4F1ED]/70 text-xs font-light leading-relaxed">
                  We are taking you to the official DoorDash shop for <span className="font-semibold text-white">{redirectingProduct.name}</span> to complete your purchase and schedule delivery.
                </p>
              </div>

              <div className="p-4 bg-[#0C0B0A] border border-[#F4F1ED]/5 text-left rounded-none space-y-1">
                <span className="text-[9px] uppercase tracking-wider text-gray-500 block font-mono">Selected Bottle</span>
                <span className="text-xs font-serif text-[#F4F1ED] font-medium block italic">{redirectingProduct.name}</span>
                <span className="text-[10px] font-mono text-gray-400 block">{redirectingProduct.category} • {redirectingProduct.size}</span>
              </div>

              <div className="space-y-3 pt-2">
                <a
                  href={DOORDASH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-[#FF3008] hover:bg-[#E52B07] text-white font-bold text-xs uppercase tracking-widest transition flex items-center justify-center gap-2 shadow-lg"
                >
                  Click Here if Not Redirected
                </a>
                
                <button
                  type="button"
                  onClick={() => setIsRedirectModalOpen(false)}
                  className="w-full py-3 border border-[#F4F1ED]/10 hover:bg-white/5 text-[#F4F1ED]/60 hover:text-[#F4F1ED] font-bold text-[10px] uppercase tracking-widest transition"
                >
                  Return to Catalog
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
