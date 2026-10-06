"use client";
import { ArrowUpToLine } from "lucide-react";
import { useEffect, useState } from "react";

export default function BackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 300);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  const scrollToTop = () => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "instant" : "smooth" });
    document.querySelector(".brand")?.focus({ preventScroll: true });
  };

  return visible ? <button type="button" className="back-to-top" aria-label="Go to top" title="Go to top" onClick={scrollToTop}><ArrowUpToLine size={20} aria-hidden="true" /></button> : null;
}
