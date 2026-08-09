import { Outlet, useOutletContext } from "react-router-dom";
import type { User } from "./Layout";
import Forbidden from "../pages/Forbidden";

interface RequireRoleProps {
    // The route is open to anyone holding at least one of these roles.
    allowed: string[];
}

/**
 * Role gate for a group of routes. Sits between <Layout /> and the pages, so the
 * sidebar stays visible while the blocked page is replaced by a 403.
 *
 * This is UX only - the backend still checks permissions on every request. It just
 * stops a member from opening /admin/hr and staring at a page full of failed calls.
 */
export default function RequireRole({ allowed }: RequireRoleProps) {
    // 1. Layout passes the logged-in user down through <Outlet context={user} />
    const user = useOutletContext<User>();

    const isAllowed = user.roles.some((r) => allowed.includes(r.name));

    if (!isAllowed) {
        return <Forbidden requiredRoles={allowed} />;
    }

    // 2. Keep passing the user down, otherwise the pages below lose their context
    return <Outlet context={user} />;
}
