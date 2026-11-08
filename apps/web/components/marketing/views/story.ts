// Romeo and Juliet, the story the whole page tells, cut down to what the views
// showcase draws: five scenes everyone knows, and the notes they link to.

/** Prose is plain text, with the [[links]] it carries set apart. */
export type Prose = (string | { link: string })[];

export type StoryScene = {
  title: string;
  synopsis: string;
  prose: Prose;
  chapter: number;
  place: number;
  /** Days since the Sunday the story opens on. */
  day: number;
  /** What happens to each plot thread in this scene, if anything. */
  threads: (string | null)[];
  /** The notes this scene links to, by key of `notes`. */
  links: NoteId[];
  shot: string;
};

export const chapters = ["Two Households", "Violent Delights", "Star-Crossed"];
export const places = ["Capulet's house", "Friar Laurence's cell", "The market square", "The Capulet tomb"];
export const threads = [
  { name: "The feud", color: "#e2602a" },
  { name: "Romeo and Juliet", color: "#1971c2" },
];

export const kinds = {
  scene: { label: "Scenes", color: "#e2602a" },
  character: { label: "Characters", color: "#d5467f" },
  location: { label: "Places", color: "#109a82" },
  world: { label: "World", color: "#7556d6" },
  note: { label: "Secrets", color: "#4a8be0" },
} as const;

/** Where each note settles in the graph, as fractions of the canvas. */
export const notes = {
  romeo: { label: "Romeo Montague", kind: "character", at: [0.36, 0.5] },
  tybalt: { label: "Tybalt", kind: "character", at: [0.47, 0.1] },
  nurse: { label: "The Nurse", kind: "character", at: [0.1, 0.86] },
  potion: { label: "The potion", kind: "world", at: [0.64, 0.9] },
  juliet: { label: "Juliet Capulet", kind: "character", at: [0.45, 0.33] },
  house: { label: "Capulet's house", kind: "location", at: [0, 0.38] },
  friar: { label: "Friar Laurence", kind: "character", at: [0.9, 0.3] },
  tomb: { label: "The Capulet tomb", kind: "location", at: [0.44, 0.98] },
  feud: { label: "The feud", kind: "world", at: [0.76, 0.06] },
  square: { label: "The market square", kind: "location", at: [0.94, 0.76] },
  secret: { label: "Married in secret", kind: "note", at: [0.84, 0.52] },
} as const satisfies Record<string, { label: string; kind: keyof typeof kinds; at: readonly [number, number] }>;
export type NoteId = keyof typeof notes;

/** Links between notes that don't pass through a scene. */
export const noteLinks: [NoteId, NoteId][] = [
  ["tybalt", "feud"],
  ["tybalt", "juliet"],
  ["romeo", "juliet"],
  ["friar", "secret"],
  ["juliet", "potion"],
];

export const scenes: StoryScene[] = [
  {
    title: "The Capulet Feast",
    synopsis: "Romeo comes masked to his enemy's feast, and sees Juliet.",
    prose: [
      "He had come masked, to a house where his name could get him killed, to look at another girl. Then ",
      { link: "Juliet" },
      " crossed the hall, and ",
      { link: "Romeo" },
      " forgot who he had come for.",
    ],
    chapter: 0,
    place: 0,
    day: 0.8,
    threads: ["Tybalt knows Romeo's voice and calls for his sword.", "They meet, and learn each other's names too late."],
    links: ["house", "tybalt", "juliet", "romeo"],
    shot: "Wide",
  },
  {
    title: "The Balcony",
    synopsis: "Juliet speaks to the night. Romeo, in the orchard below, answers.",
    prose: [
      "The orchard wall was high, and ",
      { link: "Romeo" },
      " went over it anyway. Above him a window opened. “Wherefore art thou Romeo?” she asked the dark, and the dark answered.",
    ],
    chapter: 0,
    place: 0,
    day: 1,
    threads: [null, "They swear to marry tomorrow."],
    links: ["house", "nurse", "romeo", "juliet"],
    shot: "Low angle",
  },
  {
    title: "The Secret Wedding",
    synopsis: "Friar Laurence marries them, hoping it will end the feud.",
    prose: [
      { link: "Friar Laurence" },
      " married them in his cell, with no witness but the herbs drying overhead. “These violent delights have violent ends,” he said, and joined their hands anyway.",
    ],
    chapter: 1,
    place: 1,
    day: 1.6,
    threads: ["The Friar hopes a marriage will end it.", "Married, and nobody can know."],
    links: ["juliet", "romeo", "friar", "secret", "feud"],
    shot: "Two-shot",
  },
  {
    title: "The Duel",
    synopsis: "Tybalt kills Mercutio. Romeo kills Tybalt, and is banished.",
    prose: [
      { link: "Tybalt" },
      " came looking for him in ",
      { link: "the market square" },
      ", and Romeo, an hour married, would not draw. Mercutio drew for him.",
    ],
    chapter: 1,
    place: 2,
    day: 1.7,
    threads: ["Tybalt kills Mercutio. Romeo kills Tybalt.", "Romeo is banished on his wedding day."],
    links: ["romeo", "tybalt", "square", "secret", "feud"],
    shot: "Wide",
  },
  {
    title: "The Tomb",
    synopsis: "Romeo finds Juliet asleep, and believes she is dead.",
    prose: [
      "She lay in ",
      { link: "the Capulet tomb" },
      " as if the colour had only just left her. ",
      { link: "Romeo" },
      " did not know about ",
      { link: "the potion" },
      ". The letter had never reached him.",
    ],
    chapter: 2,
    place: 3,
    day: 4.9,
    threads: ["The families find them, and make peace.", "Romeo finds her asleep and thinks her dead."],
    links: ["romeo", "juliet", "tomb", "potion"],
    shot: "Close-up",
  },
];

/** Dated events that aren't scenes, shown on the timeline beside them. */
export const events = [
  { title: "The Prince's warning", day: 0.4 },
  { title: "Juliet drinks the potion", day: 2.9 },
];

/** Where each scene settles in the graph. */
export const sceneSpots: [number, number][] = [
  [0.2, 0.18],
  [0.1, 0.62],
  [0.66, 0.26],
  [0.68, 0.68],
  [0.3, 0.8],
];
