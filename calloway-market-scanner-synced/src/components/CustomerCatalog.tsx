import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Search, MapPin, Inbox, CheckCircle2, ChevronRight, ChevronLeft, ChevronUp, ChevronDown, FileText, Info, ShoppingBag, ShoppingCart, Menu, Home, Store, X, Wine, Martini, Beer, Zap, Cookie, CupSoda, Package, Droplet, Coffee } from "lucide-react";
import { Product } from "../types";
import { motion, AnimatePresence } from "motion/react";
import callowayLogo from "../assets/calloway-logo.png";

interface CustomerCatalogProps {
  products: Product[];
  isLoading: boolean;
  onSearchLog: (query: string, category: string) => void;
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
  textPosition: "top-left" | "top-center" | "top-right" | "center-left" | "center" | "center-right" | "bottom-left" | "bottom-center" | "bottom-right";
  headlineSize: "sm" | "md" | "lg";
  subtextSize: "sm" | "md" | "lg";
  headlineBold: boolean;
  headlineItalic: boolean;
  subtextBold: boolean;
  subtextItalic: boolean;
}

const TEXT_POSITION_CLASSES: Record<string, string> = {
  "top-left": "justify-start items-start text-left",
  "top-center": "justify-start items-center text-center",
  "top-right": "justify-start items-end text-right",
  "center-left": "justify-center items-start text-left",
  "center": "justify-center items-center text-center",
  "center-right": "justify-center items-end text-right",
  "bottom-left": "justify-end items-start text-left",
  "bottom-center": "justify-end items-center text-center",
  "bottom-right": "justify-end items-end text-right",
};

const BUTTON_SELF_ALIGN: Record<string, string> = {
  "top-left": "self-start",
  "top-center": "self-center",
  "top-right": "self-end",
  "center-left": "self-start",
  "center": "self-center",
  "center-right": "self-end",
  "bottom-left": "self-start",
  "bottom-center": "self-center",
  "bottom-right": "self-end",
};

const HEADLINE_SIZE_CLASSES: Record<string, string> = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-4xl",
};

