import axios from "axios";

export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

/**
 * Access token lives in memory only (never localStorage).
 * The refresh token is an httpOnly cookie set by the API, so after a page
 * reload we call /auth/refresh-token to get a new access token.
 */
let accessToken = null;
let onAuthFailure = null;

export const setAccessToken = (token) => {
  accessToken = token;
};
export const setAuthFailureHandler = (fn) => {
  onAuthFailure = fn;
};

export const api = axios.create({ baseURL: API_URL, withCredentials: true });

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

let refreshPromise = null;

/** Single-flight refresh: concurrent 401s share one refresh request. */
export function refreshAccessToken() {
  refreshPromise ??= axios
    .post(`${API_URL}/auth/refresh-token`, null, { withCredentials: true })
    .then((res) => {
      setAccessToken(res.data.data.accessToken);
      return accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const NO_RETRY = ["/auth/login", "/auth/signup", "/auth/refresh-token"];

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    const shouldRetry =
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !NO_RETRY.some((p) => original.url?.includes(p));

    if (!shouldRetry) return Promise.reject(error);

    original._retry = true;
    try {
      await refreshAccessToken();
      return api(original);
    } catch {
      setAccessToken(null);
      onAuthFailure?.();
      return Promise.reject(error);
    }
  },
);

export function getErrorMessage(error) {
  return error?.response?.data?.message || error?.message || "Something went wrong";
}

/** Map API validation errors ({path, message}[]) onto react-hook-form fields. */
export function applyFieldErrors(error, setError) {
  const errors = error?.response?.data?.errors;
  if (!Array.isArray(errors)) return false;
  errors.forEach(({ path, message }) => path && setError(path, { message }));
  return errors.length > 0;
}

/** Download an authenticated file (Excel export) and save it with the server's filename. */
export async function downloadFile(url, params, fallbackName = "download.xlsx") {
  const res = await api.get(url, { params, responseType: "blob" });
  const disposition = res.headers["content-disposition"] ?? "";
  const name = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}
