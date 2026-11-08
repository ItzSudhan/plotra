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
  bookmark: ["bookmark", "bookmark"],
  restore: ["arrow.counterclockwise", "restore"],
  expandAll: ["arrow.up.and.down.text.horizontal", "unfold_more"],
  collapseAll: ["arrow.down.and.line.horizontal.and.arrow.up", "unfold_less"],
  textSize: ["textformat.size", "text_fields"],
  undo: ["arrow.uturn.backward", "undo"],
  redo: ["arrow.uturn.forward", "redo"],
  // The editor (src/app/project/[projectId]/edit)
  picture: ["photo", "image"],
  suggest: ["pencil.and.outline", "rate_review"],
  people: ["person.2", "group"],
  // Maps, boards and dialogues (src/app/project/[projectId]/maps, board, dialogue)
  graph: ["point.3.connected.trianglepath.dotted", "hub"],
  moveCards: ["arrow.up.and.down.and.arrow.left.and.right", "open_with"],
  fit: ["arrow.up.left.and.arrow.down.right", "fit_screen"],
  play: ["play.fill", "play_arrow"],
  restart: ["arrow.counterclockwise", "restart_alt"],
  familyTree: ["list.bullet.indent", "account_tree"],
  map: ["map", "map"],
  filter: ["line.3.horizontal.decrease.circle", "filter_list"],
  focus: ["scope", "filter_center_focus"],
  // Story views (src/app/project/[projectId]/views)
  corkboard: ["rectangle.grid.2x2", "view_module"],
  plotGrid: ["square.grid.3x3", "grid_on"],
  arrowUp: ["arrow.up", "arrow_upward"],
  arrowDown: ["arrow.down", "arrow_downward"],
  hidden: ["eye.slash", "visibility_off"],
  calendar: ["calendar", "calendar_month"],
  comment: ["bubble.left", "chat_bubble"],
  reply: ["arrowshape.turn.up.left", "reply"],
  resolve: ["checkmark.circle", "check_circle"],
  reopen: ["arrow.uturn.backward.circle", "restart_alt"],
  send: ["arrow.up.circle.fill", "send"],
  chat: ["text.bubble", "chat"],
  sparkles: ["sparkles", "auto_awesome"],
  sparkle: ["sparkle", "star_shine"],
  cloud: ["cloud", "cloud"],
  server: ["server.rack", "dns"],
  bellOn: ["bell.badge", "notifications_active"],
  stop: ["stop.circle.fill", "stop_circle"],
  plugin: ["puzzlepiece.extension", "extension"],
  eye: ["eye", "visibility"],
  verified: ["checkmark.seal", "verified"],
  // Export and import (src/app/project/[projectId]/export, src/app/import)
  archive: ["archivebox", "archive"],
  exportFile: ["square.and.arrow.up.on.square", "ios_share"],
  importFile: ["square.and.arrow.down", "download"],
  document: ["doc", "draft"],
  // The binder (src/app/project/[projectId]/index, trash, move)
  move: ["folder.badge.gearshape", "drive_file_move"],
  copy: ["doc.on.doc", "content_copy"],
  putBack: ["arrow.uturn.backward", "restore_from_trash"],
  reorder: ["arrow.up.arrow.down", "swap_vert"],
  indent: ["increase.indent", "format_indent_increase"],
  outdent: ["decrease.indent", "format_indent_decrease"],
  label: ["tag", "label"],
  // Sharing and settings (src/app/project/[projectId]/share, settings; src/app/settings)
  settings: ["gearshape", "settings"],
  mail: ["envelope", "mail"],
  lock: ["lock", "lock"],
  addPerson: ["person.badge.plus", "person_add"],
  newLink: ["arrow.triangle.2.circlepath", "autorenew"],
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