const SUBTEXT_SIZE_CLASSES: Record<string, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-lg",
};

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

  // Real shopping cart — lets a customer add several products before
  // heading to checkout, instead of the old flow which immediately opened
  // the DoorDash/Grubhub picker for a single item. Persisted to
  // localStorage so it survives a page refresh (this is the live site
  // running in a real browser, not a sandboxed preview, so localStorage is
  // fine here).
  const [cart, setCart] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("callowayCart");
      if (saved) setCart(JSON.parse(saved));
    } catch {
      // ignore corrupt/unavailable storage
    }
  }, []);
  useEffect(() => {
    try {
      window.localStorage.setItem("callowayCart", JSON.stringify(cart));
    } catch {
      // ignore storage write failures (e.g. private browsing)
    }
  }, [cart]);

  const [cartToast, setCartToast] = useState<string | null>(null);
  const addToCart = (product: Product, qty: number = 1) => {
    setCart((prev) => ({ ...prev, [product.id]: (prev[product.id] || 0) + qty }));
    setCartToast(`Added "${product.name}" to your cart`);
    window.clearTimeout((addToCart as any)._t);
    (addToCart as any)._t = window.setTimeout(() => setCartToast(null), 2200);
  };
  const updateCartQty = (productId: string, qty: number) => {
    setCart((prev) => {
      if (qty <= 0) {
        const next = { ...prev };
        delete next[productId];
        return next;
      }
      return { ...prev, [productId]: qty };
    });
  };
  const removeFromCart = (productId: string) => {
    setCart((prev) => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };
  const clearCart = () => setCart({});

  const cartItemCount = Object.values(cart).reduce((sum, q) => sum + q, 0);
  const cartLineItems = Object.entries(cart)
    .map(([productId, qty]) => {
      const product = products.find((p) => p.id === productId);
      return product ? { product, qty } : null;
    })
    .filter((x): x is { product: Product; qty: number } => x !== null);
  const cartSubtotal = cartLineItems.reduce((sum, { product, qty }) => {
    const price = (product as any).storePrice ?? product.price ?? 0;
    return sum + price * qty;
  }, 0);

  const [isCartOpen, setIsCartOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Builds a clean, readable URL for a product: /product/{id}/{slug} — the
  // id is what's actually used to look the product up (reliable even if
  // the name changes later); the slug is just for readability/SEO and is
  // ignored on load.
  const slugify = (str: string) =>
    String(str || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const buildProductUrl = (product: Product) =>
    `${window.location.origin}/product/${product.id}/${slugify(product.name)}`;

  // Per-product deep link — opens straight to a product's detail view when
  // the site is loaded at /product/{id}/{slug}, e.g. for sharing a single
  // item via text or social media. Also supports the older ?product=<id>
  // query-string form so any links shared before this existed keep working.
  useEffect(() => {
    if (products.length === 0) return;
    const pathMatch = window.location.pathname.match(/^\/product\/([^/]+)/);
    const productId = pathMatch ? pathMatch[1] : new URLSearchParams(window.location.search).get("product");
    if (productId) {
      const match = products.find((p) => p.id === productId);
      if (match) setSelectedProduct(match);
    }
  }, [products]);

  // Keeps the address bar in sync with whichever product is open, without
  // a full page reload — so copying straight from the URL bar gives the
  // same clean link as the Share button, and the browser back button
  // closes the product view.
  useEffect(() => {
    if (selectedProduct) {
      const cleanUrl = `/product/${selectedProduct.id}/${slugify(selectedProduct.name)}`;
      if (window.location.pathname !== cleanUrl) {
        window.history.pushState({ productId: selectedProduct.id }, "", cleanUrl);
      }
    } else if (window.location.pathname.startsWith("/product/")) {
      window.history.pushState({}, "", "/");
    }
  }, [selectedProduct]);

  useEffect(() => {
    const handlePopState = () => {
      const pathMatch = window.location.pathname.match(/^\/product\/([^/]+)/);
      if (pathMatch) {
        const match = products.find((p) => p.id === pathMatch[1]);
        setSelectedProduct(match || null);
      } else {
        setSelectedProduct(null);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products]);

  const [shareCopied, setShareCopied] = useState(false);
  const handleShareProduct = (product: Product) => {
    const url = buildProductUrl(product);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      }).catch(() => {});
    }
  };

  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 500);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Promo banners — a list of merchant-editable banners (photo or video),
  // fetched from the settings endpoint. Empty array shows nothing.
  const [promos, setPromos] = useState<PromoBanner[]>([]);
  useEffect(() => {
    fetch("/api/settings/promos")
      .then((r) => r.json())
      .then((data) => setPromos(data.promos || []))
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

  // Cart checkout — separate from the single-item quick-order sheet above.
  // Walks through: pick a delivery service -> see the price disclaimer ->
  // get a copyable order list, since DoorDash/Grubhub don't offer any way
  // for an outside site to push cart contents into their own cart.
  const [showCartCheckout, setShowCartCheckout] = useState(false);
  const [cartCheckoutStep, setCartCheckoutStep] = useState<"choose" | "list">("choose");
  const [cartCheckoutService, setCartCheckoutService] = useState<"doordash" | "grubhub" | null>(null);
  const [orderListCopied, setOrderListCopied] = useState(false);

  const openCartCheckout = () => {
    setIsCartOpen(false);
    setCartCheckoutStep("choose");
    setCartCheckoutService(null);
    setShowCartCheckout(true);
  };
  const closeCartCheckout = () => {
    setShowCartCheckout(false);
    setCartCheckoutStep("choose");
    setCartCheckoutService(null);
  };
  const chooseCartCheckoutService = (service: "doordash" | "grubhub") => {
    setCartCheckoutService(service);
    setCartCheckoutStep("list");
    onSearchLog(`${service === "doordash" ? "DoorDash" : "Grubhub"} Redirect: Cart Checkout (${cartItemCount} items)`, "Order");
  };
  const buildOrderListText = () => {
    const lines = cartLineItems.map(({ product, qty }) => `${qty} x ${product.name}`);
    return lines.join("\n");
  };
  const handleCopyOrderList = () => {
    const text = buildOrderListText();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setOrderListCopied(true);
        setTimeout(() => setOrderListCopied(false), 2000);
      }).catch(() => {});
    }
  };
  const handleGoToDeliveryService = () => {
    if (!cartCheckoutService) return;
    triggerSearchFetch();
    window.open(cartCheckoutService === "doordash" ? getDoorDashUrl() : getGrubhubUrl(), "_blank");
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

  const categories = Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );

  const [filterCategory, setFilterCategory] = useState("All");

  const term = searchTerm.toLowerCase();
  const searchActive = term.trim().length >= 2;
  const filtersActive = searchActive || filterCategory !== "All";

  const searchResults = products.filter((product) => {
    const matchesSearch = !searchActive || (
      product.name.toLowerCase().includes(term) ||
      (product.description && product.description.toLowerCase().includes(term)) ||
      (product.subcategory && product.subcategory.toLowerCase().includes(term)) ||
      (product.origin && product.origin.toLowerCase().includes(term)) ||
      product.tastingNotes.some((note) => note.toLowerCase().includes(term))
    );
    const matchesCategory = filterCategory === "All" || product.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const handleFilterCategoryChange = (value: string) => {
    // FIX: clicking a category filter button is browsing/navigation, not
    // a genuine typed search — logging it into the same search-analytics
    // stream as real search terms was cluttering "Live Search Stream" and
    // "Trending Local Terms" with noise (and made bot/scraper traffic
    // that clicks through every category look like real customer search
    // activity). Only actual typed searches get logged now.
    setFilterCategory(value);
  };

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

  // Tracks which category sections are expanded to show every product in
  // that category, vs. collapsed (showing just a short horizontal preview).
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const toggleCategoryExpanded = (category: string) => {
    setExpandedCategories((prev) => ({ ...prev, [category]: !prev[category] }));
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
              addToCart(product);
            }}
            className="w-full py-2.5 bg-[#E4002B] hover:bg-[#c40025] text-white text-sm font-bold rounded-full transition cursor-pointer"
          >
            Add to cart
          </button>
        </div>
      </div>
    );
  };

  // Computes a vertical stacking position for each sidebar banner, so
  // multiple banners on the same side (left or right) stack one below the
  // other instead of overlapping at the exact same spot. Order follows the
  // promos array order (which the merchant controls via the up/down
  // reorder buttons in the dashboard).
  const sidebarOffsets = React.useMemo(() => {
    const offsets: Record<string, number> = {};
    let leftCumulative = 96;
    let rightCumulative = 96;
    promos.forEach((p) => {
      if (p.position === "sidebar-left") {
        offsets[p.id] = leftCumulative;
        leftCumulative += (p.height || 220) + 16;
      } else if (p.position === "sidebar-right") {
        offsets[p.id] = rightCumulative;
        rightCumulative += (p.height || 220) + 16;
      }
    });
    return offsets;
  }, [promos]);

  const PromoCard = ({ promo, topOffset }: { promo: PromoBanner; topOffset?: number }) => {
    const isSidebar = promo.position === "sidebar-left" || promo.position === "sidebar-right";

    const content = (
      <div
        className={
          isSidebar
            ? `hidden lg:block fixed ${promo.position === "sidebar-left" ? "left-4" : "right-4"} z-[999] rounded-2xl overflow-hidden bg-gray-100 shadow-xl`
            : `rounded-2xl overflow-hidden relative bg-gray-100 ${promo.position === "full" || promo.position === "inline" ? "w-full" : "w-full sm:w-[calc(50%-6px)]"}`
        }
        style={
          isSidebar
            ? { height: `${promo.height || 220}px`, width: `${promo.width || 160}px`, top: `${topOffset ?? 96}px` }
            : { height: `${promo.height || 220}px` }
        }
      >
        {promo.mediaUrl && promo.mediaType === "video" ? (
          <video
            src={promo.mediaUrl}
            autoPlay
            muted
            loop
            playsInline
            className={`absolute inset-0 w-full h-full ${promo.imageFit === "contain" ? "object-contain bg-gray-900" : "object-cover"}`}
            onError={(e) => { (e.target as HTMLVideoElement).style.display = "none"; }}
          />
        ) : promo.mediaUrl ? (
          <img
            src={promo.mediaUrl}
            alt={promo.headline || "Promotion"}
            className={`absolute inset-0 w-full h-full ${promo.imageFit === "contain" ? "object-contain bg-gray-900" : "object-cover"}`}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : null}
        {(promo.headline || promo.subtext || promo.buttonLabel) && (
          <div className={`absolute inset-0 bg-black/25 flex flex-col px-6 py-4 ${TEXT_POSITION_CLASSES[promo.textPosition] || TEXT_POSITION_CLASSES["center-left"]}`}>
            {promo.headline && (
              <h2
                className={`text-white leading-tight max-w-xs drop-shadow-lg ${HEADLINE_SIZE_CLASSES[promo.headlineSize] || HEADLINE_SIZE_CLASSES.md} ${promo.headlineBold ? "font-extrabold" : "font-medium"} ${promo.headlineItalic ? "italic" : ""}`}
              >
                {promo.headline}
              </h2>
            )}
            {promo.subtext && (
              <p
                className={`text-white/90 mt-1 max-w-xs drop-shadow ${SUBTEXT_SIZE_CLASSES[promo.subtextSize] || SUBTEXT_SIZE_CLASSES.md} ${promo.subtextBold ? "font-bold" : "font-normal"} ${promo.subtextItalic ? "italic" : ""}`}
              >
                {promo.subtext}
              </p>
            )}
            {promo.buttonLabel && (
              <button
                onClick={() =>
                  promo.buttonUrl
                    ? window.open(promo.buttonUrl, "_blank")
                    : setShowGenericOrderSheet(true)
                }
                className={`mt-3 px-5 py-2 bg-white text-black text-xs font-bold rounded-full hover:bg-gray-100 transition cursor-pointer ${BUTTON_SELF_ALIGN[promo.textPosition] || "self-start"}`}
              >
                {promo.buttonLabel}
              </button>
            )}
          </div>
        )}
      </div>
    );

    // Sidebar banners are rendered via a portal straight into document.body.
    // This is deliberate: "position: fixed" only measures against the real
    // browser viewport if none of its ancestor elements have a CSS
    // transform/animation applied — and this app's page-transition
    // animations apply exactly that kind of transform higher up the tree.
    // Without the portal, "fixed" sidebar banners get trapped inside that
    // animated wrapper instead of reaching the true edge of the screen.
    if (isSidebar) {
      return createPortal(content, document.body);
    }
    return content;
  };

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8 -my-10 bg-white pb-24" id="customer-view">
      <div className="bg-white text-gray-900 px-4 py-3 flex items-center justify-between border-b border-gray-100">
        <button className="p-1.5 text-gray-700" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </button>
        <img src={callowayLogo} alt="Calloway Market" className="h-9 w-auto" />
        <div className="flex items-center gap-1 text-xs font-semibold">
          <ShoppingBag className="w-4 h-4 text-[#E4002B]" />
          <div className="text-right leading-tight">
            <div className="text-gray-400 text-[10px] font-normal">Delivery</div>
            <div className="underline text-gray-700">Bakersfield</div>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 bg-white border-b border-gray-100">
        <form onSubmit={handleSearchSubmit} className="relative mb-3">
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
        {/* Mobile-only filter row — on larger screens the sidebar below takes over */}
        <div className="flex gap-2 lg:hidden">
          <select
            value={filterCategory}
            onChange={(e) => handleFilterCategoryChange(e.target.value)}
            className="flex-1 px-3 py-2 bg-gray-100 rounded-full text-xs font-semibold text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#E4002B]/30 cursor-pointer"
          >
            <option value="All">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          {filterCategory !== "All" && (
            <button
              type="button"
              onClick={() => setFilterCategory("All")}
              className="px-4 py-2 bg-gray-900 text-white rounded-full text-xs font-semibold hover:bg-gray-800 transition cursor-pointer shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="lg:flex lg:gap-6 lg:px-4 lg:items-start">
        {/* Left filter sidebar — desktop/tablet only, stays fixed in place while scrolling */}
        <aside className="hidden lg:block lg:w-56 shrink-0">
          <div className="sticky top-24 space-y-6 bg-white border border-gray-200 rounded-2xl p-4 max-h-[calc(100vh-7rem)] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Filters</h3>
              {filterCategory !== "All" && (
                <button
                  type="button"
                  onClick={() => setFilterCategory("All")}
                  className="text-[10px] font-bold uppercase text-[#E4002B] hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2">Category</h4>
              <div className="space-y-1">
                <button
                  onClick={() => handleFilterCategoryChange("All")}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${filterCategory === "All" ? "bg-[#E4002B] text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  All Categories
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => handleFilterCategoryChange(cat)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${filterCategory === cat ? "bg-[#E4002B] text-white" : "text-gray-600 hover:bg-gray-50"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {promos.filter((p) => p.position !== "inline").length > 0 && (
            <div className="px-4 pt-4 flex flex-wrap gap-3">
              {promos.filter((p) => p.position !== "inline").map((promo) => (
                <PromoCard key={promo.id} promo={promo} topOffset={sidebarOffsets[promo.id]} />
              ))}
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

          {filtersActive && (
            <div className="px-4 pt-6 space-y-4">
              <h2 className="text-lg font-extrabold text-gray-900">
                {searchActive ? `Results for "${searchTerm}"` : filterCategory}
              </h2>
              {searchResults.length === 0 ? (
                <div className="bg-gray-50 rounded-2xl p-8 text-center space-y-3">
                  <Inbox className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-500">No items found. Try a different search term or filter.</p>
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

          {!filtersActive && !isLoading && (
            <div className="pt-6 space-y-8">
              {categories.map((category, categoryIndex) => {
                const allItems = products.filter((p) => p.category === category);
                if (allItems.length === 0) return null;
                const isExpanded = !!expandedCategories[category];
                const previewItems = allItems.slice(0, 16);
                const inlinePromosHere = promos.filter(
                  (p) => p.position === "inline" && p.afterCategoryPosition === categoryIndex + 1
                );
                return (
                  <React.Fragment key={category}>
                    <div>
                      <button
                        onClick={() => toggleCategoryExpanded(category)}
                        className="w-full px-4 flex items-center justify-between mb-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <h2 className="text-lg font-extrabold text-gray-900">{category}</h2>
                          <span className="text-xs text-gray-400 font-semibold">({allItems.length})</span>
                        </div>
                        <div className="flex items-center gap-1">
                          {!isExpanded && (
                            <>
                              <span
                                role="button"
                                onClick={(e) => { e.stopPropagation(); scrollRow(category, -1); }}
                                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition cursor-pointer"
                                aria-label={`Scroll ${category} left`}
                              >
                                <ChevronLeft className="w-4 h-4 text-gray-700" />
                              </span>
                              <span
                                role="button"
                                onClick={(e) => { e.stopPropagation(); scrollRow(category, 1); }}
                                className="w-7 h-7 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition cursor-pointer"
                                aria-label={`Scroll ${category} right`}
                              >
                                <ChevronRight className="w-4 h-4 text-gray-700" />
                              </span>
                            </>
                          )}
                          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ml-1 ${isExpanded ? "rotate-180" : ""}`} />
                        </div>
                      </button>
                      {isExpanded ? (
                        <div className="px-4 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                          {allItems.map((product) => (
                            <ProductCard key={product.id} product={product} />
                          ))}
                        </div>
                      ) : (
                        <div
                          ref={(el) => { if (el) rowRefs.current.set(category, el); }}
                          className="flex gap-3 overflow-x-auto snap-x snap-mandatory px-4 pb-2 scrollbar-hide"
                          style={{ scrollbarWidth: "none" }}
                        >
                          {previewItems.map((product) => (
                            <ProductCard key={product.id} product={product} />
                          ))}
                        </div>
                      )}
                    </div>
                    {inlinePromosHere.length > 0 && (
                      <div className="px-4 flex flex-wrap gap-3">
                        {inlinePromosHere.map((promo) => (
                          <PromoCard key={promo.id} promo={promo} topOffset={sidebarOffsets[promo.id]} />
                        ))}
                      </div>
                    )}
                  </React.Fragment>
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
        </div>
      </div>

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
          onClick={() => setIsCartOpen(true)}
          className="flex flex-col items-center gap-1 text-gray-500 hover:text-[#E4002B] transition cursor-pointer relative"
        >
          <span className="relative">
            <ShoppingCart className="w-5 h-5" />
            {cartItemCount > 0 && (
              <span className="absolute -top-1.5 -right-2 bg-[#E4002B] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {cartItemCount > 9 ? "9+" : cartItemCount}
              </span>
            )}
          </span>
          <span className="text-[10px] font-semibold">Cart</span>
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

      {/* Cart Drawer — review items, adjust quantities, head to checkout */}
      <AnimatePresence>
        {isCartOpen && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
            onClick={() => setIsCartOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl p-6 space-y-4 max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between shrink-0">
                <h3 className="text-lg font-extrabold text-gray-900">Your Cart {cartItemCount > 0 && `(${cartItemCount})`}</h3>
                <button onClick={() => setIsCartOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cartLineItems.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <ShoppingCart className="w-8 h-8 text-gray-300 mx-auto" />
                  <p className="text-sm text-gray-500">Your cart is empty. Add some items to get started.</p>
                </div>
              ) : (
                <>
                  <div className="overflow-y-auto space-y-3 flex-1">
                    {cartLineItems.map(({ product, qty }) => {
                      const price = (product as any).storePrice ?? product.price ?? 0;
                      return (
                        <div key={product.id} className="flex items-center gap-3 border border-gray-100 rounded-xl p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate">{product.name}</p>
                            <p className="text-xs text-gray-500">${price.toFixed(2)} each</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => updateCartQty(product.id, qty - 1)}
                              className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm font-semibold">{qty}</span>
                            <button
                              onClick={() => updateCartQty(product.id, qty + 1)}
                              className="w-7 h-7 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition cursor-pointer"
                            >
                              +
                            </button>
                          </div>
                          <button
                            onClick={() => removeFromCart(product.id)}
                            className="p-1.5 text-gray-300 hover:text-rose-600 transition cursor-pointer shrink-0"
                            title="Remove"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-gray-100 pt-4 space-y-3 shrink-0">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">Estimated subtotal</span>
                      <span className="font-bold text-gray-900">${cartSubtotal.toFixed(2)}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-snug">
                      This is Calloway Market's own in-store price. Prices on DoorDash or Grubhub — including delivery fees, service fees, and markups — may be different.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={clearCart}
                        className="px-4 py-2.5 border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-bold uppercase tracking-wider rounded-full transition cursor-pointer"
                      >
                        Clear
                      </button>
                      <button
                        onClick={openCartCheckout}
                        className="flex-1 py-2.5 bg-[#E4002B] hover:bg-[#c40025] text-white text-sm font-bold rounded-full transition cursor-pointer"
                      >
                        Choose Delivery
                      </button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart Checkout — pick a delivery service, see the price disclaimer,
          then get a copyable order list (DoorDash/Grubhub don't support
          pushing cart contents in from an outside site). */}
      <AnimatePresence>
        {showCartCheckout && (
          <div
            className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50"
            onClick={closeCartCheckout}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-extrabold text-gray-900">
                  {cartCheckoutStep === "choose" ? "Choose delivery service" : "Your order list"}
                </h3>
                <button onClick={closeCartCheckout} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {cartCheckoutStep === "choose" ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 leading-snug">
                    ⚠️ Prices may differ on the delivery company's website — DoorDash and Grubhub set their own item prices, delivery fees, and service fees, which can be higher than shown here.
                  </div>
                  <button
                    onClick={() => chooseCartCheckoutService("doordash")}
                    className="w-full py-3.5 bg-[#FF3008] hover:bg-[#E52B07] text-white font-bold text-sm rounded-full transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    🛵 Continue to DoorDash
                  </button>
                  <button
                    onClick={() => chooseCartCheckoutService("grubhub")}
                    className="w-full py-3.5 bg-[#F63440] hover:bg-[#d92b36] text-white font-bold text-sm rounded-full transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    🍔 Continue to Grubhub
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500">
                    {cartCheckoutService === "doordash" ? "DoorDash" : "Grubhub"} doesn't let outside sites add items
                    to your cart automatically — here's your list to quickly re-add once you're there.
                  </p>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-48 overflow-y-auto">
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{buildOrderListText()}</pre>
                  </div>
                  <button
                    onClick={handleCopyOrderList}
                    className="w-full py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold uppercase tracking-wider rounded-full transition cursor-pointer"
                  >
                    {orderListCopied ? "Copied!" : "Copy List"}
                  </button>
                  <button
                    onClick={handleGoToDeliveryService}
                    className={`w-full py-3.5 text-white font-bold text-sm rounded-full transition cursor-pointer flex items-center justify-center gap-2 ${
                      cartCheckoutService === "doordash" ? "bg-[#FF3008] hover:bg-[#E52B07]" : "bg-[#F63440] hover:bg-[#d92b36]"
                    }`}
                  >
                    {cartCheckoutService === "doordash" ? "🛵 Open DoorDash" : "🍔 Open Grubhub"}
                  </button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cart toast — brief confirmation when an item is added */}
      <AnimatePresence>
        {cartToast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-20 sm:bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg z-50"
          >
            {cartToast}
          </motion.div>
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
                        onClick={() => addToCart(selectedProduct)}
                        className="flex-1 px-6 py-4 bg-[#E4002B] text-white hover:bg-[#c40025] font-bold text-[11px] uppercase tracking-widest transition shadow-lg flex items-center justify-center gap-2 cursor-pointer rounded-full"
                      >
                        <ShoppingCart className="w-4 h-4" /> Add to Cart
                      </button>
                      <button
                        type="button"
                        onClick={() => handleShareProduct(selectedProduct)}
                        className="px-6 py-4 border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-50 font-bold text-[11px] uppercase tracking-widest transition cursor-pointer rounded-full flex items-center justify-center gap-2"
                      >
                        {shareCopied ? "Link Copied!" : "Share"}
                      </button>
                    </div>
                    <div className="flex flex-col md:flex-row gap-3">
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
