import { Image } from "expo-image";
import { useMemo } from "react";
import { Linking, StyleSheet, Text, View, type TextStyle } from "react-native";
import { textSizes, useAppearance } from "@/lib/appearance";
import { parseMarkdown, type Block, type Run, type Wiki } from "@/lib/markdown";
import { fonts, radius, space, useColors, type Palette } from "@/lib/theme";

// A note's text, read on the phone: serif body, the way the web reader sets it.
// `[[Links]]` are ember and open the note they name.

type Props = { markdown: string; onWiki: (wiki: Wiki) => void; selectable?: boolean };

export function MarkdownView({ markdown, onWiki, selectable = true }: Props) {
  const c = useColors();
  const { textSize } = useAppearance();
  const size = textSizes[textSize];
  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const body: TextStyle = { color: c.foreground, fontFamily: fonts.serif, fontSize: size.body, lineHeight: size.line };

  return (
    <View style={{ gap: space.md }}>
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} body={body} c={c} onWiki={onWiki} selectable={selectable} />
      ))}
    </View>
  );
}

function BlockView({ block, body, c, onWiki, selectable }: { block: Block; body: TextStyle; c: Palette; onWiki: (w: Wiki) => void; selectable: boolean }) {
  const inline = (runs: Run[], style?: TextStyle) => (
    <Text selectable={selectable} style={[body, style]}>
      <Runs runs={runs} c={c} onWiki={onWiki} />
    </Text>
  );
  const base = body.fontSize ?? 18;
  switch (block.kind) {
    case "heading": {
      const scale = [1.6, 1.35, 1.18, 1.05, 1, 1][block.level - 1];
      return inline(block.runs, { fontSize: base * scale, lineHeight: base * scale * 1.25, fontWeight: block.level >= 3 ? "600" : "400", marginTop: space.sm });
    }
    case "paragraph":
      return inline(block.runs);
    case "quote":
      return <View style={{ borderLeftWidth: 3, borderLeftColor: c.border, paddingLeft: space.md }}>{inline(block.runs, { fontStyle: "italic", color: c.mutedForeground })}</View>;
    case "callout":
      return (
        <View style={{ backgroundColor: c.emberSoft, borderRadius: radius.md, padding: space.md, gap: 4 }}>
          <Text style={{ color: c.emberInk, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 }}>{block.label}</Text>
          {inline(block.runs)}
        </View>
      );
    case "list": {
      const marker = block.style === "ordered" ? `${block.number}.` : block.style === "todo" ? (block.checked ? "☑" : "☐") : "•";
      return (
        <View style={{ flexDirection: "row", paddingLeft: (block.level - 1) * 22, marginTop: -space.sm + 2 }}>
          <Text style={[body, { width: 26, color: c.mutedForeground }]}>{marker}</Text>
          <View style={{ flex: 1 }}>{inline(block.runs, block.checked ? { textDecorationLine: "line-through", color: c.mutedForeground } : undefined)}</View>
        </View>
      );
    }
    case "rule":
      return <Text style={{ textAlign: "center", color: c.mutedForeground, letterSpacing: 8, marginVertical: space.sm }}>* * *</Text>;
    case "code":
      return (
        <View style={{ backgroundColor: c.muted, borderRadius: radius.sm, padding: space.md }}>
          <Text selectable={selectable} style={{ fontFamily: fonts.mono, fontSize: 13, color: c.foreground }}>
            {block.text}
          </Text>
        </View>
      );
    case "table":
      return (
        <View style={{ borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, borderRadius: radius.sm, overflow: "hidden" }}>
          {block.rows.map((row, r) => (
            <View key={r} style={{ flexDirection: "row", backgroundColor: r === 0 ? c.muted : "transparent", borderTopWidth: r ? StyleSheet.hairlineWidth : 0, borderColor: c.border }}>
              {row.map((cell, k) => (
                <View key={k} style={{ flex: 1, padding: space.sm, borderLeftWidth: k ? StyleSheet.hairlineWidth : 0, borderColor: c.border }}>
                  <Text selectable={selectable} style={{ color: c.foreground, fontSize: 14, fontWeight: r === 0 ? "600" : "400" }}>
                    <Runs runs={cell} c={c} onWiki={onWiki} />
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    case "image":
      return (
        <View style={{ gap: 4 }}>
          <Image source={{ uri: block.url }} accessibilityLabel={block.alt} contentFit="contain" style={{ width: "100%", aspectRatio: 4 / 3, borderRadius: radius.md, backgroundColor: c.muted }} />
          {!!block.alt && <Text style={{ color: c.mutedForeground, fontSize: 13, textAlign: "center" }}>{block.alt}</Text>}
        </View>
      );
    case "embed":
      return (
        <Text onPress={() => onWiki(block.wiki)} accessibilityRole="link" style={{ color: c.emberInk, fontSize: 15, padding: space.md, borderRadius: radius.md, backgroundColor: c.muted, overflow: "hidden" }}>
          ↳ {block.wiki.title}
        </Text>
      );
  }
}

function Runs({ runs, c, onWiki }: { runs: Run[]; c: Palette; onWiki: (w: Wiki) => void }) {
  return (
    <>
      {runs.map((run, i) => {
        const lines = [run.strike && "line-through", run.underline && "underline"].filter(Boolean).join(" ");
        const style: TextStyle = {
          ...(run.bold && { fontWeight: "700" }),
          ...(run.italic && { fontStyle: "italic" }),
          ...(lines && { textDecorationLine: lines as TextStyle["textDecorationLine"] }),
          ...(run.highlight && { backgroundColor: c.highlight }),
          ...(run.code && { fontFamily: fonts.mono, fontSize: 14, backgroundColor: c.muted }),
        };
        if (run.wiki) {
          const wiki = run.wiki;
          return (
            <Text key={i} accessibilityRole="link" onPress={() => onWiki(wiki)} style={[style, { color: c.emberInk }]}>
              {run.text}
            </Text>
          );
        }
        if (run.href) {
          const href = run.href;
          return (
            <Text key={i} accessibilityRole="link" onPress={() => void Linking.openURL(href).catch(() => {})} style={[style, { color: c.emberInk, textDecorationLine: "underline" }]}>
              {run.text}
            </Text>
          );
        }
        return (
          <Text key={i} style={style}>
            {run.text}
          </Text>
        );
      })}
    </>
  );
}
