"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LibraryBig } from "lucide-react";
import { useUser } from "../context/UserContext";
export default function Navbar() {
  const { user, logout } = useUser();
  const headerRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

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
    <div className="nav-links">
      <Link href="/#collection">Discover</Link>
      <Link href="/#my-favourites">My favourites</Link>
      {user ? <><span className="nav-greeting">Hello, {user.name}</span><button className="chip" onClick={logout}>Log out</button></> : <><Link href="/login">Log in</Link><Link className="primary" href="/register">Join the community ↗</Link></>}
    </div>
  </nav></header>;
}
