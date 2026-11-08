import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, type Client } from "./api";
import { clearFiles } from "./files";
import { unregisterPush } from "./push";
import { DEFAULT_SERVER, signInWithBrowser, type SignInMode } from "./sign-in";

// Who's signed in on this phone. The token lives in the keychain (iOS) or the
// keystore (Android); the server address beside it, for self-hosters.

const TOKEN = "plotra.token";
const SERVER = "plotra.server";
/** "pending" from signing in until the first-run welcome (app/onboarding.tsx) is finished. */
const ONBOARDED = "plotra.onboarded";

type Status = "loading" | "signedOut" | "signedIn";

type Value = {
  status: Status;
  server: string;
  client: Client | null;
  /** Stands in for `client` while screens close after signing out: its requests just fail. */
  signedOutClient: Client;
  /** Whether the first-run welcome has been through, on this phone, since signing in. */
  onboarded: boolean;
  finishOnboarding: () => void;
  /** Opens the browser to sign in, or to make an account. Resolves with a message to show, or null. */
  signIn: (server: string, mode?: SignInMode) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Context = createContext<Value | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [token, setToken] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const signingOut = useRef(false);

  useEffect(() => {
    (async () => {
      const [savedToken, savedServer] = await Promise.all([SecureStore.getItemAsync(TOKEN), SecureStore.getItemAsync(SERVER)]).catch(() => [null, null]);
      // The welcome comes back if the app was closed halfway through it.
      if (savedToken && (await AsyncStorage.getItem(ONBOARDED).catch(() => null)) === "pending") setOnboarded(false);
      if (savedServer) setServer(savedServer);
      if (savedToken) setToken(savedToken);
      setStatus(savedToken ? "signedIn" : "signedOut");
    })();
  }, []);

  const forget = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN).catch(() => {});
    // What was cached belongs to whoever was signed in.
    const keys = await AsyncStorage.getAllKeys().catch(() => [] as readonly string[]);
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith("cache:") || k.startsWith("draft:") || k.startsWith("plotra.asOf:") || k === "plotra.outbox" || k === "plotra.recent")).catch(() => {});
    clearFiles();
    setToken(null);
    setStatus("signedOut");
  }, []);

  const client = useMemo(() => (token ? createClient(server, token, () => void forget()) : null), [server, token, forget]);
  const signedOutClient = useMemo(() => createClient(server, "", () => {}), [server]);

  const signIn = useCallback(async (target: string, mode: SignInMode = "sign-in") => {
    const result = await signInWithBrowser(target, mode);
    if (!result.ok) return result.message;
    // A fresh sign-in gets the welcome: who they are, a workspace and a first project if they need them.
    await AsyncStorage.setItem(ONBOARDED, "pending").catch(() => {});
    setOnboarded(false);
    await SecureStore.setItemAsync(TOKEN, result.token);
    await SecureStore.setItemAsync(SERVER, target);
    signingOut.current = false;
    setServer(target);
    setToken(result.token);
    setStatus("signedIn");
    return null;
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut.current) return;
    signingOut.current = true;
    // Revoke the token on the server too; if that can't happen now, it expires on its own.
    // This phone stops getting notifications first, while the token still works.
    if (client) await unregisterPush(client);
    await client?.signOut().catch(() => {});
    await forget();
  }, [client, forget]);

  const finishOnboarding = useCallback(() => {
    void AsyncStorage.removeItem(ONBOARDED).catch(() => {});
    setOnboarded(true);
  }, []);

  return <Context.Provider value={{ status, server, client, signedOutClient, onboarded, finishOnboarding, signIn, signOut }}>{children}</Context.Provider>;
}

export function useSession(): Value {
  const value = useContext(Context);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}

/** The API client, on screens only reachable signed in. */
export function useClient(): Client {
  const { client, signedOutClient } = useSession();
  return client ?? signedOutClient;
}
