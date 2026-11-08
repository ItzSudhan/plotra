import { registerProviderType, type ProviderConstructorProps, type UnifiedProvider } from "@platejs/yjs";
import YProvider from "y-partyserver/provider";
import type { Seat } from "./shared";

// Plate's Yjs adapter for Plotra's collab server, as the web has it
// (apps/app/components/collab/party-provider.ts), except that the seat (token
// and server address) comes from the phone through `getSeat`.

/** The party every room lives in (apps/app/lib/collab/rooms.ts). */
const COLLAB_PARTY = "document";

/** Close codes after which a cached token mustn't be reused: expired, and access changed. */
const STALE_TOKEN = new Set([4001, 4003]);

export type PhoneProviderOptions = { room: string; url: string; getSeat: () => Promise<Seat | null> };

class PhonePartyProvider implements UnifiedProvider {
  readonly type = "partyserver";
  readonly provider: YProvider;
  private connected = false;
  private synced = false;
  private pending = false;
  private destroyed = false;
  private seat: Promise<Seat | null> | null = null;

  constructor({ awareness, doc, options, onConnect, onDisconnect, onError, onSyncChange }: ProviderConstructorProps<PhoneProviderOptions>) {
    if (!doc) throw new Error("The phone's provider needs a Y.Doc");
    const base = new URL(options.url);
    this.provider = new YProvider(base.host, options.room, doc, {
      party: COLLAB_PARTY,
      protocol: base.protocol === "https:" ? "wss" : "ws",
      connect: false,
      awareness,
      disableBc: true,
      params: async () => {
        this.seat ??= options.getSeat();
        const seat = await this.seat;
        if (!seat) {
          this.seat = null;
          throw new Error("No seat in this room.");
        }
        return { token: seat.token };
      },
    });
    this.provider.on("connection-close", (event: CloseEvent) => {
      if (STALE_TOKEN.has(event.code)) this.seat = null;
    });
    this.provider.on("status", ({ status }: { status: string }) => {
      const connected = status === "connected";
      if (connected === this.connected) return;
      this.connected = connected;
      if (connected) onConnect?.();
      else {
        // A token lasts ten minutes; a reconnect asks for a fresh one.
        this.seat = null;
        onDisconnect?.();
        this.setSynced(false, onSyncChange);
      }
    });
    this.provider.on("sync", (isSynced: boolean) => this.setSynced(isSynced, onSyncChange));
    this.provider.on("connection-error", () => onError?.(new Error("Couldn't reach the collaboration server.")));
  }

  private setSynced(value: boolean, onSyncChange?: (synced: boolean) => void) {
    if (value === this.synced) return;
    this.synced = value;
    onSyncChange?.(value);
  }

  get awareness() {
    return this.provider.awareness;
  }
  get document() {
    return this.provider.doc;
  }
  get isConnected() {
    return this.connected;
  }
  get isSynced() {
    return this.synced;
  }
  get isConnectionPending() {
    return !this.connected && (this.pending || this.provider.shouldConnect);
  }
  connect = () => {
    if (this.destroyed) return;
    this.pending = true;
    void this.provider
      .connect()
      .then(() => this.destroyed && this.provider.disconnect())
      .catch(() => {})
      .finally(() => (this.pending = false));
  };
  disconnect = () => {
    this.pending = false;
    this.provider.disconnect();
  };
  destroy = () => {
    this.destroyed = true;
    this.pending = false;
    this.provider.destroy();
  };
}

registerProviderType("partyserver", PhonePartyProvider);
