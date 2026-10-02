"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { addBook, fetchBooks } from "../services/api";
import { useUser } from "../context/UserContext";

export default function Home() {
  const { user } = useUser();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("rating");
  const [saved, setSaved] = useState([]);
  const [onlySaved, setOnlySaved] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", rating: 5 });
  const [bookMessage, setBookMessage] = useState("");
  const [bookError, setBookError] = useState("");

  const savedKey = user?.id ? `shelf-saved-${user.id}` : "shelf-saved-guest";

  useEffect(() => {
    fetchBooks()
      .then(setBooks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      const userSaved = JSON.parse(localStorage.getItem(savedKey) || "[]");
      const legacySaved = JSON.parse(localStorage.getItem("shelf-saved") || "[]");
      setSaved(userSaved.length ? userSaved : legacySaved);
    } catch {
      setSaved([]);
    }
  }, [savedKey]);

  const favouriteBooks = useMemo(
    () => books.filter((book) => saved.includes(book.id)),
    [books, saved]
  );

  const visible = useMemo(() => {
    return books
      .filter((book) => {
        const matchesSearch = `${book.title} ${book.author}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return matchesSearch && (!onlySaved || saved.includes(book.id));
      })
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : Number(b.rating) - Number(a.rating)
      );
  }, [books, onlySaved, query, saved, sort]);

  const saveFavourites = (nextSaved) => {
    setSaved(nextSaved);
    localStorage.setItem(savedKey, JSON.stringify(nextSaved));
  };

  const toggle = (id) => {
    const next = saved.includes(id)
      ? saved.filter((savedId) => savedId !== id)
      : [...saved, id];
    saveFavourites(next);
  };

  const handleBookSubmit = async (event) => {
    event.preventDefault();
    setBookError("");
    setBookMessage("");

    if (!user) {
      setBookError("Please log in to upload a book.");
      return;
    }

    try {
      const response = await addBook(newBook);
      setBooks((currentBooks) => [response.book, ...currentBooks]);
      setNewBook({ title: "", author: "", rating: 5 });
      setBookMessage("Book uploaded to the collection.");
    } catch (err) {
      setBookError(err.message || "Failed to add book.");
    }
  };

  return (
    <div className="library">
      <section className="hero">
        <div>
          <span className="eyebrow">THE READER&apos;S CORNER</span>
          <h1>
            Your next great read
            <br />
            <em>starts here.</em>
          </h1>
          <p>
            Discover thoughtful books. Share honest reviews.
            <br />
            Build a shelf that feels like you.
          </p>
          <a href="#collection" className="primary">
            Explore the collection
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="book-spine">IDEAS</div>
          <div className="book-spine second">STORIES</div>
          <div className="book-spine third">DISCOVERY</div>
          <span>One book. A thousand possibilities.</span>
        </div>
      </section>

      <section className="book-upload" aria-labelledby="upload-book-title">
        <div>
          <span className="eyebrow">ADD TO THE SHELF</span>
          <h2 id="upload-book-title">Upload a book</h2>
          <p>Share a title with the community so readers can review it.</p>
        </div>
        <form onSubmit={handleBookSubmit}>
          <label>
            Book title
            <input
              value={newBook.title}
              onChange={(event) => setNewBook({ ...newBook, title: event.target.value })}
              placeholder="Book title"
              required
            />
          </label>
          <label>
            Author
            <input
              value={newBook.author}
              onChange={(event) => setNewBook({ ...newBook, author: event.target.value })}
              placeholder="Author name"
              required
            />
          </label>
          <label>
            Starting rating
            <select
              value={newBook.rating}
              onChange={(event) => setNewBook({ ...newBook, rating: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((num) => (
                <option key={num} value={num}>
                  {num} star{num > 1 ? "s" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="primary" type="submit">
            Upload book
          </button>
          {bookMessage && <p className="success">{bookMessage}</p>}
          {bookError && <p className="error">{bookError}</p>}
        </form>
      </section>

      <section id="collection">
        <div className="section-title">
          <div>
            <span className="eyebrow">CURATED FOR CURIOUS MINDS</span>
            <h2>
              The collection <small>{books.length} books</small>
            </h2>
          </div>
          <button
            className={onlySaved ? "chip active" : "chip"}
            onClick={() => setOnlySaved(!onlySaved)}
            type="button"
          >
            {onlySaved ? "Show all books" : "My favourites"}
          </button>
        </div>
        <div className="toolbar">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input
              aria-label="Search books"
              placeholder="Search by title or author..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            aria-label="Sort books"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="rating">Highest rated</option>
            <option value="title">Title A-Z</option>
          </select>
        </div>
        {loading ? (
          <p role="status">Opening the bookshelf...</p>
        ) : error ? (
          <p role="alert" className="error">
            {error}. Please check the backend connection.
          </p>
        ) : (
          <div className="book-grid">
            {visible.map((book, index) => (
              <article className="book-card" key={book.id}>
                <div className={`cover cover-${index % 3}`}>
                  <span className="cover-label">THE READER&apos;S EDITION</span>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <button
                    className="save"
                    aria-label={`${saved.includes(book.id) ? "Remove from" : "Add to"} favourites: ${book.title}`}
                    aria-pressed={saved.includes(book.id)}
                    onClick={() => toggle(book.id)}
                    type="button"
                  >
                    {saved.includes(book.id) ? "♥" : "♡"}
                  </button>
                </div>
                <div className="card-info">
                  <span className="rating">
                    ★ {Number(book.rating).toFixed(1)} <small>/ 5</small>
                  </span>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  <Link href={`/book/${book.id}`}>Read & review</Link>
                </div>
              </article>
            ))}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <p>No matching books. Try another search or save a favourite.</p>
        )}
      </section>

      <section id="my-favourites" className="favourites-panel">
        <div className="section-title">
          <div>
            <span className="eyebrow">SAVED PREFERENCES</span>
            <h2>
              My favourites <small>{favouriteBooks.length} saved</small>
            </h2>
          </div>
          <button className="chip" type="button" onClick={() => setOnlySaved(true)}>
            View saved only
          </button>
        </div>
        {favouriteBooks.length ? (
          <div className="favourite-list">
            {favouriteBooks.map((book) => (
              <Link key={book.id} href={`/book/${book.id}`}>
                <strong>{book.title}</strong>
                <span>{book.author}</span>
                <small>★ {Number(book.rating).toFixed(1)}</small>
              </Link>
            ))}
          </div>
        ) : (
          <p>Choose the heart on any book to save it here.</p>
        )}
      </section>
    </div>
  );
}
