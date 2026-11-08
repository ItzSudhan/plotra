import { h2, l, p, revealedIn, type Seed } from "@/lib/samples/types";

// "The Ninth Bell": the opening of a fantasy novel in a canal city whose bells
// are said to hold back the tide. Five short scenes over two books, with one
// continuity slip left in on purpose (see `continuity` at the bottom). Every
// name and line here was written for Plotra. It was the first sample novel, and
// is kept as the project the evals run on (harness/project.ts).

export const ninthBell: Seed = {
  id: "ninth-bell",
  title: "The Ninth Bell",
  type: "novel",
  logline: "In a canal city kept dry by nine bells, a keeper's apprentice finds out that one of them was never cast.",
  open: "s-toll",
  // Vessen counts eight months of forty-five days from the first tolling.
  calendar: {
    name: "Vessen reckoning",
    definition: {
      months: ["Firstebb", "Saltmoon", "Greenwater", "Highsun", "Stillwater", "Reedfall", "Darktide", "Icelock"].map((name) => ({ name, days: 45 })),
      hoursPerDay: 24,
      eras: [{ name: "AT", startYear: 1 }],
    },
  },

  notes: [
    {
      key: "book1",
      kind: "folder",
      title: "Book One: The Ninth Bell",
      synopsis: "Iselle learns what is in the ninth belfry.",
      children: [
        {
          key: "b1c1",
          kind: "chapter",
          title: "The Keeper's Apprentice",
          children: [
            {
              key: "s-toll",
              kind: "scene",
              title: "Morning Toll",
              synopsis: "Iselle rings the eighth bell. The ninth answers late, and wrong.",
              properties: { pov: { note: "iselle" }, location: { note: "bellward" }, "story-date": "0412-03-14 06:00", duration: "1h" },
              body: [
                p(
                  "The eighth bell was the heaviest, and Iselle had learned to let it carry her. She leaned into the rope, rode it up onto her toes, and let the note roll out over the wet roofs of ",
                  l("bellward", "the Bellward"),
                  ".",
                ),
                p("Below, the canals answered. The water dropped a hand's width against the green-stained stones, as it did every dawn, as it had for four hundred years."),
                p("“Late,” said ", l("odran", "Odran"), ". He did not look up from the tide tables."),
                p("“The rope was frozen.”"),
                p(
                  "“The sea doesn't care about rope.” He marked the hour anyway. ",
                  l("key", "A small iron key"),
                  " hung at his throat on a cord gone black with age. In three years she had never seen him use it, and the one time she had asked, he sent her to oil hinges until dark.",
                ),
                p("Eight bells rung. She waited, as she always did, for the ninth to answer from the far tower. It came a breath late, thin and oddly flat, like a bell heard through a wall."),
                p("“There,” Odran said, too quickly. “The city's safe another day. Go and eat.”"),
              ],
            },
            {
              key: "s-market",
              kind: "scene",
              title: "Low Tide Market",
              synopsis: "Pell's boats sit lower than the tide tables say they should.",
              properties: { pov: { note: "iselle" }, location: { note: "market" }, "story-date": "0412-03-14 12:00", duration: "2h" },
              body: [
                p(
                  "At low water the market spread across the bared canal bed, planks laid over mud, and for two hours ",
                  l("vessen"),
                  " sold itself everything it had fished out of its own streets.",
                ),
                p(l("pell", "Pell"), " found her at the eel stalls. “Bell-girl. You look like you rang them with your face.”"),
                p("“Eighth rope froze.”"),
                p(
                  "“Then let the Council warm it. They've coin enough.” Pell flipped a salt-crusted token and caught it. “My boats sat a hand lower at the Reedgate this morning. Tide tables say they shouldn't.”",
                ),
                p(
                  "Iselle said nothing. Above them the far tower stood shuttered against the sky, and she thought of ",
                  l("secret-bell", "the bell inside it that had never once been rung"),
                  ", and of how long a lie like that could hold back the sea.",
                ),
                p("“Tables can be wrong,” she said."),
                p("“Tables,” said Pell, “are written by people who don't own boats.”"),
              ],
            },
          ],
        },
        {
          key: "b1c2",
          kind: "chapter",
          title: "The Empty Belfry",
          children: [
            {
              key: "s-key",
              kind: "scene",
              title: "The Key",
              synopsis: "Iselle takes the key and opens the ninth belfry.",
              properties: { pov: { note: "iselle" }, location: { note: "belfry" }, "story-date": "0412-03-19 22:00", duration: "2h" },
              body: [
                p("She took ", l("key", "the key"), " while ", l("odran", "Odran"), " slept, lifting the cord over his head the way she would lift a net off a sleeping gull."),
                p(
                  l("belfry", "The ninth belfry"),
                  " had no rope-room. The stair simply ended at a door bound in green copper, and the key turned in it as if it had been waiting.",
                ),
                p(
                  "Inside there was a frame for a bell: oak beams as thick as her waist, iron straps, a wheel. A clapper hung from a hook on the wall, still wrapped in oilcloth. There was no bell.",
                ),
                p(
                  "In the corner stood a thing of pipes and bellows with a crank handle worn bright, and a brass horn pointed out through the louvres at the city. She turned the handle once. The note it gave was thin and oddly flat, like a bell heard through a wall.",
                ),
                p("Iselle sat down on the floor. Under her, through four hundred years of stone, she could feel the tide coming in."),
              ],
            },
            {
              key: "s-owes",
              kind: "scene",
              title: "What Odran Owes",
              synopsis: "Odran explains. The tide is rising a finger a year.",
              properties: { pov: { note: "iselle" }, location: { note: "bellward" }, "story-date": "0412-03-20 05:00", duration: "1h" },
              body: [
                p(l("odran", "Odran"), " was awake when she came down. He looked at the key in her hand, not at her."),
                p(
                  "“Forty years,” he said. “The founders' mould cracked in the casting. ",
                  l("council", "The Council"),
                  " had already promised nine bells, so nine bells is what the city got. Eight of bronze and one of breath.”",
                ),
                p("“And the tide?”"),
                p(
                  "“Rises. A finger a year. Eight bells hold most of it.” He rubbed his eyes. “I send ",
                  l("orre", "Chancellor Orre"),
                  " the measures every spring. Every spring she thanks me for my diligence.”",
                ),
                p("“People should know.”"),
                p(
                  "“People would run. And then who rings the eight?” He held out his hand for the key. “You'll hate me for a while. Then you'll come up at dawn, because the rope needs pulling, and you are the only other soul who knows ",
                  l("secret-bell", "what is really up there"),
                  ".”",
                ),
                p("He was right, which was the worst of it."),
              ],
            },
          ],
        },
      ],
    },
    {
      key: "book2",
      kind: "folder",
      title: "Book Two: The Rising Year",
      synopsis: "Iselle takes the truth to the Chancellor, who has had it all along.",
      children: [
        {
          key: "b2c1",
          kind: "chapter",
          title: "Chancellor's Water",
          children: [
            {
              key: "s-audience",
              kind: "scene",
              title: "An Audience",
              synopsis: "Orre doesn't deny it. She wants a real ninth bell cast in secret.",
              properties: { pov: { note: "orre" }, location: { note: "tide-hall" }, "story-date": "0412-04-02 10:00", duration: "1h" },
              body: [
                p("The keeper's apprentice was younger than Tamsin had expected, and angrier, which she had expected."),
                p("“You've known for forty years,” said ", l("iselle", "the girl"), "."),
                p(
                  "“I've known for eleven. Before that I was merely suspicious.” Tamsin poured water for them both; the girl didn't touch hers. “Sit down, Keeper Marrow. You have come to tell me the sea is rising. I have the measures. I could recite them.”",
                ),
                p("“Then why—”"),
                p(
                  "“Because a city that believes in nine bells mends its walls and pays its tithe. A city that believes in eight packs its boats.” Through the window she could see the Reedgate, and a smuggler's skiff slipping under it against the tide, steered by ",
                  l("secret-pell", "someone with her own stubborn chin"),
                  ". Tamsin made herself look away.",
                ),
                p("“I am not asking you to lie,” she said. “I am asking you to help me cast the ninth bell before anyone finds out we need it.”"),
              ],
            },
          ],
        },
      ],
    },
    {
      key: "characters",
      kind: "folder",
      title: "Characters",
      reveal: "book1",
      children: [
        {
          key: "iselle",
          kind: "character",
          title: "Iselle Marrow",
          aliases: ["Iselle", "Keeper Marrow"],
          synopsis: "Apprentice bell-keeper. Finds the empty belfry.",
          properties: {
            role: "Protagonist",
            age: "19",
            arc: "From keeping the secret to deciding who deserves it",
            "first-appearance": { note: "s-toll" },
            "birth-date": "0393-02-10",
          },
          body: [
            h2("Who she is"),
            p("Apprentice to ", l("odran"), ", three years on the ropes in ", l("bellward", "the Bellward"), ". Strong shoulders, short temper before breakfast."),
            h2("Wants and needs"),
            p("Wants to be good at the one thing she was given. After ", l("s-key"), ", wants to stop being lied to; needs to learn why people keep a lie."),
            revealedIn("book2", p("Becomes Keeper Marrow at the start of Book Two, when Odran steps down.")),
          ],
        },
        {
          key: "odran",
          kind: "character",
          title: "Odran Kesh",
          aliases: ["Odran"],
          synopsis: "Keeper of the Bells. Has cranked the false ninth toll for twenty-three years.",
          properties: { role: "Supporting", age: "60", arc: "Has to decide who the lie was protecting", "birth-date": "0351-06-02" },
          body: [
            h2("Who he is"),
            p("Keeper of the Bells of ", l("vessen"), " for twenty-three years, and of ", l("secret-bell", "its worst secret"), " for all of them."),
            p("Wears ", l("key", "an iron key"), " he never uses. Sends the true tide measures to ", l("orre"), " every spring."),
            h2("Voice"),
            p("Short sentences. Answers the question behind the one he was asked."),
          ],
        },
        {
          key: "orre",
          kind: "character",
          title: "Tamsin Orre",
          aliases: ["Chancellor Orre", "the Chancellor"],
          synopsis: "Chancellor of the Tide Council. Believes the lie is what keeps the city standing.",
          properties: { role: "Antagonist", age: "52", arc: "Certain she is right, until the water proves her wrong", "birth-date": "0360-01-20" },
          body: [
            h2("Who she is"),
            p("Chancellor of ", l("council"), ". Dry, patient, never raises her voice. Has known about the ninth bell for eleven years."),
            revealedIn("book2", p("Mother of ", l("pell"), ", who was raised by the Reedgate boatmen and doesn't know. See ", l("secret-pell"), ".")),
          ],
        },
        {
          key: "pell",
          kind: "character",
          title: "Pell Arrowmere",
          aliases: ["Pell"],
          synopsis: "Canal smuggler, Iselle's oldest friend. First to notice the tide tables are wrong.",
          properties: { role: "Supporting", age: "20", arc: "Trusts her boats over the Council", "birth-date": "0391-07-05" },
          body: [
            h2("Who she is"),
            p("Runs two skiffs through the Reedgate at slack water, mostly salt and lamp oil. ", l("iselle", "Iselle"), "'s oldest friend."),
            revealedIn("book2", p("Daughter of ", l("orre"), ". Neither of them has said so out loud.")),
          ],
        },
      ],
    },
    {
      key: "places",
      kind: "folder",
      title: "Places",
      reveal: "book1",
      children: [
        {
          key: "vessen",
          kind: "location",
          title: "Vessen",
          synopsis: "A canal city built below the high-water line.",
          properties: { type: "City" },
          body: [
            h2("Description"),
            p("A canal city built below the high-water line. Nine bell towers ring the tide back every dawn; that is what every child is taught."),
            p("Governed by ", l("council"), " from ", l("tide-hall"), "."),
          ],
        },
        {
          key: "bellward",
          kind: "location",
          title: "The Bellward",
          properties: { type: "Other", region: { note: "vessen" } },
          body: [h2("Description"), p("The district of the bell towers and the highest ground in ", l("vessen"), ". Wet roofs, rope-makers and the keepers' lodgings.")],
        },
        {
          key: "market",
          kind: "location",
          title: "Low Tide Market",
          properties: { type: "Other", region: { note: "vessen" } },
          body: [h2("Description"), p("Held on the bared canal bed for the two hours of low water. Everything is sold from planks, and everything is damp.")],
        },
        {
          key: "belfry",
          kind: "location",
          title: "The Ninth Belfry",
          properties: { type: "Building", region: { note: "bellward" } },
          body: [
            h2("Description"),
            p("The far tower. Shuttered and locked for as long as anyone remembers; only the Keeper carries ", l("key", "the key"), "."),
            revealedIn("never", p("Working note: decide before Book Three who built the bellows-horn, and whether anyone outside the Council could have.")),
          ],
        },
        {
          key: "tide-hall",
          kind: "location",
          title: "The Tide Hall",
          properties: { type: "Building", region: { note: "vessen" } },
          body: [h2("Description"), p("Seat of ", l("council"), ". The Chancellor's windows look out over the Reedgate.")],
        },
      ],
    },
    {
      key: "world",
      kind: "folder",
      title: "World",
      reveal: "book1",
      children: [
        {
          key: "council",
          kind: "entity",
          entityType: "Faction",
          title: "The Tide Council",
          aliases: ["the Council"],
          properties: { kind: "Organisation", leader: { note: "orre" }, base: { note: "tide-hall" }, goal: "Keep Vessen believing in nine bells" },
          body: [p("Nine seats, one for each tower. Sets the bell tithe and pays the keepers.")],
        },
        {
          key: "key",
          kind: "entity",
          entityType: "Object",
          title: "Odran's key",
          properties: { owner: { note: "odran" }, location: { note: "belfry" }, significance: "Opens the Ninth Belfry" },
          body: [p("Iron, on a blackened cord. Planted in ", l("s-toll"), "; used in ", l("s-key"), ".")],
        },
        {
          key: "tolling",
          kind: "entity",
          entityType: "System",
          title: "The Tolling",
          properties: { source: "The eight true bells", limits: "Holds the tide a little less every year" },
          body: [p("Rung at dawn in order, first tower to ninth. While the toll is kept, the sea stays below the green line on the canal walls.")],
        },
      ],
    },
    {
      key: "secrets",
      kind: "folder",
      title: "Secrets",
      children: [
        {
          key: "secret-bell",
          kind: "note",
          title: "The ninth bell was never cast",
          reveal: "book1",
          body: [
            p("The founders' mould cracked. For forty years the ninth toll has been a bellows-horn, cranked by the Keeper in ", l("belfry"), "."),
            p("Eight bells hold most of the tide. It rises a finger a year."),
          ],
        },
        {
          key: "secret-pell",
          kind: "note",
          title: "Pell is the Chancellor's daughter",
          reveal: "book2",
          body: [p(l("pell"), " was given to the Reedgate boatmen as an infant, when ", l("orre"), " took her Council seat. Orre has watched her from the window ever since.")],
        },
        {
          key: "secret-tide",
          kind: "note",
          title: "Where the tide comes from",
          canon: "speculative",
          reveal: "book3",
          body: [
            p("The sea isn't rising. The city is sinking: the towers stand on the back of something that is slowly waking up."),
            p("Not settled. If this stays, the bells were never holding the water back; they were keeping it asleep."),
          ],
        },
        {
          key: "belief-bells",
          kind: "note",
          title: "Nine bells hold back the sea",
          layer: "belief",
          reveal: "book1",
          body: [p("What ", l("vessen"), " believes: nine bells, rung in order at dawn, keep the tide below the green line. The truth is ", l("secret-bell", "one bell short"), ".")],
        },
      ],
    },
    { key: "timeline", kind: "timeline", title: "Timeline of Vessen" },
  ],

  releases: [
    { key: "book1", title: "Book 1: The Ninth Bell", kind: "book", ships: "book1" },
    { key: "book2", title: "Book 2: The Rising Year", kind: "book", ships: "book2" },
    { key: "book3", title: "Book 3 (untitled)", kind: "book", notes: "Planned. Nothing drafted yet." },
  ],

  threads: [
    {
      key: "bell",
      name: "The silent bell",
      color: "#e2602a",
      cells: [
        { scene: "s-toll", note: "The ninth toll sounds wrong." },
        { scene: "s-market", note: "Pell's boats sit lower than the tables say." },
        { scene: "s-key", note: "Iselle finds the empty frame." },
        { scene: "s-owes", note: "Odran explains. The tide is rising." },
        { scene: "s-audience", note: "Orre wants a real ninth bell, cast in secret." },
      ],
    },
    {
      key: "friends",
      name: "Iselle and Pell",
      color: "#1971c2",
      cells: [
        { scene: "s-market", note: "Old friends. Pell trusts her boats over the Council." },
        { scene: "s-audience", note: "Orre watches Pell from the window." },
      ],
    },
  ],

  relationships: [
    { from: "odran", to: "iselle", type: "mentor", directed: true },
    { from: "iselle", to: "pell", type: "friend" },
    { from: "orre", to: "pell", type: "parent", label: "kept secret", directed: true },
    { from: "odran", to: "orre", type: "works-for", label: "reports the tide measures", directed: true },
  ],

  knowledge: [
    { character: "odran", secret: "secret-bell", note: "Has cranked the horn himself for twenty-three years." },
    { character: "orre", secret: "secret-bell", note: "Found out eleven years before the story starts." },
    { character: "iselle", secret: "secret-bell", learnedIn: "s-key" },
    { character: "orre", secret: "secret-pell" },
    { character: "pell", secret: "secret-pell", layer: "belief", note: "Believes her mother was a Reedgate boatwoman who drowned." },
  ],

  setups: [
    { kind: "chekhov", title: "The key Odran never uses", setup: "s-toll", payoff: "s-key", status: "paid" },
    { kind: "foreshadowing", title: "The ninth toll sounds flat", setup: "s-toll", payoff: "s-key", status: "paid", note: "Same words both times: “like a bell heard through a wall”." },
  ],

  events: [
    { title: "The Firstebb flood", date: "0412-01-08", description: "Three streets of the lower city under water. The Council blames a late toll.", thread: "bell" },
    { title: "Odran sends the spring measures", date: "0412-02-20", about: "odran", thread: "bell" },
    { title: "Highest spring tide in forty years", date: "0412-03-21", thread: "bell" },
    { title: "Odran steps down as Keeper", date: "0412-03-40", about: "odran" },
    { title: "Reckoning Day", date: "0412-05-01", description: "The tithe is counted and the nine towers are blessed." },
  ],

  // Iselle is the point of view of "Low Tide Market" and thinks about the secret
  // there, five days before "The Key", where she learns it.
  continuity: [{ rule: "knows-too-early", notes: ["s-market", "s-key", "secret-bell"] }],
};
