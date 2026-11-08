import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

// Light, dark or the phone's setting (Account → Appearance), and the reading
// size for notes. Kept on the phone.

export type Appearance = "system" | "light" | "dark";
export type TextSize = "small" | "medium" | "large";

type Value = { appearance: Appearance; textSize: TextSize; setAppearance: (a: Appearance) => void; setTextSize: (s: TextSize) => void };

const KEY = "plotra.appearance";
const Context = createContext<Value>({ appearance: "system", textSize: "medium", setAppearance: () => {}, setTextSize: () => {} });

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ appearance: Appearance; textSize: TextSize }>({ appearance: "system", textSize: "medium" });
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((raw) => raw && setState((s) => ({ ...s, ...(JSON.parse(raw) as Partial<typeof s>) })))
      .catch(() => {});
  }, []);
  const update = (patch: Partial<typeof state>) =>
    setState((s) => {
      const next = { ...s, ...patch };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  return (
    <Context.Provider value={{ ...state, setAppearance: (appearance) => update({ appearance }), setTextSize: (textSize) => update({ textSize }) }}>
      {children}
    </Context.Provider>
  );
}

export const useAppearance = () => useContext(Context);

/** Reading text sizes: body and line height. */
export const textSizes: Record<TextSize, { body: number; line: number }> = {
  small: { body: 16, line: 25 },
  medium: { body: 18, line: 29 },
  large: { body: 21, line: 33 },
};
