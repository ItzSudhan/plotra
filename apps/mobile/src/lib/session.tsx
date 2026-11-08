import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createClient, type Client } from "./api";
import { clearFiles } from "./files";
import { unregisterPush } from "./push";
import { DEFAULT_SERVER, signInWithBrowser } from "./sign-in";

// Who's signed in on this phone. The token lives in the keychain (iOS) or the
// keystore (Android); the server address beside it, for self-hosters.

const TOKEN = "plotra.token";
const SERVER = "plotra.server";

type Status = "loading" | "signedOut" | "signedIn";

type Value = {
  status: Status;
  server: string;
  client: Client | null;
  /** Stands in for `client` while screens close after signing out: its requests just fail. */
  signedOutClient: Client;
  /** Opens the browser to sign in. Resolves with a message to show, or null. */
  signIn: (server: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const Context = createContext<Value | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [server, setServer] = useState(DEFAULT_SERVER);
  const [token, setToken] = useState<string | null>(null);
  const signingOut = useRef(false);

  useEffect(() => {
    (async () => {
      const [savedToken, savedServer] = await Promise.all([SecureStore.getItemAsync(TOKEN), SecureStore.getItemAsync(SERVER)]).catch(() => [null, null]);
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

  const signIn = useCallback(async (target: string) => {
    const result = await signInWithBrowser(target);
    if (!result.ok) return result.message;
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

  return <Context.Provider value={{ status, server, client, signedOutClient, signIn, signOut }}>{children}</Context.Provider>;
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
