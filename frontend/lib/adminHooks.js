"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { adminApi } from "./adminApi";
import { getErrorMessage } from "./api";

export function useAdminApi(key, url, params, options = {}) {
  return useQuery({
    queryKey: ["admin", ...(Array.isArray(key) ? key : [key])],
    queryFn: async () => (await adminApi.get(url, { params })).data,
    ...options,
  });
}

export function useAdminMutation(fn, { invalidate = [], onSuccess } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars) => (await fn(vars)).data,
    onSuccess: (res, vars) => {
      if (res?.message) toast.success(res.message);
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: ["admin", ...(Array.isArray(k) ? k : [k])] }));
      onSuccess?.(res, vars);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });
}
