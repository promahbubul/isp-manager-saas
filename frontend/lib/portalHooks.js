"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getErrorMessage } from "./api";
import { portalApi } from "./portalApi";

export function usePortal(slug, key, url, options = {}) {
  return useQuery({
    queryKey: ["portal", slug, ...(Array.isArray(key) ? key : [key])],
    queryFn: async () => (await portalApi(slug).get(url)).data,
    ...options,
  });
}

export function usePortalMutation(slug, fn, { invalidate = [], onSuccess } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars) => (await fn(portalApi(slug), vars)).data,
    onSuccess: (res, vars) => {
      if (res?.message) toast.success(res.message);
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: ["portal", slug, ...(Array.isArray(k) ? k : [k])] }));
      onSuccess?.(res, vars);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}
