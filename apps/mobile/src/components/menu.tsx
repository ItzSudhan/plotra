import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { ActionSheetIOS, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { radius, space, useColors } from "@/lib/theme";
import { Icon, type IconName } from "./icon";

// A list of actions from the bottom of the screen: the system's action sheet
// on iOS, a sheet of our own on Android (its alerts only take three buttons).

export type MenuItem = { label: string; icon?: IconName; destructive?: boolean; onPress: () => void };
type Menu = { title?: string; message?: string; items: MenuItem[] };

const Context = createContext<(menu: Menu) => void>(() => {});

export function MenuProvider({ children }: { children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [menu, setMenu] = useState<Menu | null>(null);

  const show = useCallback((next: Menu) => {
    if (Platform.OS === "ios") {
      const labels = [...next.items.map((i) => i.label), "Cancel"];
      const destructive = next.items.map((item, n) => (item.destructive ? n : -1)).filter((n) => n >= 0);
      ActionSheetIOS.showActionSheetWithOptions(
        { title: next.title, message: next.message, options: labels, cancelButtonIndex: labels.length - 1, destructiveButtonIndex: destructive },
        (index) => next.items[index]?.onPress(),
      );
    } else setMenu(next);
  }, []);

  const pick = (item: MenuItem) => {
    setMenu(null);
    // Let the sheet close before whatever comes next opens.
    setTimeout(item.onPress, 150);
  };

  return (
    <Context.Provider value={show}>
      {children}
      <Modal visible={!!menu} transparent animationType="slide" onRequestClose={() => setMenu(null)} statusBarTranslucent navigationBarTranslucent>
        <Pressable accessibilityLabel="Close" onPress={() => setMenu(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
        <View style={{ backgroundColor: c.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: insets.bottom + space.sm, paddingTop: space.sm }}>
          {(menu?.title || menu?.message) && (
            <View style={{ paddingHorizontal: space.xl, paddingVertical: space.md, gap: 2 }}>
              {!!menu?.title && <Text style={{ color: c.foreground, fontSize: 16, fontWeight: "600" }}>{menu.title}</Text>}
              {!!menu?.message && <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{menu.message}</Text>}
            </View>
          )}
          {menu?.items.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              onPress={() => pick(item)}
              style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.lg, paddingHorizontal: space.xl, height: 52, backgroundColor: pressed ? c.accent : "transparent" })}
            >
              {item.icon && <Icon name={item.icon} size={20} color={item.destructive ? c.destructive : c.mutedForeground} />}
              <Text style={{ color: item.destructive ? c.destructive : c.foreground, fontSize: 16 }}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </Context.Provider>
  );
}

export const useMenu = () => useContext(Context);
