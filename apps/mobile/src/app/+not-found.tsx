import { router } from "expo-router";
import { View } from "react-native";
import { Button, Empty } from "@/components/ui";
import { useColors } from "@/lib/theme";

export default function NotFound() {
  const c = useColors();
  return (
    <View style={{ flex: 1, backgroundColor: c.background, justifyContent: "center" }}>
      <Empty icon="info" title="This page isn't here" body="The link may be old, or the note was moved to the trash." action={<Button label="Go to your library" onPress={() => router.replace("/")} />} />
    </View>
  );
}
