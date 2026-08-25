import { Component, type ErrorInfo, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import ErrorPage from "../pages/ErrorPage";

interface ErrorBoundaryInnerProps {
    children: ReactNode;
    // Changes on every navigation. Without it the fallback would stay on screen
    // forever: the two buttons ErrorPage renders change the URL, but a boundary
    // holding hasError keeps rendering the fallback over whatever comes next.
    resetKey: string;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

// --- 1. THE BOUNDARY ITSELF ---
// Error boundaries have no hook equivalent, so this half has to stay a class.
class ErrorBoundaryInner extends Component<ErrorBoundaryInnerProps, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        // The console is the only place this is recorded. If an error reporting
        // service is ever added, this is the one line it hooks into.
        console.error("Uncaught render error:", error, info.componentStack);
    }

    componentDidUpdate(prevProps: ErrorBoundaryInnerProps) {
        // The user navigated away from the screen that threw. Give the tree
        // another chance instead of pinning them to the error page.
        if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
            this.setState({ hasError: false });
        }
    }

    render() {
        if (!this.state.hasError) return this.props.children;

        return (
            <ErrorPage
                code="500"
                title="Something went wrong"
                message="The page hit an unexpected error and could not finish loading. Reloading usually clears it — if it keeps happening, the details are in the browser console."
                accent="rose"
                standalone
            >
                <p className="mt-6">
                    <button
                        onClick={() => window.location.reload()}
                        className="text-xs font-bold text-blue-600 dark:text-blue-500 hover:underline"
                    >
                        Reload the page
                    </button>
                </p>
            </ErrorPage>
        );
    }
}

// --- 2. THE ROUTER BRIDGE ---
// ErrorPage calls useNavigate() and useLocation(), so the fallback only works
// INSIDE the router. That is also why this wrapper exists at all: it reads the
// location with a hook and feeds it to the class as a plain prop.
export default function ErrorBoundary({ children }: { children: ReactNode }) {
    const location = useLocation();

    return <ErrorBoundaryInner resetKey={location.key}>{children}</ErrorBoundaryInner>;
}
