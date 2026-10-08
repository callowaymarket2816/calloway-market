import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import "./SpecialsStory.css";

export interface SpecialItem {
  id: string;
  name: string;
  price: string; // e.g. "$18.99"
  note: string; // e.g. "18 pack"
  imageUrl: string;
  accent: string; // hex
  inStock: boolean;
}

interface Props {
  specials: SpecialItem[];
  onView: (id: string) => void;
  onAdd: (id: string) => void;
}

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=2816+Calloway+Dr+Unit+100+Bakersfield+CA+93312";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3); // easeOutCubic
const smooth = (t: number) => { t = clamp(t); return t * t * (3 - 2 * t); };

function Price({ value }: { value: string }) {
  const m = value.trim().match(/^\$?\s*(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return <span className="sp-price-raw">{value}</span>;
  const cents = (m[2] || "00").padEnd(2, "0");
  return (
    <span className="sp-price-num" aria-label={`$${m[1]}.${cents}`}>
      <sup>$</sup>
      <b>{m[1]}</b>
      <sup>{cents}</sup>
    </span>
  );
}

/**
 * Pinned, scroll-driven showcase of special-price products. Each special gets
 * a chapter: the real product photo swings in and turns, turns away and leaves,
 * the price rises in big, then lifts away as the next special's colors blend
 * in. Everything is driven by scroll position. With reduced motion it falls
 * back to a plain row of cards.
 */
function SpecialsStory({ specials, onView, onAdd }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const secRef = useRef<HTMLElement>(null);
  const introRef = useRef<HTMLDivElement>(null);
  const bgRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prodRefs = useRef<(HTMLDivElement | null)[]>([]);
  const nameRefs = useRef<(HTMLDivElement | null)[]>([]);
  const priceRefs = useRef<(HTMLDivElement | null)[]>([]);
  const dotRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const cueRef = useRef<HTMLDivElement>(null);
  const [live] = useState(
    () => typeof window !== "undefined" && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const T = specials.length + 1; // intro + one chapter per special

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const apply = () => {
      root.style.setProperty("--cm-vw", `${document.documentElement.clientWidth}px`);
      const header = document.querySelector("header");
      const sticky = header && getComputedStyle(header).position === "sticky";
      root.style.setProperty("--cm-hdr", sticky && header ? `${Math.round(header.getBoundingClientRect().height)}px` : "0px");
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  useEffect(() => {
    if (!live) return;
    const sec = secRef.current;
    if (!sec) return;
    let raf = 0;
    let visible = true;

    const paint = () => {
      raf = 0;
      const r = sec.getBoundingClientRect();
      const stage = sec.firstElementChild as HTMLElement;
      const span = Math.max(1, r.height - (stage?.clientHeight || window.innerHeight));
      const prog = clamp(-r.top / span);
      const t = prog * T; // 0..T, chapter i spans [i, i+1]

      // intro text fades up and away as the first product arrives
      if (introRef.current) {
        const f = smooth((t - 0.2) / 0.5);
        introRef.current.style.opacity = String(1 - f);
        introRef.current.style.transform = `translate3d(0, ${-f * 8}vh, 0)`;
        introRef.current.style.pointerEvents = f > 0.6 ? "none" : "auto";
      }
      if (cueRef.current) cueRef.current.style.opacity = String(1 - smooth(t / 0.3));

      // color washes blend into each other
      const bgCount = T;
      for (let i = 0; i < bgCount; i++) {
        const el = bgRefs.current[i];
        if (!el) continue;
        const d = Math.abs(t - (i + 0.5));
        el.style.opacity = String(clamp(2 * (0.8 - d)));
        // slow drift for depth
        el.style.transform = `translate3d(${(t - i) * -3}vw, ${(t - i) * -2}vh, 0) scale(${1 + Math.abs(t - i - 0.5) * 0.06})`;
      }

      specials.forEach((_, k) => {
        const i = k + 1;
        const p = t - i; // local progress, -1..T
        const prod = prodRefs.current[k];
        const nm = nameRefs.current[k];
        const pr = priceRefs.current[k];
        const on = p > -0.02 && p < 1.02;
        if (prod) prod.style.visibility = on ? "visible" : "hidden";
        if (nm) nm.style.visibility = on ? "visible" : "hidden";
        if (pr) pr.style.visibility = on ? "visible" : "hidden";
        if (!on) return;

        const e = ease(p / 0.28);
        const h = clamp((p - 0.28) / 0.22);
        const x = smooth((p - 0.5) / 0.2);
        const rot = lerp(-220, -18, e) + h * 36 + x * 200;
        const ty = (1 - e) * 36 - x * 44;
        const sc = lerp(0.62, 1, e) * (1 - 0.24 * x);
        const op = clamp(e * 1.3) * (1 - x);
        if (prod) {
          prod.style.opacity = String(op);
          prod.style.transform = `perspective(1400px) translate3d(0, ${ty}vh, 0) rotateY(${rot}deg) scale(${sc})`;
        }
        if (nm) {
          nm.style.opacity = String(clamp((p - 0.12) / 0.12) * (1 - smooth((p - 0.46) / 0.1)));
          nm.style.transform = `translate3d(0, ${(1 - ease((p - 0.1) / 0.2)) * 3}vh, 0)`;
        }
        const pe = ease((p - 0.5) / 0.22);
        const px = smooth((p - 0.86) / 0.14);
        if (pr) {
          const o = pe * (1 - px);
          pr.style.opacity = String(o);
          pr.style.transform = `translate3d(0, ${(1 - pe) * 52 - px * 58}vh, 0) scale(${lerp(0.88, 1, pe)})`;
          pr.style.pointerEvents = o > 0.7 ? "auto" : "none";
        }
      });

      const cur = clamp(Math.floor(t + 0.35), 0, T - 1);
      dotRefs.current.forEach((d, i) => {
        if (!d) return;
        if (i === cur) d.setAttribute("aria-current", "true");
        else d.removeAttribute("aria-current");
      });
    };

    const queue = () => {
      if (!raf && visible) raf = requestAnimationFrame(paint);
    };
    const io = new IntersectionObserver(
      (es) => { visible = es[0].isIntersecting; if (visible) queue(); },
      { rootMargin: "200px 0px" }
    );
    io.observe(sec);
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    paint();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [live, specials, T]);

  const jump = (i: number) => {
    const sec = secRef.current;
    if (!sec) return;
    const stage = sec.firstElementChild as HTMLElement;
    const span = sec.offsetHeight - stage.clientHeight;
    const top = sec.getBoundingClientRect().top + window.scrollY;
    // land in the middle of the chapter's "hold" so the product is on screen
    const t = i === 0 ? 0.02 : i + 0.4;
    window.scrollTo({ top: top + (span * t) / T, behavior: "smooth" });
  };

  const intro = (
    <div className="sp-intro" ref={introRef}>
      <p className="sp-chip">Open daily on Calloway Drive</p>
      <h1 id="hero-title">
        <span>Beer, liquor &amp; snacks.</span> <em>Open late.</em>
      </h1>
      <p className="sp-sub">This week's specials, straight from our register. Scroll to see them.</p>
      <div className="sp-ctas">
        <a className="sp-btn sp-btn-red" href="#departments">Shop departments</a>
        <a className="sp-btn sp-btn-ghost" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
          <MapPin className="sp-icon" aria-hidden="true" />Get directions
        </a>
      </div>
    </div>
  );

  // Still version: reduced motion
  if (!live) {
    return (
      <div className="cm-sp-root">
        <section className="sp-still" aria-labelledby="hero-title">
          <div className="sp-still-in">
            {intro}
            <div className="sp-still-grid">
              {specials.map((s) => (
                <button key={s.id} type="button" className="sp-still-card" style={{ ["--ac" as any]: s.accent }} onClick={() => onView(s.id)}>
                  {s.imageUrl && !broken[s.id] ? (
                    <img src={s.imageUrl} alt={s.name} onError={() => setBroken((b) => ({ ...b, [s.id]: true }))} />
                  ) : null}
                  <span className="sp-still-name">{s.name}</span>
                  {s.note && <span className="sp-still-note">{s.note}</span>}
                  <span className="sp-still-price"><Price value={s.price} /></span>
                </button>
              ))}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="cm-sp-root" ref={rootRef}>
      <section className="sp is-live" ref={secRef} style={{ height: `${T * 210 + 100}svh` }} aria-labelledby="hero-title">
        <div className="sp-stage">
          <div className="sp-washes" aria-hidden="true">
            {Array.from({ length: T }).map((_, i) => (
              <div
                key={i}
                className="sp-wash"
                ref={(el) => { bgRefs.current[i] = el; }}
                style={{ ["--ac" as any]: i === 0 ? "#e4002b" : specials[i - 1].accent }}
              >
                {i > 0 && <span className="sp-mark">{specials[i - 1].name}</span>}
              </div>
            ))}
            <span className="sp-rings" />
          </div>

          {intro}

          {specials.map((s, k) => (
            <React.Fragment key={s.id}>
              <div className="sp-prod-wrap" aria-hidden="true">
                <div className="sp-prod" ref={(el) => { prodRefs.current[k] = el; }} style={{ visibility: "hidden" }}>
                  {s.imageUrl && !broken[s.id] ? (
                    <img src={s.imageUrl} alt="" draggable={false} onError={() => setBroken((b) => ({ ...b, [s.id]: true }))} />
                  ) : (
                    <div className="sp-noimg">{s.name}</div>
                  )}
                </div>
                <span className="sp-shadow" />
              </div>
              <div className="sp-name" ref={(el) => { nameRefs.current[k] = el; }} style={{ visibility: "hidden", ["--ac" as any]: s.accent }}>
                <span>{s.note || "Special"}</span>
                <strong>{s.name}</strong>
              </div>
              <div className="sp-pricebox" ref={(el) => { priceRefs.current[k] = el; }} style={{ visibility: "hidden", ["--ac" as any]: s.accent }}>
                <p className="sp-pname">{s.name}{s.note ? ` · ${s.note}` : ""}</p>
                <div className="sp-price"><Price value={s.price} /></div>
                <div className="sp-pbtns">
                  {s.inStock && <button type="button" className="sp-btn sp-btn-red" onClick={() => onAdd(s.id)}>Add to cart</button>}
                  <button type="button" className="sp-btn sp-btn-ghost" onClick={() => onView(s.id)}>View item</button>
                </div>
              </div>
            </React.Fragment>
          ))}

          <div className="sp-dots" role="group" aria-label="Jump to a special">
            {Array.from({ length: T }).map((_, i) => (
              <button
                key={i}
                type="button"
                ref={(el) => { dotRefs.current[i] = el; }}
                aria-label={i === 0 ? "Open late" : specials[i - 1].name}
                onClick={() => jump(i)}
              />
            ))}
          </div>
          <div className="sp-cue" ref={cueRef} aria-hidden="true"><i />Scroll</div>
        </div>
      </section>
    </div>
  );
}

export default React.memo(SpecialsStory);
