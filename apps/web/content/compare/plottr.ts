import type { Comparison } from "@/lib/compare";
import { no, part, say, yes } from "@/lib/compare-cells";
import art from "./art/plottr.webp";
import { continuityChecks, exportFiles, liveCowriting, plotGrid, plotraPrice, storyBible, timeline } from "./shared";

export const plottr: Comparison = {
  slug: "plottr",
  name: "Plottr",
  title: "Plotra vs Plottr: plot the book and write it in one place",
  description:
    "Plotra vs Plottr: plot grids, timelines, story bibles, writing the draft, co-writing and what happens when a plan ends, side by side, with sources.",
  headline: ["Plot the book,", "then write it right there."],
  intro:
    "Plottr is a visual outliner that plotters love: a timeline of scene cards across plotlines, series planning and a template for every structure. Plotra has a plot grid and timeline too, and the draft lives in the same project, so each card is the scene itself. Co-writers are free, and going back to the Free plan locks nothing.",
  summary: "A plot grid and timeline whose cards are the scenes themselves, with free co-writers and nothing locked on Free.",
  art: {
    src: art,
    alt: "A wall board covered in a grid of coloured index cards in rows and columns, with an open shared notebook on the desk below it",
  },
  verdict: {
    them: [
      "You plan in detail first, then draft in another app",
      "You want ready-made templates: Save the Cat, Hero's Journey and more",
      "You'd like a desktop app and a lifetime licence",
    ],
    plotra: [
      "You want the outline and the draft in one place, always in step",
      "You co-write, and don't want each person to need a paid plan",
      "You want continuity checks and who-knows-what tracking",
      "You'd like it open source, with nothing locked if you stop paying",
    ],
  },
  strengths: [
    {
      title: "A visual timeline",
      body: "Drag-and-drop scene cards across plotlines: the way many plotters see a book in their head.",
    },
    {
      title: "Templates for every structure",
      body: "Over 30 plot templates, from the Hero's Journey to Save the Cat, ready to fill in.",
    },
    {
      title: "Series planning",
      body: "Plan several books at once, with a series bible of characters and places shared between them.",
    },
    {
      title: "Story bible",
      body: "Characters, places and custom attributes, attached to the cards they appear on.",
    },
    {
      title: "Out to your writing app",
      body: "Export the outline to Word or Scrivener, and import from Scrivener.",
    },
    {
      title: "Desktop and lifetime",
      body: "A desktop app for Windows and Mac with offline mode, and lifetime licences.",
    },
  ],
  glance: {
    cowrite: part("On Pro; each collaborator needs Pro"),
    manuscript: no("Outlining; draft elsewhere"),
    bible: yes(),
    timeline: yes("Its centrepiece"),
    anyOs: part("Desktop; web app on Pro"),
    free: no("30-day trial"),
    open: no(),
  },
  table: [
    {
      group: "Planning",
      rows: [
        { feature: "Plot grid of scenes against plotlines", plotra: yes(), them: yes() },
        { feature: "Timeline of story dates", plotra: yes("Lanes and custom calendars"), them: yes() },
        { feature: "Plot structure templates", plotra: yes("17 beat sheets, and save your own"), them: yes("30+") },
        { feature: "Series planning", plotra: yes("Releases for each book"), them: yes() },
        { feature: "Story bible with custom fields", plotra: yes(), them: yes() },
      ],
    },
    {
      group: "Writing",
      rows: [
        { feature: "Write the draft in the same app", plotra: yes("Each card is the scene"), them: no("Export to Word or Scrivener") },
        { feature: "Continuity checks and who knows what", plotra: yes("Rule-based, no AI"), them: no() },
      ],
    },
    {
      group: "Working together",
      rows: [
        { feature: "Real-time collaboration", plotra: yes("On every plan"), them: part("Pro only") },
        { feature: "What each collaborator needs", plotra: say("Nothing: 3 members free, 25 on one Pro plan"), them: say("Their own Plottr Pro subscription") },
      ],
    },
    {
      group: "Plans and ownership",
      rows: [
        { feature: "Free plan", plotra: yes("Every feature"), them: no("30-day trial") },
        { feature: "When a plan ends", plotra: say("Back to Free; nothing deleted or locked"), them: say("Standard keeps working; Pro projects need renewal") },
        { feature: "Platforms", plotra: say("Any modern browser"), them: say("Windows and Mac; web app on Pro") },
        { feature: "Open source, self-hostable", plotra: yes("AGPL-3.0"), them: no() },
      ],
    },
  ],
  features: [
    {
      ...plotGrid,
      title: "The grid is the book",
      body: "Each row of the plot grid is a scene you can open and write in. Write what each thread does in each scene, and read down a column to see where a thread goes quiet.",
    },
    timeline,
    liveCowriting,
    storyBible,
    continuityChecks,
    exportFiles,
  ],
  pricing: {
    rows: [
      ["To start", "Free, with every feature", "30-day trial"],
      ["Yearly", "Pro: $96 a year for the workspace", "Plottr $60 · Pro $99 · Pro + Community $129"],
      ["Monthly", "Pro: $10 a month", "Pro $9.99 · Pro + Community $14.99"],
      ["Lifetime", "–", "Plottr $150 · Pro $599 · Pro + Community $649"],
      ["Co-writers", "3 free; 25 on one Pro plan", "Each needs their own Pro subscription"],
      ["Host it yourself", plotraPrice.selfHost, "–"],
    ],
    note: "Plottr's prices are in US dollars, from its pricing page. Its standard plan is desktop only.",
  },
  switching: {
    title: "Moving from Plottr, or using both",
    intro: "Plotra reads Plottr files directly. If you outline in Plottr and draft in Word or Scrivener, Plotra can replace the second app, or both.",
    steps: [
      { title: "Import your .pltr", body: "In Plotra, choose Import… and pick the Plottr file. Keep the file as your backup: nothing in it changes." },
      { title: "Check the preview", body: "Acts and chapters come across as chapters, cards as scenes with their descriptions as synopses, and your characters, places and notes as pages with their custom attributes." },
      { title: "Find your plotlines", body: "Each plotline is a thread in the plot grid, and each card fills its scene's cell, so the grid reads as your Plottr timeline did." },
      { title: "Date the scenes", body: "Give scenes story dates and they take their place on the timeline." },
      { title: "Write in the cards", body: "Open any scene from the grid or the corkboard and start drafting. The outline and the draft are now one thing." },
      { title: "Set it up like Plottr", body: "In Customize, choose Work like… and Like Plottr: the plot grid, outline, corkboard and relationships come first, and the draft after them." },
      { title: "Invite your co-writer", body: "Add them by email. They don't need a paid plan." },
    ],
  },
  faq: [
    {
      q: "Is Plotra a good Plottr alternative?",
      a: "If you'd like to plot and write in one place, co-write without each person paying, or keep everything on a free plan, yes. If you plan in detail with structure templates and draft in another app, Plottr does that well.",
    },
    {
      q: "Does each co-writer need to pay in Plotra?",
      a: "No. A Free workspace has room for three members, counting you, and Pro is $10 a month for the whole workspace with room for 25. Plottr's pricing page says each collaborator must have their own Plottr Pro subscription.",
    },
    {
      q: "What happens to my work if I stop paying?",
      a: "In Plotra the workspace goes back to Free: nothing is deleted, and export always works. Plottr says its standard plan keeps working after it expires, without updates, while Pro projects need a renewal to open, so it recommends exporting first.",
    },
    {
      q: "Can I import my Plottr file?",
      a: "Yes. Choose Import… and pick the .pltr. Beats become chapters, cards become scenes with their descriptions as synopses, plotlines become plot threads with each card in its cell, and characters, places, notes and tags come across. A card's characters and places are linked from its scene. Pictures and templates are left out.",
    },
    {
      q: "Does Plotra have plot templates like Save the Cat?",
      a: "Yes: 17 beat sheets, including Save the Cat, the Hero's and Heroine's Journeys, the Story Circle, seven-point structure, romance and mystery beats, TV episodes and tabletop sessions. Each builds a folder of chapters and scenes with what every beat does. Plottr has more, over 30; in Plotra you can also save any folder as a beat sheet of your own and use it in every project.",
    },
  ],
  sources: [
    { label: "Plottr pricing and plan terms", url: "https://plottr.com/pricing/" },
    { label: "Plottr features", url: "https://plottr.com/features/" },
    {
      label: "Plottr docs: collaborating with a co-author or editor",
      url: "https://docs.plottr.com/article/29-can-i-collaborate-on-a-plottr-file-with-a-co-author-or-editor",
    },
  ],
  checked: "2026-10-18",
  audiences: ["novelists", "co-writers", "web-serial-writers"],
  guides: ["how-to-outline-a-novel", "how-to-make-a-story-timeline", "how-to-avoid-plot-holes"],
};
