"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import { fetchCatalogBook, searchCatalogBooks } from "../services/api";

export default function BookTitleLookup({ book, setBook, enabled, disabled, onBusyChange }) {
  const inputId = useId();
  const listId = `${inputId}-suggestions`;
  const [suggestions, setSuggestions] = useState([]);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const detailsRequest = useRef(null);
  const searchRequest = useRef(null);
  const filledSynopsis = useRef("");
  const open = focused && suggestions.length > 0 && !book.catalogId;
  useEffect(() => { onBusyChange(detailLoading); }, [detailLoading, onBusyChange]);

  useEffect(() => {
    if (!enabled || disabled || book.catalogId || !focused || book.title.trim().length < 3 || book.title.trim().length > 120) {
      setSuggestions([]); setLoading(false); return;
    }
    const controller = new AbortController();
    searchRequest.current = controller;
    let alive = true;
    setSuggestions([]); setMessage(""); setActive(-1);
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await searchCatalogBooks(book.title.trim(), controller.signal);
        if (alive) { setSuggestions(results); setMessage(results.length ? "" : "No catalog matches. You can enter this book manually."); }
      } catch (error) {
        if (alive && !controller.signal.aborted) setMessage(error.message);
      } finally { if (alive) setLoading(false); }
    }, 500);
    return () => { alive = false; clearTimeout(timer); controller.abort(); };
  }, [book.title, book.catalogId, enabled, disabled, focused]);

  useEffect(() => () => { detailsRequest.current?.abort(); }, []);

  useEffect(() => {
    if (!enabled || disabled || !book.catalogId) {
      detailsRequest.current?.abort(); setDetailLoading(false);
    }
    if (!book.catalogId && filledSynopsis.current) {
      const previousSynopsis = filledSynopsis.current;
      filledSynopsis.current = "";
      setBook((current) => current.synopsis === previousSynopsis ? { ...current, synopsis: "" } : current);
    }
  }, [enabled, disabled, book.catalogId, setBook]);

  const changeTitle = (title) => {
    searchRequest.current?.abort(); detailsRequest.current?.abort();
    setMessage(""); setActive(-1); setFocused(true);
    const previousSynopsis = filledSynopsis.current;
    setBook((current) => ({ ...current, title, catalogId: null, sourceUrl: null,
      synopsis: previousSynopsis && current.synopsis === previousSynopsis ? "" : current.synopsis }));
    filledSynopsis.current = "";
  };

  const choose = async (suggestion) => {
    searchRequest.current?.abort(); detailsRequest.current?.abort();
    const controller = new AbortController();
    detailsRequest.current = controller;
    setSuggestions([]); setFocused(false); setMessage(""); setDetailLoading(true);
    const previousSynopsis = filledSynopsis.current;
    setBook((current) => ({ ...current, title: suggestion.title, author: suggestion.author,
      catalogId: suggestion.catalogId, sourceUrl: suggestion.sourceUrl,
      synopsis: previousSynopsis && current.synopsis === previousSynopsis ? "" : current.synopsis }));
    filledSynopsis.current = "";
    try {
      const details = await fetchCatalogBook(suggestion.catalogId, controller.signal);
      if (controller.signal.aborted) return;
      setBook((current) => {
        if (current.catalogId !== suggestion.catalogId || current.title !== suggestion.title || current.author !== suggestion.author) return current;
        if (!current.synopsis) { filledSynopsis.current = details.synopsis; return { ...current, synopsis: details.synopsis }; }
        return current;
      });
      setMessage(details.synopsis ? "" : "No catalog description is available. Add your own synopsis.");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error.message);
    } finally { if (!controller.signal.aborted) setDetailLoading(false); }
  };

  const keyDown = (event) => {
    if (event.key === "Escape") { setFocused(false); setActive(-1); return; }
    if (!open) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = event.key === "ArrowDown" ? (active + 1) % suggestions.length : (active <= 0 ? suggestions.length - 1 : active - 1);
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    }
    if (event.key === "Enter" && active >= 0) { event.preventDefault(); choose(suggestions[active]); }
  };

  return <div className="catalog-field">
    <label htmlFor={inputId}>Book title</label>
    <input id={inputId} role="combobox" aria-autocomplete="list" aria-expanded={open}
      aria-controls={open ? listId : undefined} aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
      aria-describedby={`${inputId}-status`} autoComplete="off" value={book.title} required maxLength={255}
      disabled={disabled} placeholder="Book title" onChange={(event) => changeTitle(event.target.value)}
      onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={keyDown} />
    {open && <ul id={listId} className="catalog-options" role="listbox" aria-label="Suggested books">
      {suggestions.map((suggestion, index) => <li id={`${listId}-${index}`} key={suggestion.catalogId}
        role="option" aria-selected={active === index} className={active === index ? "catalog-option active" : "catalog-option"}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(suggestion)}>
        <strong>{suggestion.title}</strong><span>{suggestion.author}{suggestion.year ? ` · ${suggestion.year}` : ""}</span>
      </li>)}
    </ul>}
    <small id={`${inputId}-status`} className="catalog-status" role="status">{detailLoading ? "Fetching description..." : loading ? "Searching Open Library..." : message}</small>
    {book.sourceUrl && <a className="catalog-source" href={book.sourceUrl} target="_blank" rel="noopener noreferrer">
      Open Library <ExternalLink size={12} aria-hidden="true" />
    </a>}
  </div>;
}
