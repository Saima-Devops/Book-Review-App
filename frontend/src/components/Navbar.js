"use client";
import Link from "next/link";
import { useUser } from "../context/UserContext";
export default function Navbar(){const {user,logout}=useUser();return <nav className="nav"><Link className="brand" href="/"><span>▤</span> The Reading Room<small>BOOKS · REVIEWS · COMMUNITY</small></Link><div className="nav-links"><Link href="/">Discover</Link>{user?<><span>Hello, {user.name}</span><button className="chip" onClick={logout}>Log out</button></>:<><Link href="/login">Log in</Link><Link className="primary" href="/register">Join the community ↗</Link></>}</div></nav>;}
