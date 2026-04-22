import useSWR from "swr";
import { authClient } from "../lib/auth-client";

type VisitEntry = { locationId: string; count: number; visitedAt: string };
type VisitsResponse = { visits: VisitEntry[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useUserVisits() {
  const { data: session } = authClient.useSession();

  const swrKey = session ? "/api/user-visits" : null;

  const { data, isLoading, mutate } = useSWR<VisitsResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false }
  );

  const visits = new Map<string, VisitEntry>();
  for (const entry of data?.visits ?? []) {
    visits.set(entry.locationId, entry);
  }

  return { visits, isLoading, mutate };
}
