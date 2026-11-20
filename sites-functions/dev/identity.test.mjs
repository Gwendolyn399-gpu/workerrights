import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveOwnerId } from "../app/identity.ts";

const req = (session) => new Request("https://site.test/api/py/cases", {
  headers: session === undefined ? {} : { "x-session-id": session },
});
const loggedIn = (id) => () => ({ user_id: id });
const anonymous = () => {
  throw Object.assign(new Error("login_required"), { code: "login_required", status: 401 });
};
const invalidContext = () => {
  throw Object.assign(new Error("invalid_user_context"), { code: "invalid_user_context", status: 403 });
};

test("logged-in visitor uses the platform user_id and ignores the session header", () => {
  assert.equal(resolveOwnerId(req("b4cab7cc-d51c-49e3-8e96-5a0f43f64e91"), loggedIn("platform-user")), "platform-user");
});

test("platform id falls back to the id field when user_id is absent", () => {
  assert.equal(resolveOwnerId(req(), () => ({ id: "platform-id" })), "platform-id");
});

test("anonymous visitor with a valid UUID session gets a namespaced anon owner", () => {
  const session = "b4cab7cc-d51c-49e3-8e96-5a0f43f64e91";
  assert.equal(resolveOwnerId(req(session), anonymous), `anon:${session}`);
});

test("anonymous visitor with the wr- fallback session is accepted", () => {
  const session = "wr-1732000000000-ab12cd34ef";
  assert.equal(resolveOwnerId(req(session), anonymous), `anon:${session}`);
});

test("different anonymous sessions never share an owner", () => {
  const a = resolveOwnerId(req("aaaaaaaa-1111-2222-3333-444444444444"), anonymous);
  const b = resolveOwnerId(req("bbbbbbbb-1111-2222-3333-444444444444"), anonymous);
  assert.notEqual(a, b);
});

test("anon owner cannot collide with a raw platform user_id", () => {
  const session = "platform-user";
  assert.equal(resolveOwnerId(req(session), anonymous), "anon:platform-user");
  assert.notEqual(resolveOwnerId(req(session), anonymous), resolveOwnerId(req(), loggedIn("platform-user")));
});

for (const bad of ["short", "", "x".repeat(65), "has space", "bad/control", "ümlaut"]) {
  test(`anonymous visitor with invalid session ${JSON.stringify(bad)} is rejected`, () => {
    assert.throws(() => resolveOwnerId(req(bad), anonymous), (error) => error.code === "login_required" && error.status === 401);
  });
}

test("anonymous visitor without a session header is rejected", () => {
  assert.throws(() => resolveOwnerId(req(), anonymous), (error) => error.code === "login_required" && error.status === 401);
});

test("a present-but-invalid platform context rejects with 403 and does not fall back to anon", () => {
  assert.throws(
    () => resolveOwnerId(req("b4cab7cc-d51c-49e3-8e96-5a0f43f64e91"), invalidContext),
    (error) => error.code === "invalid_user_context" && error.status === 403,
  );
});