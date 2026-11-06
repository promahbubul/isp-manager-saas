"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { api, getErrorMessage } from "./api";

/** GET helper: useApi(["customers", params], "/customers", params) → { data, meta, ... } */
export function useApi(key, url, params, options = {}) {
  return useQuery({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: async () => (await api.get(url, { params })).data,
    ...options,
  });
}

/**
 * Mutation helper that toasts the API message and invalidates query keys.
 *   const m = useApiMutation((body) => api.post("/zones", body), { invalidate: ["zones"] })
 */
export function useApiMutation(fn, { invalidate = [], onSuccess, successToast = true, errorToast = true } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars) => (await fn(vars)).data,
    onSuccess: (res, vars) => {
      if (successToast && res?.message) {
        // API reports router sync problems inside a success response
        if (/sync failed/i.test(res.message)) toast.error(res.message, { duration: 6000 });
        else toast.success(res.message);
      }
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] }));
      onSuccess?.(res, vars);
    },
    onError: (err) => {
      if (errorToast) toast.error(getErrorMessage(err));
    },
  });
}
