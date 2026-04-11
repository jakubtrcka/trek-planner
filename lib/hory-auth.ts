export function getStoredHoryCredentials() {
  const username =
    process.env.HORY_USERNAME?.trim() ||
    process.env.HORY_LOGIN?.trim() ||
    process.env.HORY_EMAIL?.trim() ||
    "";
  const password = process.env.HORY_PASSWORD || "";

  return {
    username,
    password,
    hasCredentials: Boolean(username && password)
  };
}

export function resolveHoryCredentials(username?: string, password?: string) {
  const providedUsername = username?.trim() || "";
  const providedPassword = password || "";

  if (providedUsername && providedPassword) {
    return {
      username: providedUsername,
      password: providedPassword,
      fromEnv: false,
      hasCredentials: true
    };
  }

  const stored = getStoredHoryCredentials();
  return {
    username: stored.username,
    password: stored.password,
    fromEnv: stored.hasCredentials,
    hasCredentials: stored.hasCredentials
  };
}
