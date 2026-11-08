import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams } from "expo-router";
import { Alert, ScrollView, Text, View } from "react-native";
import { Icon } from "@/components/icon";
import { Avatar } from "@/components/person";
import { Banner, Card, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { keys, useResource } from "@/lib/cache";
import { openWeb } from "@/lib/links";
import { useClient } from "@/lib/session";
import { absolute, getMembers, settingsKeys, workspaceRoleLabel, type WorkspaceRole } from "@/lib/settings-api";
import { space, useColors } from "@/lib/theme";

// A workspace's members, and for owners and admins the invitations still
// open (apps/app/components/settings/members-section.tsx). Inviting, changing
// roles and removing people need the web: Plotra's sign-in service checks
// those against a browser session, which the phone's token isn't.

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export default function MembersScreen() {
  const { workspace, name } = useLocalSearchParams<{ workspace: string; name?: string }>();
  const c = useColors();
  const client = useClient();
  const me = useResource(keys.me, client.me);
  const data = useResource(settingsKeys.members(workspace), () => getMembers(client, workspace));
  const myRole = (me.data?.workspaces.find((w) => w.slug === workspace)?.role ?? "member") as WorkspaceRole;
  const manager = myRole !== "member" || !!data.data?.invitations;
  const webSettings = `${client.server}/w/${encodeURIComponent(workspace)}/settings?tab=members`;
  const count = data.data?.members.length ?? 0;

  const copyInvite = (path: string) =>
    void Clipboard.setStringAsync(absolute(client.server, path)).then(
      () => Alert.alert("Invitation link copied", "It only works for the address it was sent to."),
      () => Alert.alert("Couldn't copy", "Try again, or resend the invitation on the web."),
    );

  return (
    <>
      <Stack.Screen options={{ title: name || "Members" }} />
      <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
        <Banner offline={data.offline} error={data.offline ? null : data.error} onRetry={data.refresh} />
        {!data.data ? (
          <Loading />
        ) : (
          <>
            <SectionLabel>
              {count} {count === 1 ? "person" : "people"} in this workspace
            </SectionLabel>
            <Card style={{ marginHorizontal: space.lg }}>
              {data.data.members.map((m, i) => (
                <View key={m.memberId}>
                  {i > 0 && <Separator inset={64} />}
                  <View accessible accessibilityLabel={`${m.name}, ${workspaceRoleLabel[m.role]}`} style={{ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56 }}>
                    <Avatar name={m.name} image={m.image} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16 }}>
                        {m.name}
                        {m.userId === me.data?.user.id && <Text style={{ color: c.mutedForeground }}> (you)</Text>}
                      </Text>
                      <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
                        {m.email}
                      </Text>
                    </View>
                    <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{workspaceRoleLabel[m.role]}</Text>
                  </View>
                </View>
              ))}
            </Card>

            {manager && data.data.invitations && data.data.invitations.length > 0 && (
              <>
                <SectionLabel>Invited</SectionLabel>
                <Card style={{ marginHorizontal: space.lg }}>
                  {data.data.invitations.map((inv, i) => (
                    <View key={inv.id}>
                      {i > 0 && <Separator inset={52} />}
                      <Row
                        icon="mail"
                        title={inv.email}
                        subtitle={`${workspaceRoleLabel[inv.role as WorkspaceRole] ?? inv.role} · invited${inv.inviterName ? ` by ${inv.inviterName}` : ""} · expires ${dateFormat.format(new Date(inv.expiresAt))}`}
                        accessibilityHint="Copies the invitation link"
                        onPress={() => copyInvite(inv.path)}
                        right={<Icon name="copy" size={16} color={c.mutedForeground} />}
                      />
                    </View>
                  ))}
                </Card>
              </>
            )}

            <SectionLabel>What each role can do</SectionLabel>
            <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
              <T style={{ fontSize: 14, lineHeight: 20 }}>
                <Text style={{ fontWeight: "600" }}>Members</Text> open, write in and comment on every project, and start new ones.
              </T>
              <T style={{ fontSize: 14, lineHeight: 20 }}>
                <Text style={{ fontWeight: "600" }}>Admins</Text> can also invite and remove people and change the workspace&apos;s settings.
              </T>
              <T style={{ fontSize: 14, lineHeight: 20 }}>
                <Text style={{ fontWeight: "600" }}>Owners</Text> can do all of that, and switch AI on, manage the plan, and delete the workspace.
              </T>
              <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                To let someone into one project only, or only to read or comment, share that project with them instead.
              </T>
            </View>

            <Card style={{ marginHorizontal: space.lg, marginTop: space.xl }}>
              <Row
                icon="web"
                title={manager ? "Invite people or change roles" : "Open the workspace on the web"}
                subtitle={manager ? "Inviting, resending, changing roles and removing people happen on the web" : "Only owners and admins can invite people or change roles"}
                onPress={() => void openWeb(webSettings)}
                right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />}
              />
            </Card>
          </>
        )}
      </ScrollView>
    </>
  );
}
