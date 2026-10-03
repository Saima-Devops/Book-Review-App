import "./globals.css";
import Navbar from "../components/Navbar";
import { UserProvider } from "../context/UserContext";
import BackToTop from "../components/BackToTop";
export const metadata={title:"The Reading Room",description:"Discover books and share your perspective."};
export default function RootLayout({children}){return <html lang="en"><body id="top"><UserProvider><Navbar/><main>{children}</main><footer><span>The Reading Room · Created by Saima Usman</span><span>A good book opens a new world.</span><BackToTop/></footer></UserProvider></body></html>;}
