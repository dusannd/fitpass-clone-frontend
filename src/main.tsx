import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'

// --- 1. THE QUERY CLIENT ---
// React Query's defaults are retry: 3 and staleTime: 0, and both hurt here.
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Retrying a 401 or a 403 cannot succeed — the answer will not change
            // on the second ask. Worse, an expired session fired four requests and
            // burned several seconds of backoff before the Axios interceptor was
            // allowed to redirect, and the user watched a spinner the whole time.
            // A 5xx or a dropped connection is genuinely worth another go.
            retry: (failureCount, error) => {
                const status = axios.isAxiosError(error) ? error.response?.status : undefined

                // No response at all = network failure, which is often transient.
                if (status === undefined) return failureCount < 2

                if (status >= 400 && status < 500) return false

                return failureCount < 2
            },
            // With staleTime 0 every remount refetches immediately, so navigating
            // away and back re-hit the API for data that was fresh a second ago.
            staleTime: 30_000,
        },
    },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {/* Provides React Query capabilities to the whole app */}
        <QueryClientProvider client={queryClient}>
            {/* Enables routing (URL navigation) without page reloads */}
            <BrowserRouter>
                {/*
                  Catches any render error below it and shows ErrorPage instead of
                  a blank white screen. It sits INSIDE BrowserRouter on purpose:
                  ErrorPage calls useNavigate() and useLocation(), so mounting the
                  boundary above the router would make the fallback throw too, and
                  the blank screen would come back.
                */}
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
            </BrowserRouter>
        </QueryClientProvider>
    </React.StrictMode>,
)
