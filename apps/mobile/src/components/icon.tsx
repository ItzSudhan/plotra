import { SymbolView, type SymbolViewProps } from "expo-symbols";

type Names = Extract<SymbolViewProps["name"], { ios?: unknown }>;
type SFSymbol = NonNullable<Names["ios"]>;
type AndroidSymbol = NonNullable<Names["android"]>;

// One set of names for the app's icons: SF Symbols on iOS, Material Symbols on Android.

const icons = {
  folder: ["folder", "folder"],
  book: ["book.closed", "menu_book"],
  scene: ["doc.text", "description"],
  note: ["note.text", "sticky_note_2"],
  person: ["person", "person"],
  place: ["mappin.and.ellipse", "place"],
  research: ["books.vertical", "science"],
  board: ["square.on.square", "dashboard"],
  timeline: ["calendar.day.timeline.left", "timeline"],
  globe: ["globe.europe.africa", "public"],
  dialogue: ["bubble.left.and.bubble.right", "forum"],
  home: ["books.vertical", "library_books"],
  search: ["magnifyingglass", "search"],
  bell: ["bell", "notifications"],
  account: ["person.crop.circle", "account_circle"],
  add: ["plus", "add"],
  edit: ["pencil", "edit"],
  more: ["ellipsis.circle", "more_horiz"],
  chevronRight: ["chevron.right", "chevron_right"],
  chevronDown: ["chevron.down", "expand_more"],
  trash: ["trash", "delete"],
  web: ["safari", "open_in_new"],
  check: ["checkmark", "check"],
  close: ["xmark", "close"],
  offline: ["icloud.slash", "cloud_off"],
  bold: ["bold", "format_bold"],
  italic: ["italic", "format_italic"],
  strike: ["strikethrough", "format_strikethrough"],
  highlight: ["highlighter", "ink_highlighter"],
  heading: ["textformat.size", "title"],
  bullet: ["list.bullet", "format_list_bulleted"],
  numbered: ["list.number", "format_list_numbered"],
  todo: ["checklist", "check_box"],
  quote: ["text.quote", "format_quote"],
  link: ["link", "link"],
  rule: ["minus", "horizontal_rule"],
  keyboardDown: ["keyboard.chevron.compact.down", "keyboard_hide"],
  capture: ["bolt", "bolt"],
  info: ["info.circle", "info"],
  sync: ["arrow.triangle.2.circlepath", "sync"],
  signOut: ["rectangle.portrait.and.arrow.right", "logout"],
  share: ["square.and.arrow.up", "share"],
  details: ["slider.horizontal.3", "tune"],
  history: ["clock.arrow.circlepath", "history"],
  expandAll: ["arrow.up.and.down.text.horizontal", "unfold_more"],
  collapseAll: ["arrow.down.and.line.horizontal.and.arrow.up", "unfold_less"],
  textSize: ["textformat.size", "text_fields"],
  undo: ["arrow.uturn.backward", "undo"],
  redo: ["arrow.uturn.forward", "redo"],
  people: ["person.2", "group"],
} as const satisfies Record<string, readonly [SFSymbol, AndroidSymbol]>;

export type IconName = keyof typeof icons;

type Props = { name: IconName; size?: number; color: string; weight?: SymbolViewProps["weight"] };

export function Icon({ name, size = 20, color, weight }: Props) {
  const [ios, android] = icons[name];
  return <SymbolView name={{ ios, android }} size={size} tintColor={color} weight={weight} />;
}

/** The SF Symbol for a native tab. */
export const sf = (name: IconName) => icons[name][0];
/** The Material Symbol for a native tab. */
export const md = (name: IconName) => icons[name][1];
