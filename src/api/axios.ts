// src/api/axios.ts
import axios from 'axios';
import { clearUserScopedStorage } from '../utils/storage';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

export const api = axios.create({
    baseURL: BASE_URL,
    // CRITICAL: This tells Axios to send the HttpOnly cookie with every request
    withCredentials: true,
});

// We can remove the request interceptor entirely!
// Instead, let's add a response interceptor to handle global 401 Unauthorized errors (session expired)
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response && error.response.status === 401) {
            // If the backend says the token is invalid/missing, push user to login.
            // The ?session=expired flag lets Login explain WHY they got kicked out,
            // instead of silently dropping them on an empty form.
            if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
                // The href assignment is a full reload, so the JS heap - React Query
                // cache included - is gone in a moment anyway. localStorage is the one
                // thing that survives it, and a QR token from a dead session must not.
                clearUserScopedStorage();
                window.location.href = '/login?session=expired';
            }
        }
        return Promise.reject(error);
    }
);