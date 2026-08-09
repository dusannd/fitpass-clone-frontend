import { Link } from "react-router-dom";
import ErrorPage from "./ErrorPage";

interface NotFoundProps {
    // Standalone = rendered outside of <Layout />, so it paints the full screen.
    standalone?: boolean;
}

export default function NotFound({ standalone = false }: NotFoundProps) {
    return (
        <ErrorPage
            code="404"
            title="Page not found"
            message="The page you are looking for does not exist, was moved, or you typed the address slightly wrong."
            standalone={standalone}
            showPath
        >
            {standalone && (
                <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
                    Not logged in?{" "}
                    <Link
                        to="/login"
                        className="font-bold text-blue-600 dark:text-blue-500 hover:underline"
                    >
                        Sign in here
                    </Link>
                </p>
            )}
        </ErrorPage>
    );
}
