"use client";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { useUser } from "../context/UserContext";
export default function Navbar() {
  const { user, logout } = useUser();
  return <nav className="nav">
    <div className="brand-block">
      <Link className="brand" href="/"><BookOpen aria-hidden="true" /><span className="brand-name">The Reading Room</span></Link>
      <small><span>BOOKS</span><span>·</span><span>REVIEWS</span><span>·</span><span>COMMUNITY</span></small>
    </div>
    <div className="nav-links">
      <Link href="/#collection">Discover</Link>
      <Link href="/#my-favourites">My favourites</Link>
      {user ? <><span>Hello, {user.name}</span><button className="chip" onClick={logout}>Log out</button></> : <><Link href="/login">Log in</Link><Link className="primary" href="/register">Join the community ↗</Link></>}
    </div>
  </nav>;
}
