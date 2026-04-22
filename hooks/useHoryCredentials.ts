"use client";

// Exception: 30-line hook limit extended — returns 6 values (useEffect + async save
// + field setter), justified by tight credential fetch/save/validate co-location.
// Splitting would require threading setters across multiple hooks. Documented in RELEASE_NOTES v26b.

import { useState, useEffect } from "react";
import { z } from "zod";

const HoryCredentialsSchema = z.object({
  horyUsername: z.string().min(1, "Uživatelské jméno je povinné."),
  horyPassword: z.string().min(1, "Heslo je povinné."),
});

export type HoryCredentials = z.infer<typeof HoryCredentialsSchema>;
export type CredentialStatus = "idle" | "saving" | "saved" | "error";

type SettingsApiResponse = { horyUsername: string | null; horyPassword: string | null };

export function useHoryCredentials(isLoggedIn: boolean) {
  const [credentials, setCredentials] = useState<HoryCredentials>({ horyUsername: "", horyPassword: "" });
  const [hasStoredCredentials, setHasStoredCredentials] = useState(false);
  const [status, setStatus] = useState<CredentialStatus>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    fetch("/api/user/settings?moduleSlug=mountains")
      .then((r) => r.json() as Promise<SettingsApiResponse>)
      .then((data) => {
        setHasStoredCredentials(Boolean(data.horyUsername && data.horyPassword));
        setCredentials({ horyUsername: data.horyUsername ?? "", horyPassword: data.horyPassword ?? "" });
      })
      .catch(() => { /* non-critical: form stays empty */ });
  }, [isLoggedIn]);

  async function saveCredentials(): Promise<void> {
    setValidationError(null);
    const result = HoryCredentialsSchema.safeParse(credentials);
    if (!result.success) { setValidationError(result.error.issues[0].message); return; }
    setStatus("saving");
    try {
      const res = await fetch("/api/user/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleSlug: "mountains", ...result.data }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setStatus("saved");
      setHasStoredCredentials(true);
      setTimeout(() => setStatus("idle"), 2500);
    } catch { setStatus("error"); }
  }

  function setField(key: keyof HoryCredentials) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      setCredentials((prev) => ({ ...prev, [key]: e.target.value }));
      setStatus("idle");
      setValidationError(null);
    };
  }

  return { credentials, hasStoredCredentials, status, validationError, saveCredentials, setField };
}
