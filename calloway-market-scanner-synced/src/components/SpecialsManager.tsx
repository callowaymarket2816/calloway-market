import React, { useEffect, useMemo, useState } from "react";
import { Product } from "../types";

interface Special {
  id: string;
  productId: string;
  name: string;
  price: string;
  note: string;
  imageUrl: string;
  accent: string;
  enabled: boolean;
}

const ACCENTS = ["#e4002b", "#f59e0b", "#7c3aed", "#0d9488", "#ec4899", "#2563eb"];

export default function SpecialsManager({ products, merchantKey }: { products: Product[]; merchantKey: string }) {
  const [specials, setSpecials] = useState<Special[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/settings/specials")
      .then((r) => r.json())
      .then((d) => setSpecials(d.specials || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return products.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 8);
  }, [q, products]);

  const add = (p: Product) => {
    const store = (p as any).storePrice ?? p.price;
    setSpecials((prev) => [
      ...prev,
      {
        id: `special_${Date.now()}`,
        productId: p.id,
        name: p.name,
        price: store ? `$${Number(store).toFixed(2)}` : "",
        note: "",
        imageUrl: "",
        accent: ACCENTS[prev.length % ACCENTS.length],
        enabled: true,
      },
    ]);
    setQ("");
  };

  const upd = (id: string, patch: Partial<Special>) =>
    setSpecials((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => setSpecials((prev) => prev.filter((s) => s.id !== id));
  const move = (id: string, dir: -1 | 1) =>
    setSpecials((prev) => {
      const i = prev.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/settings/specials", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Merchant-Key": merchantKey },
        body: JSON.stringify({ specials }),
      });
      if (res.ok) {
        const d = await res.json();
        setSpecials(d.specials || []);
        setMsg("Saved! Your specials are now live at the top of the customer site.");
      } else {
        const e = await res.json().catch(() => ({}));
        setMsg(e.error || "Failed to save specials.");
      }
    } catch (err: any) {
      setMsg(`Error saving specials: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 md:p-10 shadow-sm space-y-6 my-12" id="special-pricing">
      <div>
        <span className="text-xs font-semibold tracking-widest text-amber-800 uppercase block mb-1">Customer site</span>
        <h2 className="text-2xl font-serif text-gray-900 tracking-tight">Special Pricing</h2>
        <p className="text-xs text-gray-500 font-light mt-1">
          Pick products from your inventory and set a special price. At the top of your customer site each one gets its
          own scroll moment: the real product photo turns, then the price rises in big. They play in the order below.
          With none listed, the site shows the standard hero.
        </p>
      </div>

      {msg && (
        <div className={`p-4 rounded-xl text-xs font-medium border ${/fail|error/i.test(msg) ? "bg-rose-50 text-rose-800 border-rose-200" : "bg-emerald-50 text-emerald-800 border-emerald-200"}`}>
          {msg}
        </div>
      )}

      <div className="relative">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search your inventory to add a special (e.g. Michelob Ultra 18)"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm"
        />
        {matches.length > 0 && (
          <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
            {matches.map((p) => (
              <button key={p.id} type="button" onClick={() => add(p)} className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-amber-50 cursor-pointer">
                {(p as any).imageUrl ? (
                  <img src={(p as any).imageUrl} alt="" className="w-10 h-10 object-contain" />
                ) : (
                  <span className="w-10 h-10 bg-gray-100 rounded" />
                )}
                <span className="text-sm text-gray-800">{p.name}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {((p as any).storePrice ?? p.price) ? `$${Number((p as any).storePrice ?? p.price).toFixed(2)}` : ""}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-16 flex items-center justify-center text-xs text-gray-400">Loading…</div>
      ) : specials.length === 0 ? (
        <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl text-sm text-gray-500">
          No specials yet. Search above to add your first one.
        </div>
      ) : (
        <div className="space-y-4">
          {specials.map((s, idx) => {
            const p = byId.get(s.productId);
            const img = s.imageUrl || (p as any)?.imageUrl;
            return (
              <div key={s.id} className="border border-gray-200 rounded-2xl p-4 flex flex-col md:flex-row gap-4 bg-slate-50/40">
                <div className="w-24 h-24 shrink-0 bg-white rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden">
                  {img ? <img src={img} alt="" className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-gray-400 text-center px-2">No photo</span>}
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-[11px] font-semibold text-gray-500 uppercase sm:col-span-2">
                    Name shown
                    <input value={s.name} onChange={(e) => upd(s.id, { name: e.target.value })} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm normal-case font-normal text-gray-800" />
                  </label>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">
                    Special price
                    <input value={s.price} onChange={(e) => upd(s.id, { price: e.target.value })} placeholder="$18.99" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-semibold text-gray-800" />
                  </label>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase">
                    Label (optional)
                    <input value={s.note} onChange={(e) => upd(s.id, { note: e.target.value })} placeholder="18 pack" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-normal text-gray-800" />
                  </label>
                  <label className="text-[11px] font-semibold text-gray-500 uppercase sm:col-span-2">
                    Different photo link (optional, otherwise uses the inventory photo)
                    <input value={s.imageUrl} onChange={(e) => upd(s.id, { imageUrl: e.target.value })} placeholder="https://…" className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm normal-case font-normal text-gray-800" />
                  </label>
                  <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold text-gray-500 uppercase mr-1">Color</span>
                    {ACCENTS.map((c) => (
                      <button key={c} type="button" onClick={() => upd(s.id, { accent: c })} aria-label={c}
                        className="w-6 h-6 rounded-full cursor-pointer"
                        style={{ background: c, outline: s.accent === c ? "2px solid #111" : "none", outlineOffset: 2 }} />
                    ))}
                    <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" checked={s.enabled} onChange={(e) => upd(s.id, { enabled: e.target.checked })} />
                      Show on site
                    </label>
                  </div>
                </div>
                <div className="flex md:flex-col gap-2 shrink-0 items-center">
                  <span className="text-xs font-bold text-gray-400">#{idx + 1}</span>
                  <button type="button" onClick={() => move(s.id, -1)} className="px-2 py-1 border border-gray-200 rounded text-xs cursor-pointer">↑</button>
                  <button type="button" onClick={() => move(s.id, 1)} className="px-2 py-1 border border-gray-200 rounded text-xs cursor-pointer">↓</button>
                  <button type="button" onClick={() => remove(s.id)} className="px-2 py-1 border border-rose-200 text-rose-700 rounded text-xs cursor-pointer">Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={save} disabled={saving}
        className="px-5 py-2.5 bg-amber-950 hover:bg-amber-900 text-white font-semibold text-xs uppercase tracking-wider rounded-xl transition cursor-pointer disabled:bg-gray-300">
        {saving ? "Saving..." : "Save Specials"}
      </button>
    </div>
  );
}
