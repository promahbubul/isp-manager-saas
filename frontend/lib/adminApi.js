import axios from "axios";
import { API_URL } from "./api";

/**
 * Separate client for the super admin panel: its own in-memory token and
 * refresh cookie (prt), so an ISP session and an admin session never mix.
 */
let token = null;
let onFailure = null;
export const setAdminToken = (t) => {
  token = t;
};
export const setAdminFailureHandler = (fn) => {
  onFailure = fn;
};

export const adminApi = axios.create({ baseURL: API_URL, withCredentials: true });
adminApi.interceptors.request.use((c) => {
  if (token) c.headers.Authorization = `Bearer ${token}`;
  return c;
});

let refreshing = null;
export function refreshAdminToken() {
  refreshing ??= axios
    .post(`${API_URL}/auth/admin/refresh-token`, null, { withCredentials: true })
    .then((r) => {
      token = r.data.data.accessToken;
      return token;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

adminApi.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retry && !original.url?.includes("/auth/admin/")) {
      original._retry = true;
      try {
        await refreshAdminToken();
        return adminApi(original);
      } catch {
        token = null;
        onFailure?.();
      }
    }
    return Promise.reject(error);
  },
);
