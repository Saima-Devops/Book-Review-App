import "./globals.css";
import Navbar from "../components/Navbar";
import { UserProvider } from "../context/UserContext";
export const metadata={title:"The Reading Room",description:"Discover books and share your perspective."};
export default function RootLayout({children}){return <html lang="en"><body><UserProvider><Navbar/><main>{children}</main><footer>The Reading Room · Created by Saima Usman<span>A good book opens a new world.</span></footer></UserProvider></body></html>;}
