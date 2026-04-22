import useSWR from "swr";
import { authClient } from "../lib/auth-client";

type UserChallengeEntry = {
  id: number;
  challengeId: number;
  startedAt: string;
  completedAt: string | null;
};

type UserChallengesResponse = { challenges: UserChallengeEntry[] };

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useUserChallenges() {
  const { data: session } = authClient.useSession();
  const swrKey = session ? "/api/user/challenges" : null;
  const { data, error, isLoading, mutate } = useSWR<UserChallengesResponse>(
    swrKey,
    fetcher,
    { revalidateOnFocus: false }
  );
  const completedChallengeIds = new Set(
    (data?.challenges ?? []).filter((c) => c.completedAt !== null).map((c) => c.challengeId)
  );
  return { userChallenges: data?.challenges ?? [], completedChallengeIds, isLoading, error, mutate };
}
