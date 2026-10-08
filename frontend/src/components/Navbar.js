"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LibraryBig, Menu, X } from "lucide-react";
import { useUser } from "../context/UserContext";
import { fetchModerationAccess } from "../services/api";
export default function Navbar() {
  const { user, logout } = useUser();
  const headerRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [adminId, setAdminId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOutside = (event) => {
      if (!headerRef.current.contains(event.target)) setMenuOpen(false);
    };
    const closeWithEscape = (event) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        menuButtonRef.current.focus();
      }
    };
    const closeOnDesktop = () => {
      if (window.innerWidth > 760) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeWithEscape);
    window.addEventListener("resize", closeOnDesktop);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeWithEscape);
      window.removeEventListener("resize", closeOnDesktop);
    };
  }, [menuOpen]);

  useEffect(() => {
    let active = true;
    if (user) fetchModerationAccess().then((access) => { if (active) setAdminId(access.isAdmin ? user.id : null); }).catch(() => { if (active) setAdminId(null); });
    return () => { active = false; };
  }, [user]);

  useEffect(() => {
    const updateScroll = () => setScrolled(window.scrollY > 16);
    const updateHeight = () => {
      document.documentElement.style.setProperty("--header-height", `${headerRef.current.offsetHeight}px`);
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(headerRef.current);
    updateHeight();
    updateScroll();
    window.addEventListener("scroll", updateScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", updateScroll);
      document.documentElement.style.removeProperty("--header-height");
    };
  }, []);

  return <header ref={headerRef} className={`site-header${scrolled ? " is-scrolled" : ""}`}><nav className="nav" aria-label="Main navigation">
    <div className="brand-block">
      <Link className="brand" href="/"><LibraryBig strokeWidth={1.6} aria-hidden="true" /><span className="brand-name">Book Shelf</span></Link>
      <small><span>BOOKS</span><span>·</span><span>REVIEWS</span><span>·</span><span>COMMUNITY</span></small>
    </div>
    <div className="mobile-nav-actions">
      {!user && <Link className="primary mobile-join" href="/register" onClick={() => setMenuOpen(false)}>Join the community</Link>}
      <button ref={menuButtonRef} className="mobile-menu-toggle" type="button" aria-label={menuOpen ? "Close navigation" : "Open navigation"} aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(!menuOpen)}>
        {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
      </button>
    </div>
    <div id="mobile-navigation" className="mobile-navigation" hidden={!menuOpen} onClick={(event) => { if (event.target.closest("a, button")) setMenuOpen(false); }} onBlur={(event) => {
      if (!headerRef.current.contains(event.relatedTarget)) setMenuOpen(false);
    }}>
      {!user && <><Link href="/register">Join the Community</Link><Link href="/login">Login</Link></>}
      <Link href="/#collection">Discover</Link>
      <Link href="/#my-favourites">My Favorites</Link>
      <a href="https://saima-devops.github.io/DevOps-Learning-Hub/about/index.html">About Creator</a>
      {user && adminId === user.id && <Link href="/admin/reports">Moderation</Link>}
      {user && <><span className="nav-greeting">Hello, {user.name}</span><button type="button" className="chip" onClick={logout}>Log out</button></>}
    </div>
    <div className="nav-links">
      <Link href="/#collection">Discover</Link>
      <Link href="/#my-favourites">My favourites</Link>
      {user && adminId === user.id && <Link href="/admin/reports">Moderation</Link>}
      {user ? <><span className="nav-greeting">Hello, {user.name}</span><button className="chip" onClick={logout}>Log out</button></> : <><Link href="/login">Log in</Link><Link className="primary" href="/register">Join the community ↗</Link></>}
    </div>
  </nav></header>;
}
