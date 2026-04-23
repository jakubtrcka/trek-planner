"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useIsAdmin(): boolean {
  const { data } = useSWR<{ isAdmin: boolean }>("/api/auth/is-admin", fetcher, {
    revalidateOnFocus: false,
  });
  return data?.isAdmin ?? false;
}
