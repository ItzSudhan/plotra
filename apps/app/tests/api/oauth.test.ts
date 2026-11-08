import { describe, expect, test } from "bun:test";
import {
  authorizationServerMetadata,
  clientCredentials,
  isAllowedRedirectUri,
  isChallenge,
  isOurResource,
  isVerifier,
  mcpChallenge,
  parseScope,
  protectedResourceMetadata,
  redirectHost,
  redirectWith,
  s256,
} from "@/lib/api/oauth";

// OAuth for the MCP server (lib/api/oauth.ts): what Claude's connectors and
// other MCP clients read and send to connect without a pasted token.

describe("discovery", () => {
  test("points the MCP endpoint at this server, and this server at its endpoints", () => {
    const resource = protectedResourceMetadata();
    const server = authorizationServerMetadata();
    expect(resource.resource).toBe(`${server.issuer}/api/mcp`);
    expect(resource.authorization_servers).toEqual([server.issuer]);
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
    expect(server.registration_endpoint).toBe(`${server.issuer}/api/oauth/register`);
    expect(server.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
  });

  test("a 401 says where the metadata is", () => {
    expect(mcpChallenge()).toContain('resource_metadata="');
    expect(mcpChallenge()).toContain("/.well-known/oauth-protected-resource/api/mcp");
    expect(mcpChallenge("invalid_token")).toContain('error="invalid_token"');
  });
});

describe("PKCE", () => {
  test("S256 matches RFC 7636's example", async () => {
    expect(await s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  test("verifiers and challenges have the right shape", () => {
    expect(isVerifier("a".repeat(43))).toBe(true);
    expect(isVerifier("a".repeat(42))).toBe(false);
    expect(isVerifier("a".repeat(129))).toBe(false);
    expect(isVerifier("a b".repeat(20))).toBe(false);
    expect(isChallenge("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")).toBe(true);
    expect(isChallenge("plain-verifier")).toBe(false);
  });
});

describe("redirect URIs", () => {
  test("https, loopback http and app schemes only", () => {
    expect(isAllowedRedirectUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isAllowedRedirectUri("http://localhost:33418/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://127.0.0.1:9000/cb")).toBe(true);
    expect(isAllowedRedirectUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isAllowedRedirectUri("http://evil.example/cb")).toBe(false);
    expect(isAllowedRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectUri("data:text/html,hi")).toBe(false);
    expect(isAllowedRedirectUri("https://claude.ai/cb#frag")).toBe(false);
    expect(isAllowedRedirectUri("not a url")).toBe(false);
    expect(isAllowedRedirectUri(42)).toBe(false);
  });

  test("the answer goes back with the state, and the host is what a person is shown", () => {
    const url = new URL(redirectWith("https://claude.ai/api/mcp/auth_callback?x=1", { code: "plo_abc", state: "s t", iss: "https://app.plotra.ink", error: undefined }));
    expect(url.searchParams.get("x")).toBe("1");
    expect(url.searchParams.get("code")).toBe("plo_abc");
    expect(url.searchParams.get("state")).toBe("s t");
    expect(url.searchParams.has("error")).toBe(false);
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectHost("http://localhost:33418/cb")).toBe("localhost:33418");
  });
});

describe("requests", () => {
  test("write only when asked for", () => {
    expect(parseScope("read write")).toBe("write");
    expect(parseScope("read")).toBe("read");
    expect(parseScope(undefined)).toBe("read");
    expect(parseScope("admin")).toBe("read");
  });

  test("a resource is ours, or left out", () => {
    const { issuer } = authorizationServerMetadata();
    expect(isOurResource(undefined)).toBe(true);
    expect(isOurResource(`${issuer}/api/mcp`)).toBe(true);
    expect(isOurResource(`${issuer}/api/mcp/`)).toBe(true);
    expect(isOurResource(issuer)).toBe(true);
    expect(isOurResource("https://elsewhere.example/api/mcp")).toBe(false);
  });

  test("client credentials come from a Basic header or the form", () => {
    const basic = `Basic ${Buffer.from("plc_a:pls_b").toString("base64")}`;
    expect(clientCredentials(basic, new URLSearchParams())).toEqual({ clientId: "plc_a", clientSecret: "pls_b" });
    expect(clientCredentials(null, new URLSearchParams("client_id=plc_c"))).toEqual({ clientId: "plc_c", clientSecret: null });
  });
});
