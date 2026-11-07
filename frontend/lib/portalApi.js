import axios from "axios";
import { API_URL } from "./api";

/**
 * Customer portal client. The 7-day token is kept per ISP in localStorage, so a
 * customer stays logged in on their phone; it is a customer-only token that cannot
 * reach any staff API.
 */
const key = (slug) => `portal-token:${slug}`;

export const getPortalToken = (slug) => (typeof window === "undefined" ? null : localStorage.getItem(key(slug)));
export const setPortalToken = (slug, token) => (token ? localStorage.setItem(key(slug), token) : localStorage.removeItem(key(slug)));

export function portalApi(slug) {
  const client = axios.create({ baseURL: `${API_URL}/portal` });
  client.interceptors.request.use((c) => {
    const t = getPortalToken(slug);
    if (t) c.headers.Authorization = `Bearer ${t}`;
    return c;
  });
  client.interceptors.response.use(undefined, (error) => {
    // Expired or revoked: drop the token and go back to the login screen.
    if (error.response?.status === 401 && typeof window !== "undefined") {
      setPortalToken(slug, null);
      window.location.href = `/portal/${slug}`;
    }
    return Promise.reject(error);
  });
  return client;
}
