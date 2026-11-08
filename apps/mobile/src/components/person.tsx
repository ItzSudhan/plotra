import { Image } from "expo-image";
import { Text, View } from "react-native";
import { useSession } from "@/lib/session";
import { useColors } from "@/lib/theme";

/** Someone's photo, or the first letter of their name, in a circle. */
export function Avatar({ name, image, size = 36 }: { name: string; image: string | null | undefined; size?: number }) {
  const c = useColors();
  const { server } = useSession();
  // Photos uploaded to Plotra come back as paths on the server.
  const uri = image ? (image.startsWith("/") ? server + image : image) : null;
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityIgnoresInvertColors />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.emberSoft, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: c.emberInk, fontSize: size * 0.4, fontWeight: "600" }}>{(name || "?").charAt(0).toUpperCase()}</Text>
    </View>
  );
}
