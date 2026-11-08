import * as Crypto from "expo-crypto";
import * as Device from "expo-device";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { base64url, toBase64url } from "./encoding";

// Signing in through the browser (apps/app/lib/mobile-sign-in.ts). The app
// opens the server's /mobile/sign-in in a browser sheet, where the person signs
// in the way they do on the web (Google and password managers work there). The
// page hands back a one-time code on plotra://sign-in, which only this app can
// swap for a token, because only it holds the verifier behind the challenge.

export const DEFAULT_SERVER = "https://app.plotra.ink";
const RETURN_URL = "plotra://sign-in";

export type SignInResult = { ok: true; token: string } | { ok: false; message: string | null };

export async function signInWithBrowser(server: string): Promise<SignInResult> {
  const verifier = base64url(Crypto.getRandomBytes(32));
  const state = base64url(Crypto.getRandomBytes(32));
  const challenge = toBase64url(await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, { encoding: Crypto.CryptoEncoding.BASE64 }));

  const result = await WebBrowser.openAuthSessionAsync(`${server}/mobile/sign-in?${new URLSearchParams({ state, challenge })}`, RETURN_URL);
  if (result.type !== "success") return { ok: false, message: null };

  const { queryParams } = Linking.parse(result.url);
  const code = typeof queryParams?.code === "string" ? queryParams.code : null;
  if (!code || queryParams?.state !== state) return { ok: false, message: "That sign-in didn't come back right. Try again." };

  let response: Response;
  try {
    response = await fetch(`${server}/api/mobile/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, verifier, device: Device.deviceName ?? Device.modelName ?? "" }),
    });
  } catch {
    return { ok: false, message: "Couldn't reach Plotra. Check your connection and try again." };
  }
  const data = (await response.json().catch(() => null)) as { token?: string; error?: string } | null;
  if (!response.ok || !data?.token) return { ok: false, message: data?.error ?? "Couldn't sign in. Try again." };
  return { ok: true, token: data.token };
}
