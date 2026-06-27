export interface Product {
  id: string;
  name: string;
  category: string; // Real departments: Liquor, Wine, Beer, RTD, Soda, Water, Sports & Energy Drinks, Snacks, Household, Coffee/Tea/Juice
  subcategory?: string; // Real subcategory within department, e.g. "Whiskey & Bourbon", "Chips" — populated for verified inventory items.
  description: string;
  origin: string;
  abv: string;
  size: string;
  stockStatus: "In Stock" | "Limited Stock" | "Special Order Only" | "Temporarily Out of Stock";
  tastingNotes: string[];
  foodPairing: string;
  imageColor: string; // Background color for elegant SVG/icon representation
  iconName: string; // Name of Lucide icon to display
  popularity: number; // 1-100 score representing popularity
  price?: number; // Real DoorDash price from verified inventory. If undefined, the UI must show "Price unavailable" — never guess one.
  marginPercent?: number; // Markup percentage applied
}

export interface SearchQuery {
  id: string;
  query: string;
  category?: string;
  timestamp: string; // ISO string
  distanceMiles: number | null; // null until real location data is wired in — never a fabricated placeholder.
  neighborhood: string; // "Unknown (location data not yet connected)" until tied to a real data source.
  source?: "Google Search" | "Calloway Website"; // Differentiate search sources
}

export interface AnalyticsSummary {
  recentSearches: SearchQuery[];
  popularCategories: { name: string; value: number }[];
  trendingQueries: { text: string; count: number; category: string }[];
  heatMapData: { neighborhood: string; count: number; averageDistance: number }[];
  googlePopularCategories: { name: string; value: number }[];
  googlePopularBrands: { name: string; value: number }[];
  websitePopularCategories: { name: string; value: number }[];
  websitePopularBrands: { name: string; value: number }[];
}

export interface AiInsightsResponse {
  insights: string;
  suggestions: string[];
  generatedAt: string;
}
