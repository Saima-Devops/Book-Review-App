"use client";
import Image from "next/image";
import { useState } from "react";
import { bookCoverUrl } from "../services/api";

export default function BookCoverImage({ book, children }) {
  const [failed, setFailed] = useState(false);
  if (!book.coverVersion || failed) return children || null;
  return <Image className="uploaded-book-cover" src={bookCoverUrl(book)} alt={`Cover of ${book.title}`} fill
    unoptimized sizes="(max-width: 760px) 100vw, 340px" onError={() => setFailed(true)} />;
}
