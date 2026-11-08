import * as Clipboard from "expo-clipboard";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Icon } from "@/components/icon";
import { useMenu } from "@/components/menu";
import { Avatar } from "@/components/person";
import { Banner, Button, Card, Chip, Loading, Row, SectionLabel, Separator, T } from "@/components/ui";
import { isOffline } from "@/lib/api";
import { invalidate, keys, useResource } from "@/lib/cache";
import { openWeb } from "@/lib/links";
import { useClient } from "@/lib/session";
import {
  absolute,
  cancelInvitation,
  changeMemberRole,
  getMembers,
  inviteMember,
  leaveWorkspace,
  removeMember,
  settingsKeys,
  workspaceRoleLabel,
  type Invitation,
  type Member,
  type WorkspaceRole,
} from "@/lib/settings-api";
import { radius, space, useColors } from "@/lib/theme";

// A workspace's members, as the web's Settings → Members has them
// (apps/app/components/settings/members-section.tsx): who's in it, and for
// owners and admins, inviting people, the invitations still open, changing
// roles and removing people. Anyone can leave. The server runs the web's own
// functions, so its rules hold: only an owner makes an owner, nobody removes
// themselves, a workspace keeps an owner, and a plan's member limit counts
// open invitations.

const dateFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

export default function MembersScreen() {
  const { workspace, name } = useLocalSearchParams<{ workspace: string; name?: string }>();
  const c = useColors();
  const client = useClient();
  const showMenu = useMenu();
  const me = useResource(keys.me, client.me);
  const data = useResource(settingsKeys.members(workspace), () => getMembers(client, workspace));
  const myRole = (me.data?.workspaces.find((w) => w.slug === workspace)?.role ?? "member") as WorkspaceRole;
  const manager = myRole !== "member";
  const count = data.data?.members.length ?? 0;
  const owners = data.data?.members.filter((m) => m.role === "owner").length ?? 0;

  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
  const [busy, setBusy] = useState(false);

  /** Runs a change, then shows the list as it is now; errors say what the server said. */
  const change = async (what: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try {
      await what();
      await data.refresh();
      if (done) Alert.alert(done);
      return true;
    } catch (e) {
      Alert.alert("That didn't work", isOffline(e) ? "You're offline. Try again when you're back online." : (e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const invite = async () => {
    const address = email.trim();
    if (!address) return;
    const ok = await change(() => inviteMember(client, workspace, address, inviteRole), `Invitation sent to ${address}`);
    if (ok) setEmail("");
  };

  const memberMenu = (m: Member) => {
    const isMe = m.userId === me.data?.user.id;
    if (!manager || isMe) return;
    const roles: WorkspaceRole[] = myRole === "owner" ? ["member", "admin", "owner"] : ["member", "admin"];
    showMenu({
      title: m.name,
      message: `${workspaceRoleLabel[m.role]} · ${m.email}`,
      items: [
        ...roles
          .filter((r) => r !== m.role)
          .map((r) => ({
            label: r === "owner" ? "Make an owner" : r === "admin" ? "Make an admin" : "Make a member",
            icon: "person" as const,
            onPress: () => void change(() => changeMemberRole(client, workspace, m.memberId, r)),
          })),
        {
          label: "Remove from the workspace",
          icon: "trash" as const,
          destructive: true,
          onPress: () =>
            Alert.alert(`Remove ${m.name}?`, "They lose every project in this workspace, including ones shared with them one by one. Their writing stays.", [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => void change(() => removeMember(client, workspace, m.memberId)) },
            ]),
        },
      ],
    });
  };

  const invitationMenu = (inv: Invitation) =>
    showMenu({
      title: inv.email,
      message: `Invited as ${workspaceRoleLabel[inv.role as WorkspaceRole] ?? inv.role}`,
      items: [
        {
          label: "Copy the invitation link",
          icon: "copy",
          onPress: () =>
            void Clipboard.setStringAsync(absolute(client.server, inv.path)).then(
              () => Alert.alert("Invitation link copied", "It only works for the address it was sent to."),
              () => Alert.alert("Couldn't copy", "Try again."),
            ),
        },
        { label: "Send it again", icon: "mail", onPress: () => void change(() => inviteMember(client, workspace, inv.email, inv.role === "admin" ? "admin" : "member"), "Invitation sent again") },
        {
          label: "Cancel the invitation",
          icon: "close",
          destructive: true,
          onPress: () => void change(() => cancelInvitation(client, workspace, inv.id)),
        },
      ],
    });

  const leave = () =>
    Alert.alert(`Leave ${name || "this workspace"}?`, "You lose its projects, including ones shared with you one by one. Someone has to invite you again to come back.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: () =>
          void change(async () => {
            await leaveWorkspace(client, workspace);
            invalidate(keys.me);
            invalidate(keys.projects);
            router.back();
          }),
      },
    ]);

  return (
    <>
      <Stack.Screen options={{ title: name || "Members" }} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.background }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: space.xxl * 2 }}>
          <Banner offline={data.offline} error={data.offline ? null : data.error} onRetry={data.refresh} />
          {!data.data ? (
            <Loading />
          ) : (
            <>
              {manager && (
                <>
                  <SectionLabel>Invite someone</SectionLabel>
                  <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
                    <TextInput
                      value={email}
                      onChangeText={setEmail}
                      placeholder="their@email.com"
                      placeholderTextColor={c.mutedForeground}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      textContentType="emailAddress"
                      returnKeyType="send"
                      onSubmitEditing={() => void invite()}
                      accessibilityLabel="Email address to invite"
                      style={{ height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, color: c.foreground, paddingHorizontal: space.md, fontSize: 16 }}
                    />
                    <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel="Invite as">
                      <Chip label="As a member" selected={inviteRole === "member"} onPress={() => setInviteRole("member")} />
                      <Chip label="As an admin" selected={inviteRole === "admin"} onPress={() => setInviteRole("admin")} />
                    </View>
                    <Button label="Send invitation" icon="mail" busy={busy} disabled={!email.trim()} onPress={() => void invite()} />
                    <T tone="muted" style={{ fontSize: 13, lineHeight: 18 }}>
                      Members can open and edit every project here. To let someone into one project only, share that project with them instead.
                    </T>
                  </View>
                </>
              )}

              <SectionLabel>
                {count} {count === 1 ? "person" : "people"} in this workspace
              </SectionLabel>
              <Card style={{ marginHorizontal: space.lg }}>
                {data.data.members.map((m, i) => {
                  const isMe = m.userId === me.data?.user.id;
                  const canChange = manager && !isMe;
                  return (
                    <View key={m.memberId}>
                      {i > 0 && <Separator inset={64} />}
                      <Pressable
                        accessibilityRole={canChange ? "button" : undefined}
                        accessibilityLabel={`${m.name}${isMe ? " (you)" : ""}, ${workspaceRoleLabel[m.role]}`}
                        accessibilityHint={canChange ? "Change their role or remove them" : undefined}
                        disabled={!canChange || busy}
                        onPress={() => memberMenu(m)}
                        style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.sm, minHeight: 56, backgroundColor: pressed ? c.accent : "transparent" })}
                      >
                        <Avatar name={m.name} image={m.image} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16 }}>
                            {m.name}
                            {isMe && <Text style={{ color: c.mutedForeground }}> (you)</Text>}
                          </Text>
                          <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, marginTop: 2 }}>
                            {m.email}
                          </Text>
                        </View>
                        <Text style={{ color: c.mutedForeground, fontSize: 14 }}>{workspaceRoleLabel[m.role]}</Text>
                        {canChange && <Icon name="chevronDown" size={11} color={c.mutedForeground} />}
                      </Pressable>
                    </View>
                  );
                })}
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
                          accessibilityHint="Copy the link, send it again or cancel it"
                          onPress={() => invitationMenu(inv)}
                          right={<Icon name="more" size={18} color={c.mutedForeground} />}
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
              </View>

              <Card style={{ marginHorizontal: space.lg, marginTop: space.xl }}>
                <Row icon="web" title="Workspace settings on the web" subtitle="Its name and address, AI, the plan and billing" onPress={() => void openWeb(`${client.server}/w/${encodeURIComponent(workspace)}/settings`)} right={<Icon name="chevronRight" size={14} color={c.mutedForeground} />} />
                {!(myRole === "owner" && owners <= 1) && (
                  <>
                    <Separator inset={52} />
                    <Row icon="signOut" iconColor={c.destructive} title="Leave this workspace" onPress={leave} />
                  </>
                )}
              </Card>
              {myRole === "owner" && owners <= 1 && (
                <T tone="muted" style={{ marginHorizontal: space.lg, marginTop: space.sm, fontSize: 13, lineHeight: 18 }}>
                  You&apos;re its only owner. To leave, make someone else an owner first.
                </T>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
