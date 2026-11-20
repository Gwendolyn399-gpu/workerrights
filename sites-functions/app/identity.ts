// Resolves the business owner for a request.
// Logged-in visitors use the platform-verified user_id. Anonymous public
// visitors have no login context; the product is account-less and isolates
// cases per browser, so fall back to the browser's unguessable X-Session-Id as
// a capability token, namespaced ("anon:") to never collide with a platform
// user_id. A present-but-invalid platform context still rejects (403); only an
// absent context (login_required) falls through to the anonymous path.
const SESSION_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function resolveOwnerId(
  request: Request,
  platformUser: () => { user_id?: string; id?: string },
): string {
  try {
    const user = platformUser();
    const id = user.user_id ?? user.id;
    if (id) return id;
  } catch (error) {
    if ((error as { code?: string })?.code !== "login_required") throw error;
  }
  const session = request.headers.get("x-session-id");
  if (session && SESSION_PATTERN.test(session)) return `anon:${session}`;
  throw Object.assign(new Error("login_required"), { code: "login_required", status: 401 });
}