import axios from 'axios';

// Pravimo "naš" axios koji uvek gađa tvoj FastAPI backend
export const api = axios.create({
    baseURL: 'http://localhost:8000/api', // Ovo je port tvog backenda
});

// Interceptor - presreće svaki zahtev PRE nego što ode na server
api.interceptors.request.use((config) => {
    // Tražimo token koji ćemo kasnije čuvati u browseru prilikom logina
    const token = localStorage.getItem('token');

    // Ako token postoji, zalepi ga u header
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
}, (error) => {
    return Promise.reject(error);
});