import { h2, l, p, quote, revealedIn, type Sample } from "./types";

// "Ashes at Carrow Ford": a short tabletop campaign for a game master. Two
// sessions played and one in prep, with the sessions as releases, so the
// spoiler horizon is the line between what the table has seen and the GM's
// notes. Two things are left for the Continuity view to find (see `continuity`
// at the bottom). Every name and line here was written for Plotra.

export const ttrpgCampaign: Sample = {
  id: "ttrpg-campaign",
  title: "Ashes at Carrow Ford",
  type: "ttrpg",
  logline: "A river town hires strangers to walk its fords at night. Three days later the mill burns with the miller inside.",
  open: "s-arrival",

  notes: [
    {
      key: "session1",
      kind: "folder",
      title: "Session 1: Arrival",
      synopsis: "The party is hired by the reeve and meets the town.",
      children: [
        {
          key: "s-arrival",
          kind: "scene",
          title: "Arrival at Carrow Ford",
          synopsis: "The reeve hires the party to walk the fords at night.",
          properties: { location: { note: "carrow-ford" }, "story-date": "1287-10-03 16:00", duration: "2h" },
          body: [
            quote(
              "The road drops out of the beech woods and there is the ford, wide and brown and slow, with a mill turning on the far bank and a dozen roofs behind it. Somebody has hung the bridge-posts with rowan. Nobody comes out to greet you.",
            ),
            p(
              l("thorne", "Reeve Thorne"),
              " meets the party at the tithe barn. He is courteous, tired, and wants them gone within the week: the abbey's collectors are due and he has no beds for sell-swords.",
            ),
            p("He hires them anyway, to walk the fords after dark. Sheep have gone missing, he says."),
            revealedIn("never", p("GM: no sheep are missing. He wants strangers seen out of doors at night before anything happens.")),
            p("Clue: his cuffs smell of lamp oil. Give it to whoever shakes his hand. At our table that was ", l("kestrel"), "."),
            p(l("gar", "Old Gar"), " the miller watches from his door. If anyone speaks to him he says only: “Ask the reeve what a tithe weighs.”"),
          ],
        },
        {
          key: "s-shrine",
          kind: "scene",
          title: "The Shrine at Dusk",
          synopsis: "Sister Wenna hints. Old Gar leaves a torn page in the offering box.",
          properties: { location: { note: "shrine" }, "story-date": "1287-10-03 19:00", duration: "1h" },
          body: [
            quote(
              "The shrine is a single room over the water, floored with river stones. A woman in grey is trimming lamps. She doesn't turn round. “You're the ones he hired,” she says. “Then you'll be wanting to know what for.”",
            ),
            p(
              l("wenna", "Sister Wenna"),
              " keeps ",
              l("shrine", "the shrine"),
              " and distrusts ",
              l("thorne", "the reeve"),
              ", but she answers to ",
              l("abbey"),
              " and won't accuse him without proof.",
            ),
            p(
              "While the party talks, ",
              l("gar", "Old Gar"),
              " slips a torn page into the offering box and leaves. It is a page of ",
              l("ledger"),
              ": two columns that should match and don't. ",
              l("ansel"),
              " found it. Nobody has read it closely yet.",
            ),
          ],
        },
      ],
    },
    {
      key: "session2",
      kind: "folder",
      title: "Session 2: Fire",
      synopsis: "The mill burns. The town decides it was an accident.",
      children: [
        {
          key: "s-mill",
          kind: "scene",
          title: "The Mill Burns",
          synopsis: "The party can reach the miller but not save him.",
          properties: { location: { note: "mill" }, "story-date": "1287-10-06 21:00", duration: "3h" },
          body: [
            quote(
              "You smell it before you see it. Then the whole sky over the ford goes the colour of a forge, and the mill wheel is still turning, slowly, with its paddles on fire.",
            ),
            p(
              "The party arrives with the roof already going. ",
              l("gar", "Old Gar"),
              " is inside. He can be reached (two checks, the second at a penalty for smoke) but not saved: he dies in the yard an hour before midnight.",
            ),
            p("His last words, to whoever carried him out: “He kept two books.”"),
            p("Anyone who searches the yard afterwards finds a lamp-oil flask with the reeve's mark on the stopper."),
            revealedIn(
              "session3",
              p(l("wenna", "Sister Wenna"), " was on the bridge and saw ", l("thorne", "the reeve"), " leave the mill yard with a lantern before the fire. She tells nobody tonight. See ", l("secret-fire"), "."),
            ),
          ],
        },
        {
          key: "s-morning",
          kind: "scene",
          title: "The Morning After",
          synopsis: "The reeve calls it an accident and invites the party to dinner.",
          properties: { location: { note: "carrow-ford" }, "story-date": "1287-10-07 08:00", duration: "2h" },
          body: [
            quote(
              "By morning the mill is four black walls and a wheel. The town stands on the bank in its good clothes, as if for a burial, and the reeve stands in front of it with his hat in his hands.",
            ),
            p(l("thorne", "Thorne"), " calls it an accident: a lamp, a floor thick with flour dust. The town wants to believe him, and by noon ", l("belief-accident", "it does"), "."),
            p(l("kestrel"), " asked to see the body and was refused. ", l("ansel"), " was asked to say the rites, and agreed."),
            p("Before the party leaves the bank, the reeve invites them to dinner in two days' time, “to settle accounts”."),
          ],
        },
      ],
    },
    {
      key: "session3",
      kind: "folder",
      title: "Session 3: The Reeve's Dinner",
      synopsis: "Prep. Not played yet.",
      children: [
        {
          key: "s-dinner",
          kind: "scene",
          title: "The Reeve's Dinner",
          synopsis: "Everyone who knows something is at one table.",
          properties: { location: { note: "reeves-hall" }, "story-date": "1287-10-09 19:00", duration: "3h" },
          body: [
            p("Not played yet. Prep for next session."),
            h2("Who is at the table"),
            p(
              l("thorne", "Reeve Thorne"),
              ", hosting. ",
              l("wenna", "Sister Wenna"),
              ", who has decided to speak. ",
              l("gar", "Old Gar"),
              ", at the foot of the table. ",
              l("kestrel"),
              " and ",
              l("ansel"),
              ".",
            ),
            h2("What can happen"),
            p("If the party brings the torn page, Thorne offers to buy it. If they set it beside ", l("ledger"), " in his study, they have him: see ", l("secret-ledgers"), "."),
            p("If anyone gives Wenna an opening, she says what she saw from the bridge."),
          ],
        },
      ],
    },
    {
      key: "pcs",
      kind: "folder",
      title: "Player characters",
      reveal: "session1",
      children: [
        {
          key: "kestrel",
          kind: "character",
          title: "Kestrel Vane",
          aliases: ["Kestrel"],
          synopsis: "Player character. Caravan guard who notices things.",
          properties: { role: "Protagonist", arc: "Owes the abbey a debt she'd rather not pay" },
          body: [
            h2("Who she is"),
            p("Player character. A caravan guard who took the abbey's coin once and regrets it. The lamp oil in ", l("s-arrival"), " was her catch."),
          ],
        },
        {
          key: "ansel",
          kind: "character",
          title: "Brother Ansel",
          aliases: ["Ansel"],
          synopsis: "Player character. Mendicant of the Grey Abbey.",
          properties: { role: "Protagonist", arc: "Finds out what his abbey's tithe costs a town" },
          body: [h2("Who he is"), p("Player character. A mendicant of ", l("abbey"), ", three years out of the cloister. Holds the torn page from ", l("s-shrine"), ".")],
        },
      ],
    },
    {
      key: "npcs",
      kind: "folder",
      title: "NPCs",
      reveal: "session1",
      children: [
        {
          key: "thorne",
          kind: "character",
          title: "Reeve Aldous Thorne",
          aliases: ["Thorne", "the reeve"],
          synopsis: "Reeve of Carrow Ford. Courteous, exact, always tired.",
          properties: { role: "Antagonist", arc: "Six years of small thefts, and one night to bury them" },
          body: [
            h2("Who he is"),
            p("Reeve of ", l("carrow-ford"), " for nine years. Collects the tithe for ", l("abbey"), " and keeps ", l("ledger"), "."),
            h2("Voice"),
            p("Quiet. Finishes other people's sentences for them."),
            revealedIn("session3", p("Has skimmed the tithe for six years and keeps a second book. Burned the mill to silence the miller: ", l("secret-fire"), ".")),
            revealedIn("never", p("GM: cornered, he bargains before he fights. He will not hurt Sister Wenna.")),
          ],
        },
        {
          key: "wenna",
          kind: "character",
          title: "Sister Wenna Pike",
          aliases: ["Sister Wenna", "Wenna"],
          synopsis: "Keeper of the shrine. Saw more than she has said.",
          properties: { role: "Supporting", arc: "Decides whether to speak" },
          body: [
            h2("Who she is"),
            p("Keeper of ", l("shrine"), ". Blunt and devout, and more afraid of the abbey's displeasure than of the reeve."),
            revealedIn("session3", p("Saw the reeve leave the mill yard before the fire, in ", l("s-mill"), ". Will say so at the dinner if someone gives her an opening.")),
          ],
        },
        {
          key: "gar",
          kind: "character",
          title: "Old Gar Mossby",
          aliases: ["Old Gar", "Garrick Mossby"],
          synopsis: "The miller. Knew the tithe didn't add up.",
          properties: { role: "Supporting", arc: "Tries to tell someone, too quietly", "death-date": "1287-10-06 23:00" },
          body: [
            h2("Who he is"),
            p("Miller of ", l("mill"), " for thirty years. Weighs every sack twice, which is how he knew the tithe didn't add up."),
            revealedIn("session2", p("Dies in the fire, in ", l("s-mill"), ".")),
          ],
        },
      ],
    },
    {
      key: "places",
      kind: "folder",
      title: "Places",
      reveal: "session1",
      children: [
        {
          key: "carrow-ford",
          kind: "location",
          title: "Carrow Ford",
          synopsis: "A river town of forty hearths at the only crossing for a day's ride.",
          properties: { type: "City" },
          body: [h2("Description"), p("A river town of forty hearths at the only crossing for a day's ride. Owes a tenth of everything to ", l("abbey"), ".")],
        },
        {
          key: "mill",
          kind: "location",
          title: "The Old Mill",
          properties: { type: "Building", region: { note: "carrow-ford" } },
          body: [h2("Description"), p("On the far bank, older than the bridge."), revealedIn("session2", p("Burned to its walls in the second session."))],
        },
        {
          key: "shrine",
          kind: "location",
          title: "Shrine of the Ford",
          aliases: ["the shrine"],
          properties: { type: "Building", region: { note: "carrow-ford" } },
          body: [h2("Description"), p("One room over the water, floored with river stones. The offering box is never locked.")],
        },
        {
          key: "reeves-hall",
          kind: "location",
          title: "The Reeve's Hall",
          properties: { type: "Building", region: { note: "carrow-ford" } },
          body: [
            h2("Description"),
            p("The only stone house in town. The study is on the upper floor, and ", l("ledger"), " is kept there."),
            revealedIn("never", p("GM: the second book is behind the hearthstone in the study. A search finds it on a good roll, or at once if they know to look for loose stone.")),
          ],
        },
      ],
    },
    {
      key: "world",
      kind: "folder",
      title: "World",
      reveal: "session1",
      children: [
        {
          key: "abbey",
          kind: "entity",
          entityType: "Faction",
          title: "The Grey Abbey",
          aliases: ["the abbey"],
          properties: { kind: "Organisation", goal: "Collect the tithe, and ask no questions while it arrives" },
          body: [p("Two days upriver. Its collectors come at the end of harvest. ", l("ansel"), " is one of theirs, and ", l("wenna"), " answers to it.")],
        },
        {
          key: "ledger",
          kind: "entity",
          entityType: "Object",
          title: "The tithe ledger",
          aliases: ["the ledger"],
          properties: { owner: { note: "thorne" }, location: { note: "reeves-hall" }, significance: "Proof, once it is set beside the torn page" },
          body: [p("The reeve's record of what the town owes and what it pays. A page of it turned up in ", l("s-shrine"), ".")],
        },
      ],
    },
    {
      key: "secrets",
      kind: "folder",
      title: "Secrets (GM only)",
      children: [
        {
          key: "secret-fire",
          kind: "note",
          title: "The reeve set the fire",
          reveal: "session3",
          body: [
            p(
              l("thorne"),
              " fired ",
              l("mill"),
              " himself, to kill the miller and burn whatever the miller had copied. He hired the party beforehand so that strangers would be out walking the fords when it happened.",
            ),
          ],
        },
        {
          key: "secret-ledgers",
          kind: "note",
          title: "The tithe ledgers are forged",
          reveal: "session3",
          body: [
            p(
              "For six years ",
              l("thorne", "the reeve"),
              " has recorded less than the town paid and kept the difference. ",
              l("gar"),
              " worked it out from his own tallies and tore a page from ",
              l("ledger"),
              " as proof.",
            ),
          ],
        },
        {
          key: "belief-accident",
          kind: "note",
          title: "The fire was an accident",
          layer: "belief",
          reveal: "session2",
          body: [p("What ", l("carrow-ford"), " believes after ", l("s-morning"), ": a lamp, flour dust, bad luck. The truth is that ", l("secret-fire", "the reeve set it"), ".")],
        },
      ],
    },
    { key: "timeline", kind: "timeline", title: "Campaign timeline" },
  ],

  releases: [
    { key: "session1", title: "Session 1: Arrival", kind: "session", ships: "session1" },
    { key: "session2", title: "Session 2: Fire", kind: "session", ships: "session2" },
    { key: "session3", title: "Session 3: The Reeve's Dinner", kind: "session", ships: "session3", notes: "Not played yet." },
  ],

  threads: [
    {
      key: "fire",
      name: "Who burned the mill?",
      color: "#e2602a",
      cells: [
        { scene: "s-arrival", note: "Thorne hires witnesses. Lamp oil on his cuffs." },
        { scene: "s-mill", note: "The fire. Wenna sees the reeve leave." },
        { scene: "s-morning", note: "Thorne calls it an accident." },
        { scene: "s-dinner", note: "Wenna may speak." },
      ],
    },
    {
      key: "ledgers",
      name: "The forged ledgers",
      color: "#2b8a3e",
      cells: [
        { scene: "s-shrine", note: "Old Gar leaves the torn page." },
        { scene: "s-mill", note: "“He kept two books.”" },
        { scene: "s-dinner", note: "The page against the ledger." },
      ],
    },
  ],

  relationships: [
    { from: "thorne", to: "gar", type: "enemy", label: "knows what he took" },
    { from: "wenna", to: "gar", type: "friend" },
    { from: "wenna", to: "thorne", type: "rival" },
    { from: "kestrel", to: "ansel", type: "ally" },
  ],

  knowledge: [
    { character: "thorne", secret: "secret-fire" },
    { character: "thorne", secret: "secret-ledgers" },
    { character: "gar", secret: "secret-ledgers", note: "Worked it out from his own tallies." },
    { character: "wenna", secret: "secret-fire", learnedIn: "s-mill", note: "Saw him leave the yard with a lantern." },
    { character: "kestrel", secret: "secret-fire", learnedIn: "s-morning", layer: "belief", note: "Was told it was an accident. Doesn't believe it, can't prove otherwise." },
  ],

  setups: [
    { kind: "clue", title: "Lamp oil on the reeve's cuffs", setup: "s-arrival", payoff: "s-mill", status: "paid" },
    { kind: "clue", title: "The torn ledger page", setup: "s-shrine", status: "open", note: "Meant to pay off at the dinner." },
  ],

  events: [
    { title: "The abbey announces an audit", date: "1287-09-20", about: "abbey", thread: "ledgers" },
    { title: "Harvest fair", date: "1287-09-28" },
    { title: "First frost", date: "1287-10-08" },
    { title: "The tithe collectors arrive", date: "1287-10-12", description: "The deadline the reeve is racing.", about: "abbey", thread: "ledgers" },
  ],

  // The dinner's guest list was copied from before the fire and still seats the
  // miller, who died in "The Mill Burns". And the torn page from the shrine is a
  // clue nobody has followed up yet.
  continuity: [
    { rule: "after-death", notes: ["s-dinner", "gar"] },
    { rule: "open-setup", notes: ["s-shrine"] },
  ],
};
