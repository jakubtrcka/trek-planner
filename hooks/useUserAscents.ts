import useSWR from "swr";
import { authClient } from "../lib/auth-client";

type AscentsMapEntry = { count: number; dates: string[] };
type AscentsResponse = { ascentsMap: Record<string, AscentsMapEntry>; totalAscents: number };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useUserAscents() {
  const { data: session } = authClient.useSession();

  const swrKey = session ? "/api/user-ascents" : null;

  const { data, error, isLoading, mutate } = useSWR<AscentsResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false }
  );

  const ascentsMap = new Map<number, AscentsMapEntry>();
  for (const [key, val] of Object.entries(data?.ascentsMap ?? {})) {
    ascentsMap.set(parseInt(key, 10), val);
  }

  const climbedPeakIds = new Set<number>(ascentsMap.keys());

  return { climbedPeakIds, ascentsMap, totalAscents: data?.totalAscents ?? 0, isLoading, error, mutate };
}
