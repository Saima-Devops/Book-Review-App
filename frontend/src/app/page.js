"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, PenLine, ImagePlus } from "lucide-react";
import { addBook, deleteBook, fetchBooks } from "../services/api";
import { useUser } from "../context/UserContext";
import BookTitleLookup from "../components/BookTitleLookup";
import ConfirmationDialog from "../components/ConfirmationDialog";
import CoverUploadDialog from "../components/CoverUploadDialog";
import BookCoverImage from "../components/BookCoverImage";

export default function Home() {
  const { user } = useUser();
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("rating");
  const [saved, setSaved] = useState([]);
  const [onlySaved, setOnlySaved] = useState(false);
  const [newBook, setNewBook] = useState({ title: "", author: "", synopsis: "", rating: 5, catalogId: null, sourceUrl: null });
  const [uploading, setUploading] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [bookToDelete, setBookToDelete] = useState(null);
  const [uploadedBook, setUploadedBook] = useState("");
  const [collectionMessage, setCollectionMessage] = useState("");
  const [collectionError, setCollectionError] = useState("");
  const [bookMessage, setBookMessage] = useState("");
  const [bookError, setBookError] = useState("");
  const [cover, setCover] = useState(null);
  const [coverDialog, setCoverDialog] = useState(false);

  const savedKey = user?.id ? `shelf-saved-${user.id}` : null;

  useEffect(() => {
    fetchBooks()
      .then(setBooks)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    try {
      if (!savedKey) { setSaved([]); return; }
      const userSaved = JSON.parse(localStorage.getItem(savedKey) || "[]");
      setSaved(Array.isArray(userSaved) ? userSaved : []);
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
    if (!user || !savedKey || !localStorage.getItem("token")) return;
    setSaved(nextSaved);
    localStorage.setItem(savedKey, JSON.stringify(nextSaved));
  };

  const toggle = (id) => {
    if (!user || !localStorage.getItem("token")) return;
    const next = saved.includes(id)
      ? saved.filter((savedId) => savedId !== id)
      : [...saved, id];
    saveFavourites(next);
  };

  const handleBookSubmit = async (event) => {
    event.preventDefault();
    if (uploading || catalogLoading) return;
    setBookError("");
    setBookMessage("");

    if (!user) {
      setBookError("Please log in to upload a book.");
      return;
    }

    try {
      setUploading(true);
      const response = await addBook({ ...newBook, ...(cover ? { cover } : {}) });
      setBooks((currentBooks) => [response.book, ...currentBooks]);
      setNewBook({ title: "", author: "", synopsis: "", rating: 5, catalogId: null, sourceUrl: null });
      setCover(null);
      setBookMessage("Book uploaded to the collection.");
      setUploadedBook(response.book.title);
    } catch (err) {
      setBookError(err.message || "Failed to add book.");
    } finally {
      setUploading(false);
    }
  };

  const handleBookDelete = async (book) => {
    if (deletingId !== null) return;
    setCollectionError("");
    setCollectionMessage("");
    setDeletingId(book.id);
    try {
      await deleteBook(book.id);
      setBooks((currentBooks) => currentBooks.filter((item) => item.id !== book.id));
      saveFavourites(saved.filter((savedId) => savedId !== book.id));
      setCollectionMessage("Book and its reviews deleted.");
      setBookToDelete(null);
    } catch (err) {
      setCollectionError(err.message);
    } finally {
      setDeletingId(null);
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
            Build a personal bookshelf of stories you love.
          </p>
          <a href="#collection" className="primary">
            Explore the collection
          </a>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="book-spine">IDEAS</div>
          <div className="book-spine second">STORIES</div>
          <div className="book-spine third">DISCOVERY</div>
          <span>Between the covers, a new world awaits.</span>
        </div>
      </section>

      <section className="book-upload" aria-labelledby="upload-book-title">
        <div>
          <span className="eyebrow">ADD TO THE SHELF</span>
          <h2 id="upload-book-title">Upload a book</h2>
          <p>Add your favorite book and its synopsis to the collection, and invite the community to review it.</p>
        </div>
        <form onSubmit={handleBookSubmit}>
          <BookTitleLookup book={newBook} setBook={setNewBook} enabled={Boolean(user)} disabled={uploading} onBusyChange={setCatalogLoading} />
          <label>
            Author
            <input
              value={newBook.author}
              onChange={(event) => setNewBook({ ...newBook, author: event.target.value, catalogId: null, sourceUrl: null })}
              placeholder="Author name"
              maxLength={255}
              required
            />
          </label>
          <label>
            Rating
            <div className="select-field">
            <select
              aria-label="Rating"
              value={newBook.rating}
              onChange={(event) => setNewBook({ ...newBook, rating: Number(event.target.value) })}
            >
              {[1, 2, 3, 4, 5].map((num) => (
                <option key={num} value={num}>
                  {num} star{num > 1 ? "s" : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
            </div>
          </label>
          <label className="synopsis-field">
            Synopsis
            <textarea
              aria-label="Synopsis"
              value={newBook.synopsis}
              onChange={(event) => setNewBook({ ...newBook, synopsis: event.target.value })}
              placeholder="A short summary of the book"
              maxLength={2000}
              rows={3}
            />
          </label>
          <div className="cover-form-control"><span>Book cover (optional)</span><button className="chip" type="button" disabled={!user || uploading} onClick={() => setCoverDialog(true)}><ImagePlus size={16} aria-hidden="true" />{cover ? "Change cover" : "Upload cover"}</button>
            {cover && <span className="cover-selected" role="status">Cover selected</span>}</div>
          <button className="primary upload-submit" type="submit" disabled={uploading || catalogLoading}>
            {uploading ? "Uploading..." : "Upload book"}
          </button>
          {bookMessage && <p className="success form-message" role="status">{bookMessage}</p>}
          {bookError && <p className="error form-message" role="alert">{bookError}</p>}
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
          <div className="select-field sort-field">
          <select
            aria-label="Sort books"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option value="rating">Highest rated</option>
            <option value="title">Title A-Z</option>
          </select>
          <ChevronDown size={16} aria-hidden="true" />
          </div>
        </div>
        {collectionMessage && <p className="success" role="status">{collectionMessage}</p>}
        {collectionError && <p className="error" role="alert">{collectionError}</p>}
        {loading ? (
          <p role="status">Opening the bookshelf...</p>
        ) : error ? (
          <p role="alert" className="error">
            {error}. Please check the backend connection.
          </p>
        ) : (
          <div className="book-grid">
            {visible.map((book) => (
              <article className="book-card" key={book.id}>
                <div className={`cover cover-${Number(book.id) % 3}`}>
                  <BookCoverImage book={book}>
                  <span className="cover-label">THE READER&apos;S EDITION</span>
                  <h3>{book.title}</h3>
                  <p>{book.author}</p>
                  </BookCoverImage>
                  <button
                    className="save"
                    aria-label={`${saved.includes(book.id) ? "Remove from" : "Add to"} favourites: ${book.title}`}
                    aria-pressed={saved.includes(book.id)}
                    onClick={() => toggle(book.id)}
                    disabled={!user}
                    title={user ? "Save to your favourites" : "Log in to save favourites"}
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
                  {book.synopsis && <p className="book-synopsis">{book.synopsis}</p>}
                  {book.sourceUrl && <a className="book-source" href={book.sourceUrl} target="_blank" rel="noopener noreferrer">View on Open Library</a>}
                  <div className="book-card-actions">
                    <Link className="primary review-book" href={`/book/${book.id}#write-review`}><PenLine size={16} aria-hidden="true" />Write a Review</Link>
                    {user && user.id === book.uploadedBy && (
                    <button
                      className="delete-book"
                      type="button"
                      aria-label={`Delete book: ${book.title}`}
                      disabled={deletingId !== null}
                      onClick={() => { setCollectionError(""); setBookToDelete(book); }}
                    >
                      {deletingId === book.id ? "Deleting..." : "Delete book"}
                    </button>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {!loading && !error && visible.length === 0 && (
          <p>No matching books. Try another search or save a favourite.</p>
        )}
      </section>
      {coverDialog && <CoverUploadDialog initialCover={cover} onSave={(value) => { setCover(value); setCoverDialog(false); }} onClose={() => setCoverDialog(false)} />}

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
          <p>{user ? "Choose the heart on any book to save it here." : <Link href="/login">Log in to save your favourites.</Link>}</p>
        )}
      </section>
      <ConfirmationDialog open={Boolean(uploadedBook)} title="Book added to the shelf!" message={`"${uploadedBook}" is now in the collection, ready for the community to review.`} onConfirm={() => setUploadedBook("")} />
      <ConfirmationDialog open={Boolean(bookToDelete)} title="Delete this book?" message={`Are you sure you want to delete "${bookToDelete?.title || ""}"? Its reviews will also be removed. This cannot be undone.`} confirmLabel="Delete book" destructive pending={deletingId !== null} error={collectionError} onConfirm={() => bookToDelete && handleBookDelete(bookToDelete)} onCancel={() => { if (deletingId === null) setBookToDelete(null); }} />
    </div>
  );
}
