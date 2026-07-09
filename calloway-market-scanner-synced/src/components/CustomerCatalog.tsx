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
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("All");

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
  
  const [redirectingProduct, setRedirectingProduct] = useState<Product | null>(null);
  const [isRedirectModalOpen, setIsRedirectModalOpen] = useState(false);

  const [isInquiring, setIsInquiring] = useState(false);
  const [inquiryName, setInquiryName] = useState("");
  const [inquiryContact, setInquiryContact] = useState("");
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  const [cart, setCart] = useState<Product[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartName, setCartName] = useState("");
  const [cartContact, setCartContact] = useState("");
  const [cartSubmitted, setCartSubmitted] = useState(false);

  const handleAddToDoorDash = (product: Product) => {
    onSearchLog(`DoorDash Redirect: ${product.name}`, product.category);
    triggerSearchFetch();
    setRedirectingProduct(product);
    setIsRedirectModalOpen(true);
    window.open(getDoorDashUrl(product), "_blank");
  };

  const handleAddToGrubhub = (product: Product) => {
    onSearchLog(`Grubhub Redirect: ${product.name}`, product.category);
    triggerSearchFetch();
    window.open(getGrubhubUrl(product), "_blank");
  };

  const handleAddToCart = (product: Product) => {
    handleAddToDoorDash(product);
  };

  const handleRemoveFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.id !== productId));
  };

  const handleCartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cartName.trim() || !cartContact.trim() || cart.length === 0) return;
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

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const subcategories = selectedCategory === "All"
    ? []
    : ["All", ...Array.from(new Set(
        products
          .filter((p) => p.category === selectedCategory && p.subcategory)
          .map((p) => p.subcategory as string)
      ))];

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

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (searchTerm.trim().length >= 2) {
      onSearchLog(searchTerm.trim(), selectedCategory);
      triggerSearchFetch();
    }
  };

  const handleCategorySelect = (category: string) => {
    setSelectedCategory(category);
    setSelectedSubcategory("All");
    if (category !== "All") {
      onSearchLog(`Browse Category: ${category}`, category);
      triggerSearchFetch();
    }
  };

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
      <div className="text-center max-w-3xl mx-auto space-y-6 py-8">
        
