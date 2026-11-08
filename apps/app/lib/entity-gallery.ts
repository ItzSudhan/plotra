import type { EntityField } from "@plotra/db/schema";
import type { EntityTypeTemplate } from "./world";

// Ready-made entry types (beat-the-competitors.md step 4): what World Anvil's
// article templates and Campfire's modules give a worldbuilder, as types a
// project can add in one click from "New type" (components/world/entity-type-dialog.tsx).
// Each fills in the form, so the name, look and fields can be changed before
// it's saved. Characters and places are binder kinds of their own, so they
// aren't here. Pure.

const text = (key: string, label: string): EntityField => ({ key, label, type: "text" });
const choice = (key: string, label: string, choices: string[]): EntityField => ({ key, label, type: "select", options: { choices } });
const tags = (key: string, label: string): EntityField => ({ key, label, type: "multi_select", options: { choices: [] } });
const who = (key: string, label: string, multiple = false): EntityField => ({ key, label, type: "node", options: { nodeKinds: ["character"], ...(multiple && { multiple }) } });
const where = (key: string, label: string, multiple = false): EntityField => ({ key, label, type: "node", options: { nodeKinds: ["location"], ...(multiple && { multiple }) } });
const entry = (key: string, label: string, multiple = false): EntityField => ({ key, label, type: "node", options: { nodeKinds: ["entity"], ...(multiple && { multiple }) } });
const check = (key: string, label: string): EntityField => ({ key, label, type: "checkbox" });
const count = (key: string, label: string): EntityField => ({ key, label, type: "number" });

export type GalleryType = EntityTypeTemplate & { /** What it's for, in a line. */ hint: string };

