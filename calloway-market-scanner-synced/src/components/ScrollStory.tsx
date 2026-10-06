import React, { useEffect, useLayoutEffect, useRef } from "react";
import { MapPin } from "lucide-react";
import { runStory } from "./storyScene";
import "./ScrollStory.css";

export interface StoryCounts {
  beer: number; // beer, seltzer, hard tea, other RTD
  liquor: number;
  wine: number;
  snacks: number;
  drinks: number;
}

interface ScrollStoryProps {
  counts: StoryCounts;
  onShop: (group: "beer" | "liquor" | "snacks") => void;
}

const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=2816+Calloway+Dr+Unit+100+Bakersfield+CA+93312";

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * Full-screen scroll story for the top of the customer homepage.
 * A pinned stage where 3D cans, bottles and snacks turn and fly around as the
 * visitor scrolls, over color washes that change with each part. The numbers
 * come from the live product list. If 3D can't start (no WebGL, or the visitor
 * prefers reduced motion) it falls back to a still, colorful hero.
 */
function ScrollStory({ counts, onShop }: ScrollStoryProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const storyRef = useRef<HTMLElement>(null);

  // Make the story as wide as the visible page (the site's content column is
  // narrower than the screen) and tuck it under the site's sticky header.
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
    const story = storyRef.current;
    if (!story) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if ("WebGLRenderingContext" in window && !reduce) story.classList.add("is-live");
    const stop = runStory(story);
    return () => {
      stop();
      story.classList.remove("is-live", "has-3d", "no-3d");
    };
  }, []);

  const liquorWine = counts.liquor + counts.wine;
  const snackDrinks = counts.snacks + counts.drinks;

  return (
    <div className="cm-story-root" ref={rootRef}>
      <section className="story" id="story" ref={storyRef} aria-labelledby="hero-title">
        <div className="story-stage">
          <div className="story-bg" aria-hidden="true">
            <span className="blob" />
            <span className="blob" />
            <span className="blob" />
            <span className="story-rings" />
          </div>
          <canvas className="story-canvas" aria-hidden="true" />
          <div className="story-callouts" aria-hidden="true">
            <div className="callout" data-ch="1" data-obj="beer"><span className="co-label">Beer</span><span className="co-line" /><span className="co-dot" /></div>
            <div className="callout" data-ch="1" data-obj="seltzer"><span className="co-label">Hard seltzer</span><span className="co-line" /><span className="co-dot" /></div>
            <div className="callout" data-ch="1" data-obj="tea"><span className="co-label">Hard tea</span><span className="co-line" /><span className="co-dot" /></div>
            <div className="callout" data-ch="2" data-obj="whiskey"><span className="co-label">{counts.liquor ? `${fmt(counts.liquor)} liquors` : "Liquor"}</span><span className="co-line" /><span className="co-dot" /></div>
            <div className="callout" data-ch="2" data-obj="wine"><span className="co-label">{counts.wine ? `${fmt(counts.wine)} wines` : "Wine"}</span><span className="co-line" /><span className="co-dot" /></div>
            <div className="callout" data-ch="3" data-obj="chips"><span className="co-label">{counts.snacks ? `${fmt(counts.snacks)} snacks` : "Snacks"}</span><span className="co-line" /><span className="co-dot" /></div>
            <div className="callout" data-ch="3" data-obj="energy"><span className="co-label">{counts.drinks ? `${fmt(counts.drinks)} drinks` : "Drinks"}</span><span className="co-line" /><span className="co-dot" /></div>
          </div>
          <div className="wrap story-copy">
            <div className="chapter" data-ch="0">
              <p className="status-chip">Open daily on Calloway Drive</p>
              <h1 id="hero-title">
                <span className="line">Beer, liquor &amp; snacks.</span>{" "}
                <span className="line accent">Open late.</span>
              </h1>
              <p className="hero-sub">
                Prices come straight from our register. Shop in store or get delivery through DoorDash and Grubhub.
              </p>
              <div className="hero-ctas">
                <a className="btn btn-red" href="#departments">Shop departments</a>
                <a className="btn btn-ghost" href={MAPS_URL} target="_blank" rel="noopener noreferrer">
                  <MapPin className="icon" aria-hidden="true" />Get directions
                </a>
              </div>
            </div>
            <div className="chapter" data-ch="1" style={{ ["--g1" as any]: "#f59e0b", ["--g2" as any]: "#ff4f8b" }}>
              {counts.beer > 0 && <p className="ch-num"><b>{fmt(counts.beer)}</b><span>items</span></p>}
              <h2>Cold beer &amp; seltzer</h2>
              <p className="ch-text">Beer, hard seltzer, hard tea and non-alcoholic picks.</p>
              <button type="button" className="btn btn-ink" onClick={() => onShop("beer")}>Shop beer &amp; seltzer</button>
            </div>
            <div className="chapter" data-ch="2" style={{ ["--g1" as any]: "#e4002b", ["--g2" as any]: "#8b5cf6" }}>
              {liquorWine > 0 && <p className="ch-num"><b>{fmt(liquorWine)}</b><span>items</span></p>}
              <h2>Liquor &amp; wine</h2>
              <p className="ch-text">
                {counts.liquor > 0 && counts.wine > 0
                  ? `${fmt(counts.liquor)} liquors and ${fmt(counts.wine)} wines, all at in-store prices.`
                  : "Whiskey, tequila, vodka, wine and more, all at in-store prices."}
              </p>
              <button type="button" className="btn btn-ink" onClick={() => onShop("liquor")}>Shop liquor</button>
            </div>
            <div className="chapter" data-ch="3" style={{ ["--g1" as any]: "#ff8a00", ["--g2" as any]: "#e4002b" }}>
              {snackDrinks > 0 && <p className="ch-num"><b>{fmt(snackDrinks)}</b><span>items</span></p>}
              <h2>Snacks &amp; drinks for the ride home</h2>
              <p className="ch-text">Chips, jerky, candy, energy drinks, soda, water and more.</p>
              <button type="button" className="btn btn-ink" onClick={() => onShop("snacks")}>Shop snacks</button>
            </div>
          </div>
          <div className="story-dots" role="group" aria-label="Jump to a part of the story">
            <button type="button" aria-label="Open late" aria-current="true" />
            <button type="button" aria-label="Beer and seltzer" />
            <button type="button" aria-label="Liquor and wine" />
            <button type="button" aria-label="Snacks and drinks" />
          </div>
          <div className="scroll-cue" aria-hidden="true"><i />Scroll</div>
        </div>
      </section>
    </div>
  );
}

export default React.memo(ScrollStory);
