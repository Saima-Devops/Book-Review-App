import "./globals.css";
import Navbar from "../components/Navbar";
import { UserProvider } from "../context/UserContext";
import BackToTop from "../components/BackToTop";
import Link from "next/link";
import { LibraryBig, Sparkles } from "lucide-react";
export const metadata={title:"Book Shelf",description:"Discover books and share your perspective."};
export default function RootLayout({ children }) {
  return <html lang="en"><body id="top"><UserProvider>
    <Navbar />
    <main>{children}</main>
    <footer className="site-footer">
      <div className="footer-inner">
        <div className="footer-identity">
          <Link href="/" className="footer-brand"><LibraryBig size={22} strokeWidth={1.6} aria-hidden="true" /><span>Book Shelf</span></Link>
          <p className="footer-tagline"><Sparkles size={16} strokeWidth={1.6} aria-hidden="true" /><span>A good book opens a new world!</span></p>
          <small className="footer-copyright">Developed by <a href="https://saima-devops.github.io/DevOps-Learning-Hub/about/index.html">Saima Usman</a>. All rights reserved &copy; 2026.</small>
          <small className="footer-attribution">Inspired by Pravin Mishra&apos;s Epic Book.</small>
        </div>
        <nav className="footer-links" aria-label="Footer navigation">
          <Link href="/#collection">Discover</Link>
          <Link href="/#my-favourites">My favourites</Link>
        </nav>
      </div>
    </footer>
    <BackToTop />
  </UserProvider></body></html>;
}
