import ErrorPage from "./ErrorPage";

interface ForbiddenProps {
    // Which roles the blocked route asks for, so we can name them in the message.
    requiredRoles?: string[];
}

export default function Forbidden({ requiredRoles = [] }: ForbiddenProps) {
    // 1. "admin" / "trainer, worker" - reads better than a raw array dump
    const rolesText = requiredRoles.join(" or ");

    const message = rolesText
        ? `This area is reserved for the ${rolesText} role. Your account does not have it, so there is nothing for you here.`
        : "Your account does not have permission to open this page.";

    return (
        <ErrorPage
            code="403"
            title="Access denied"
            message={message}
            accent="amber"
        />
    );
}
