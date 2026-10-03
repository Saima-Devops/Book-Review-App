import axios from "axios";

// The public base URL has no /api suffix.
const API_URL = `${(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001").replace(/\/$/, "")}/api`;

// General function to handle errors
const handleApiError = (error, defaultMessage) => {
  return error.response?.data?.message || defaultMessage;
};

// ---------------------- User Authentication ----------------------

export const registerUser = async (userData) => {
  try {
    const response = await axios.post(`${API_URL}/users/register`, userData);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Registration failed"));
  }
};

export const loginUser = async (userData) => {
  try {
    const response = await axios.post(`${API_URL}/users/login`, userData);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Login failed"));
  }
};

// ---------------------- Books ----------------------
export const requestPasswordReset = async (email) => {
  try {
    return (await axios.post(`${API_URL}/users/forgot-password`, { email })).data;
  } catch (error) {
    throw new Error(handleApiError(error, "Unable to request password reset"));
  }
};

export const resetPassword = async (token, password) => {
  try {
    return (await axios.post(`${API_URL}/users/reset-password`, { token, password })).data;
  } catch (error) {
    throw new Error(handleApiError(error, "Unable to reset password"));
  }
};

export const fetchBooks = async () => {
  try {
    const response = await axios.get(`${API_URL}/books`);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to fetch books"));
  }
};

export const fetchBookDetails = async (bookId) => {
  try {
    const response = await axios.get(`${API_URL}/books/${bookId}`);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to fetch book details"));
  }
};

export const addBook = async (bookData) => {
  try {
    const response = await axios.post(`${API_URL}/books`, bookData);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to add book"));
  }
};

export const deleteBook = async (bookId) => {
  try {
    const response = await axios.delete(`${API_URL}/books/${bookId}`);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to delete book"));
  }
};

// ---------------------- Reviews ----------------------

export const fetchReviews = async (bookId) => {
  try {
    const response = await axios.get(`${API_URL}/reviews/${bookId}`);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to fetch reviews"));
  }
};

export const submitReview = async (reviewData, token) => {
  try {
    const response = await axios.post(`${API_URL}/reviews`, reviewData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to submit review"));
  }
};

export const updateReview = async (reviewId, reviewData) => {
  try {
    const response = await axios.put(`${API_URL}/reviews/${reviewId}`, reviewData);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to update review"));
  }
};

export const deleteReview = async (reviewId) => {
  try {
    const response = await axios.delete(`${API_URL}/reviews/${reviewId}`);
    return response.data;
  } catch (error) {
    throw new Error(handleApiError(error, "Failed to delete review"));
  }
};

// ---------------------- Authentication Token ----------------------

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem("token", token);
  } else {
    localStorage.removeItem("token");
  }
};

// Attach token to Axios requests dynamically
axios.interceptors.request.use((config) => {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
