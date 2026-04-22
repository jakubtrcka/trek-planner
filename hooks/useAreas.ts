import useSWR from "swr";
import type { AreaRow } from "../lib/db/areas-repository";

type AreasResponse = { areas: AreaRow[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<AreasResponse>);

export function useAreas() {
  const { data, isLoading, error } = useSWR<AreasResponse>(
    "/api/areas",
    fetcher,
    { revalidateOnFocus: false }
  );

  return { areas: data?.areas ?? [], isLoading, error };
}
