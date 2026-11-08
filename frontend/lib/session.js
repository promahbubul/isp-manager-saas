/**
 * The API sets "rt_on=1" / "prt_on=1" next to its httpOnly refresh cookies.
 * They carry no secret — they only say "a session exists", so public pages can skip
 * the refresh call (and its 401) for visitors who are not logged in.
 */
export const hasCookie = (name) => typeof document !== "undefined" && document.cookie.split(/;\s*/).some((c) => c.startsWith(`${name}=`));

export const hasTenantSession = () => hasCookie("rt_on");
export const hasAdminSession = () => hasCookie("prt_on");
