"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  deleteReview,
  fetchBookDetails,
  fetchReviews,
  submitReview,
  updateReview,
} from "../../../services/api";
import { useUser } from "../../../context/UserContext";

const StarRating = ({ value, onChange, label }) => {
  return (
    <fieldset className="star-scale" aria-label={label}>
      {[1, 2, 3, 4, 5].map((num) => (
        <button
          key={num}
          type="button"
          className={Number(value) >= num ? "active" : ""}
          onClick={() => onChange(num)}
          aria-label={`${num} star${num > 1 ? "s" : ""}`}
        >
          ★
        </button>
      ))}
      <span>{value}/5</span>
    </fieldset>
  );
};

export default function BookDetails() {
  const { id } = useParams();
  const { user } = useUser();
  const [book, setBook] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [newReview, setNewReview] = useState("");
  const [rating, setRating] = useState(5);
  const [editingId, setEditingId] = useState(null);
  const [editingComment, setEditingComment] = useState("");
  const [editingRating, setEditingRating] = useState(5);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState("");

  const refreshBook = useCallback(() => fetchBookDetails(id).then(setBook), [id]);

  useEffect(() => {
    refreshBook().catch(() => setError("Failed to load book details."));
    fetchReviews(id).then(setReviews).catch(() => setError("Failed to load reviews."));
  }, [id, refreshBook]);

  const handleReviewSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setMessage("");

    if (!user) {
      setError("You must be logged in to post a review.");
      return;
    }

    try {
      const response = await submitReview({ bookId: id, comment: newReview, rating });
      setReviews([response.review, ...reviews]);
      setNewReview("");
      setRating(5);
      setMessage("Review posted.");
      refreshBook();
    } catch (err) {
      setError(err.message || "Failed to submit review.");
    }
  };

  const startEdit = (review) => {
    setEditingId(review.id);
    setEditingComment(review.comment);
    setEditingRating(Number(review.rating));
    setError(null);
    setMessage("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingComment("");
    setEditingRating(5);
  };

  const handleReviewUpdate = async (reviewId) => {
    setError(null);
    setMessage("");

    try {
      const response = await updateReview(reviewId, {
        comment: editingComment,
        rating: editingRating,
      });
      setReviews((currentReviews) =>
        currentReviews.map((review) => (review.id === reviewId ? response.review : review))
      );
      cancelEdit();
      setMessage("Review updated.");
      refreshBook();
    } catch (err) {
      setError(err.message || "Failed to update review.");
    }
  };

  const handleReviewDelete = async (reviewId) => {
    setError(null);
    setMessage("");

    try {
      await deleteReview(reviewId);
      setReviews((currentReviews) => currentReviews.filter((review) => review.id !== reviewId));
      setMessage("Review deleted.");
      refreshBook();
    } catch (err) {
      setError(err.message || "Failed to delete review.");
    }
  };

  if (!book) return error ? (
    <div className="book-detail p-6">
      <p className="error" role="alert">{error}</p>
      <Link href="/#collection">Back to the collection</Link>
    </div>
  ) : <p className="text-center" role="status">Loading book details...</p>;

  return (
    <div className="min-h-screen p-6 book-detail">
      <h1 className="text-3xl font-bold">{book.title}</h1>
      <p className="text-gray-600">by {book.author}</p>
      <p className="text-sm mt-2">★ {Number(book.rating).toFixed(1)}/5</p>
      {book.synopsis && (
        <section className="synopsis-detail" aria-labelledby="synopsis-title">
          <h2 id="synopsis-title">Synopsis</h2>
          <p>{book.synopsis}</p>
        </section>
      )}

      <h2 className="text-2xl mt-6">Reviews</h2>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      {reviews.length === 0 ? (
        <p>No reviews yet.</p>
      ) : (
        <ul className="mt-2">
          {reviews.map((review) => {
            const isOwner = user?.id === review.userId;
            const isEditing = editingId === review.id;

            return (
              <li key={review.id} className="border p-2 my-2 rounded">
                <p className="font-bold">{review.username}</p>
                {isEditing ? (
                  <div className="review-editor">
                    <textarea
                      className="w-full p-2 border rounded mt-2"
                      value={editingComment}
                      onChange={(event) => setEditingComment(event.target.value)}
                      required
                    />
                    <StarRating
                      value={editingRating}
                      onChange={setEditingRating}
                      label="Edit review rating"
                    />
                    <div className="review-actions">
                      <button type="button" className="primary" onClick={() => handleReviewUpdate(review.id)}>
                        Save review
                      </button>
                      <button type="button" className="chip" onClick={cancelEdit}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p>{review.comment}</p>
                    <p className="text-sm">★ {review.rating}/5</p>
                    {isOwner && (
                      <div className="review-actions">
                        <button type="button" className="chip" onClick={() => startEdit(review)}>
                          Edit
                        </button>
                        <button type="button" className="chip danger" onClick={() => handleReviewDelete(review.id)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {user ? (
        <form onSubmit={handleReviewSubmit} className="mt-4 p-4 border rounded">
          <h3 className="text-xl">Add a Review</h3>
          <textarea
            className="w-full p-2 border rounded mt-2"
            placeholder="Write your review..."
            value={newReview}
            onChange={(event) => setNewReview(event.target.value)}
            required
          />
          <StarRating value={rating} onChange={setRating} label="Review rating" />
          <button className="mt-2 w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700" type="submit">
            Submit Review
          </button>
        </form>
      ) : (
        <p className="login-note">Log in to post your review.</p>
      )}
    </div>
  );
}