export const entityGallery: GalleryType[] = [
  {
    name: "Deity",
    plural: "Deities",
    icon: "crown-linear",
    color: "#5f3dc4",
    hint: "Gods and powers, their domains and who worships them.",
    schema: [tags("domains", "Domains"), text("symbol", "Symbol"), entry("religion", "Religion"), where("worshipped", "Worshipped in", true), choice("status", "Status", ["Active", "Dormant", "Dead", "Forgotten", "Ascending"])],
  },
  {
    name: "Spell",
    plural: "Spells",
    icon: "magic-stick-3-linear",
    color: "#9c36b5",
    hint: "A spell, power or ritual working: what it does and what it costs.",
    schema: [entry("system", "Magic system"), text("effect", "Effect"), text("cost", "Cost"), who("known", "Known by", true), choice("rarity", "Rarity", ["Common", "Uncommon", "Rare", "Lost", "Forbidden"])],
  },
  {
    name: "Artifact",
    plural: "Artifacts",
    icon: "key-minimalistic-linear",
    color: "#b98021",
    hint: "An object of power or meaning, and where it is now.",
    schema: [text("origin", "Origin"), text("powers", "Powers"), who("owner", "Held by"), where("location", "Kept at"), choice("status", "Status", ["Held", "Hidden", "Lost", "Destroyed"])],
  },
  {
    name: "Organization",
    plural: "Organizations",
    icon: "buildings-linear",
    color: "#1971c2",
    hint: "A guild, company, order, government or gang.",
    schema: [
      choice("kind", "Kind", ["Guild", "Company", "Order", "Government", "Criminal", "Military", "Secret society"]),
      who("leader", "Leader"),
      where("base", "Headquarters"),
      who("members", "Members", true),
      text("goal", "Goal"),
      text("founded", "Founded"),
    ],
  },
  {
    name: "Military unit",
    plural: "Military units",
    icon: "users-group-rounded-linear",
    color: "#c2255c",
    hint: "An army, fleet, regiment or warband.",
    schema: [text("size", "Size"), who("commander", "Commander"), entry("allegiance", "Allegiance"), where("base", "Based at"), text("equipment", "Arms and equipment")],
  },
  {
    name: "Conflict",
    plural: "Wars & conflicts",
    icon: "flag-2-linear",
    color: "#e2602a",
    hint: "A war, feud or rebellion: who fought, when, and how it ended.",
    schema: [entry("sides", "Sides", true), text("began", "Began"), text("ended", "Ended"), where("battlegrounds", "Where it was fought", true), text("outcome", "Outcome"), text("cost", "Cost")],
  },
  {
    name: "Rank",
    plural: "Ranks & titles",
    icon: "crown-linear",
    color: "#b98021",
    hint: "A title, office or rank, and who holds it.",
    schema: [who("holders", "Held by", true), entry("granted", "Granted by"), text("duties", "Duties"), count("precedence", "Precedence")],
  },
  {
    name: "Profession",
    plural: "Professions",
    icon: "case-linear",
    color: "#2b8a3e",
    hint: "A trade or calling: training, tools, pay and standing.",
    schema: [text("training", "Training"), text("tools", "Tools"), text("pay", "Typical pay"), entry("guild", "Guild"), choice("standing", "Standing", ["Respected", "Ordinary", "Looked down on", "Outlawed"])],
  },
  {
    name: "Ritual",
    plural: "Rituals & traditions",
    icon: "fire-linear",
    color: "#e2602a",
    hint: "A rite, festival or custom, and what it means.",
    schema: [text("occasion", "Occasion"), choice("frequency", "How often", ["Daily", "Seasonal", "Yearly", "Once in a lifetime", "When needed"]), text("performed", "Performed by"), where("place", "Where"), text("meaning", "Meaning")],
  },
  {
    name: "Law",
    plural: "Laws",
    icon: "book-2-linear",
    color: "#868e96",
    hint: "A law or code: where it holds, and what breaking it costs.",
    schema: [where("jurisdiction", "Where it holds", true), text("enacted", "Enacted"), entry("enforced", "Enforced by"), text("punishment", "Punishment")],
  },
  {
    name: "Document",
    plural: "Documents & books",
    icon: "book-2-linear",
    color: "#109a82",
    hint: "A book, letter, scroll or record within the story.",
    schema: [who("author", "Author"), text("written", "Written"), entry("language", "Language"), where("kept", "Kept at"), text("contents", "Contents")],
  },
  {
    name: "Material",
    plural: "Materials & resources",
    icon: "atom-linear",
    color: "#109a82",
    hint: "An ore, crop, fuel or rare substance, and who wants it.",
    schema: [where("found", "Found in", true), text("properties", "Properties"), choice("value", "Value", ["Common", "Valuable", "Precious", "Priceless"]), text("uses", "Uses")],
  },
  {
    name: "Plant",
    plural: "Plants",
    icon: "leaf-linear",
    color: "#2b8a3e",
    hint: "A tree, herb or crop: where it grows and what it's for.",
    schema: [text("habitat", "Habitat"), text("season", "Season"), text("uses", "Uses"), check("poisonous", "Poisonous")],
  },
  {
    name: "Condition",
    plural: "Diseases & conditions",
    icon: "bolt-linear",
    color: "#c2255c",
    hint: "A plague, curse or condition: how it spreads and what cures it.",
    schema: [text("symptoms", "Symptoms"), text("spread", "How it spreads"), text("cure", "Cure"), check("deadly", "Deadly"), who("afflicted", "Afflicted", true)],
  },
  {
    name: "Technology",
    plural: "Technologies",
    icon: "lightbulb-linear",
    color: "#1971c2",
    hint: "An invention or device and how it changed things.",
    schema: [who("inventor", "Invented by"), text("invented", "Invented"), text("how", "How it works"), choice("availability", "Availability", ["Common", "Rare", "Unique", "Secret"])],
  },
  {
    name: "Vehicle",
    plural: "Vehicles & ships",
    icon: "compass-linear",
    color: "#868e96",
    hint: "A ship, airship, starship or carriage, and its crew.",
    schema: [text("class", "Class"), who("captain", "Captain"), count("crew", "Crew"), text("speed", "Speed"), where("port", "Home port")],
  },
  {
    name: "Myth",
    plural: "Myths & legends",
    icon: "ghost-linear",
    color: "#5f3dc4",
    hint: "A story told in the world, and how much of it is true.",
    schema: [text("told", "Told by"), choice("truth", "Truth", ["True", "Partly true", "False", "Unknown"]), entry("figures", "Figures in it", true), text("moral", "What it teaches")],
  },
  {
    name: "People",
    plural: "Peoples & ethnicities",
    icon: "global-linear",
    color: "#109a82",
    hint: "A people: homeland, language, customs and numbers.",
    schema: [where("homeland", "Homeland"), entry("language", "Language"), entry("species", "Species"), text("customs", "Customs"), text("population", "Population")],
  },
  {
    name: "Celestial body",
    plural: "Celestial bodies",
    icon: "stars-linear",
    color: "#5f3dc4",
    hint: "A star, moon, planet or constellation, and what it means below.",
    schema: [choice("kind", "Kind", ["Star", "Planet", "Moon", "Comet", "Constellation"]), text("seen", "When it's seen"), text("significance", "Significance")],
  },
  {
    name: "Language",
    plural: "Languages",
    icon: "chat-dots-linear",
    color: "#1971c2",
    hint: "A language with its family, script, speakers and a few words.",
    schema: [text("family", "Family"), text("script", "Script"), entry("speakers", "Spoken by", true), choice("status", "Status", ["Living", "Dying", "Dead", "Sacred", "Constructed"]), text("words", "Sample words")],
  },
  {
    name: "Magic system",
    plural: "Magic systems",
    icon: "magic-stick-3-linear",
    color: "#9c36b5",
    hint: "Where magic comes from, who can use it, and what it costs.",
    schema: [text("source", "Source"), text("users", "Who can use it"), text("cost", "Cost"), text("limits", "Limits"), choice("kind", "Hard or soft", ["Hard: clear rules", "Soft: mysterious", "Somewhere between"])],
  },
  {
    name: "Creature",
    plural: "Creatures",
    icon: "paw-linear",
    color: "#2b8a3e",
    hint: "A species or monster: where it lives, what it eats, how dangerous it is.",
    schema: [text("habitat", "Habitat"), choice("diet", "Diet", ["Herbivore", "Carnivore", "Omnivore", "Other"]), text("size", "Size"), text("lifespan", "Lifespan"), choice("danger", "Danger", ["Harmless", "Wary", "Dangerous", "Deadly"]), check("sapient", "Sapient")],
  },
];

/** The gallery's types a project hasn't got yet, by name. */
export const galleryFor = (existing: string[]) => {
  const have = new Set(existing.map((name) => name.trim().toLowerCase()));
  return entityGallery.filter((type) => !have.has(type.name.toLowerCase()));
};
