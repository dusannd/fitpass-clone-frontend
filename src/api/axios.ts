// src/api/axios.ts
import axios from 'axios';

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
            // If the backend says the token is invalid/missing, push user to login
            if (window.location.pathname !== '/login' && window.location.pathname !== '/register') {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);