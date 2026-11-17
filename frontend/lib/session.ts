const SESSION_KEY = "workerrights_session_id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sessionId = window.localStorage.getItem(SESSION_KEY);
  if (!sessionId) {
    sessionId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `wr-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(SESSION_KEY, sessionId);
  }
  return sessionId;
}
