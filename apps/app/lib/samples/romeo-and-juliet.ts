import { h2, l, p, revealedIn, type Sample } from "./types";

// Romeo and Juliet, the story the marketing site tells (apps/web's
// views/story.ts), as the opening of a novel: the same five scenes, chapters,
// places and threads, written out. Two parts, with one continuity slip left in
// on purpose (see `continuity` at the bottom).

export const romeoAndJuliet: Sample = {
  id: "romeo-and-juliet",
  title: "Romeo and Juliet",
  type: "novel",
  logline: "In a city split by two families' feud, a son of one and a daughter of the other marry in secret, and the secret outruns them.",
  open: "s-feast",

  notes: [
    {
      key: "part1",
      kind: "folder",
      title: "Part One: Violent Delights",
      synopsis: "They meet on Sunday, marry on Monday, and by Monday night Romeo is banished.",
      children: [
        {
          key: "p1c1",
          kind: "chapter",
          title: "Two Households",
          children: [
            {
              key: "s-feast",
              kind: "scene",
              title: "The Capulet Feast",
              synopsis: "Romeo comes masked to his enemy's feast, and sees Juliet.",
              properties: { pov: { note: "romeo" }, location: { note: "house" }, "story-date": "1303-07-14 19:00", duration: "3h" },
              body: [
                p(
                  "He had come masked, to a house where his name could get him killed, to look at another girl. Then ",
                  l("juliet", "Juliet"),
                  " crossed the hall, and ",
                  l("romeo", "Romeo"),
                  " forgot who he had come for.",
                ),
                p("The torches were lit early, and the hall of ", l("house"), " smelled of wax and roast kid. Mercutio had already found the wine. Benvolio had found the door, and stood near it."),
                p("“Who is she?” Romeo asked a serving man, who did not know, and then nobody, aloud: “She teaches the torches to burn bright.”"),
                p(
                  "Three paces off, ",
                  l("tybalt", "Tybalt"),
                  " turned his head. He knew a Montague by the voice, as a dog knows a fox, and he sent a boy for his sword. It was old Capulet who stopped him: not in my house, not tonight, not with the Prince's warning a day old.",
                ),
                p("Romeo saw none of it. He had crossed the floor and taken her hand, and she had let him, and they were talking nonsense about pilgrims and saints when ", l("nurse", "her nurse"), " came to fetch her."),
                p("“Her mother is the lady of the house,” the Nurse told him, pleased to be asked."),
                p("A Capulet. He stood where he was while the musicians packed up their viols. His life, he thought, was now a debt owed to his enemy."),
              ],
            },
            {
              key: "s-balcony",
              kind: "scene",
              title: "The Balcony",
              synopsis: "Juliet speaks to the night. Romeo, in the orchard below, answers.",
              properties: { pov: { note: "romeo" }, location: { note: "house" }, "story-date": "1303-07-15 00:00", duration: "1h" },
              body: [
                p(
                  "The orchard wall was high, and ",
                  l("romeo", "Romeo"),
                  " went over it anyway. Above him a window opened. “Wherefore art thou Romeo?” she asked the dark, and the dark answered.",
                ),
                p("“Who's there?” ", l("juliet", "Juliet"), " leaned out over the stone. “How did you get in? The walls are high, and if my kinsmen find you here they will kill you.”"),
                p("“With love's light wings,” he said, which was not an answer, and she laughed at him for it."),
                p("She had said too much to the night before she knew he was listening, and would not take it back. If he meant it, he was to send word tomorrow: where, and at what hour, and she would come."),
                p("“Juliet!” ", l("nurse", "The Nurse"), ", from inside. Twice she went in and twice she came back to the rail."),
                p(
                  "He dropped from the wall into the lane as the sky began to grey, laughing aloud at nothing. Let ",
                  l("tybalt", "Tybalt"),
                  " find him there if he liked. He was ",
                  l("secret-wedding", "a husband already, though no one could know it"),
                  ", and had every right to stand under his own wife's window.",
                ),
                p("He did not go home. He went to find ", l("friar"), " before the bell for morning prayer."),
              ],
            },
          ],
        },
        {
          key: "p1c2",
          kind: "chapter",
          title: "Violent Delights",
          children: [
            {
              key: "s-wedding",
              kind: "scene",
              title: "The Secret Wedding",
              synopsis: "Friar Laurence marries them, hoping it will end the feud.",
              properties: { pov: { note: "friar" }, location: { note: "cell" }, "story-date": "1303-07-15 14:00", duration: "1h" },
              body: [
                p(
                  l("friar", "Friar Laurence"),
                  " married them in his cell, with no witness but the herbs drying overhead. “These violent delights have violent ends,” he said, and joined their hands anyway.",
                ),
                p("He had known the boy since he was small enough to be lifted onto the garden wall, and had spent a year hearing about a girl called Rosaline. Yesterday it was Rosaline. Today it was this."),
                p("“Young men's love lies not in their hearts but in their eyes,” he had told him at dawn, and ", l("romeo", "Romeo"), " had only grinned."),
                p(
                  "But the Friar had buried men of both houses, and had run out of sermons about it. If a Montague and a Capulet were one flesh, then ",
                  l("feud"),
                  " had nowhere left to stand. It was a thin hope, and he had built on thinner.",
                ),
                p(l("juliet", "Juliet"), " came in out of the afternoon heat so lightly that she did not seem to tread on the flagstones. She had told her mother she was going to confession."),
                p("It was done in a quarter of an hour. Nobody rang a bell. He wrote nothing in the register, and that night he found he could not sleep for thinking of ", l("secret-wedding", "what he now had to keep"), "."),
              ],
            },
            {
              key: "s-duel",
              kind: "scene",
              title: "The Duel",
              synopsis: "Tybalt kills Mercutio. Romeo kills Tybalt, and is banished.",
              properties: { pov: { note: "romeo" }, location: { note: "square" }, "story-date": "1303-07-15 17:00", duration: "1h" },
              body: [
                p(l("tybalt", "Tybalt"), " came looking for him in ", l("square", "the market square"), ", and Romeo, an hour married, would not draw. Mercutio drew for him."),
                p("“I have more reason to love you than you can guess,” Romeo said, and meant ", l("secret-wedding", "the reason he could not give"), ". To Tybalt it sounded like a man laughing at him. To Mercutio it sounded worse: like surrender."),
                p("The day was hot, and the stones threw the heat back. Romeo stepped between the blades to part them, and Tybalt's point went in under his arm and found Mercutio."),
                p("“A scratch,” Mercutio said. Then: “A plague on both your houses.” He said it twice more before they carried him indoors, and he did not come out."),
                p("After that Romeo did not think at all. When he could think again Tybalt lay on the stones, the square was filling with people, and Benvolio was pulling at his sleeve and shouting at him to run."),
                p("The Prince came with the evening. He had promised death to the next man who broke the peace. For Mercutio's sake, who was his kinsman, he made it banishment: Romeo was to be out of ", l("verona"), " by daybreak, and dead if he was found in it after."),
              ],
            },
          ],
        },
      ],
    },
    {
      key: "part2",
      kind: "folder",
      title: "Part Two: Star-Crossed",
      synopsis: "The Friar's plan depends on one letter, and the letter does not arrive.",
      children: [
        {
          key: "p2c1",
          kind: "chapter",
          title: "Star-Crossed",
          children: [
            {
              key: "s-tomb",
              kind: "scene",
              title: "The Tomb",
              synopsis: "Romeo finds Juliet asleep, and believes she is dead.",
              properties: { pov: { note: "romeo" }, location: { note: "tomb" }, "story-date": "1303-07-18 22:00", duration: "2h" },
              body: [
                p(
                  "She lay in ",
                  l("tomb", "the Capulet tomb"),
                  " as if the colour had only just left her. ",
                  l("romeo", "Romeo"),
                  " did not know about ",
                  l("potion", "the potion"),
                  ". The letter had never reached him.",
                ),
                p("He had ridden from Mantua on the word of his own servant, who had seen her carried in, and he had stopped once on the way, at an apothecary's, for something quick."),
                p("He set the lantern down. Death had taken the breath out of her, he thought, and had not yet touched the rest: there was red in her lips still, and in her cheek. He did not ask himself why."),
                p("“Here will I remain,” he told her. He said goodbye with his eyes, and then with his arms, and then he drank."),
                p(
                  "The lantern was still burning when ",
                  l("friar", "the Friar"),
                  " came down the steps with a crowbar, half an hour too late, and when ",
                  l("juliet", "Juliet"),
                  " woke and found her husband's hand not yet cold.",
                ),
                p("By morning both families stood in the churchyard, with the Prince between them. “All are punished,” he said. Capulet gave Montague his hand across the two of them, and ", l("feud"), " was over."),
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
      reveal: "part1",
      children: [
        {
          key: "romeo",
          kind: "character",
          title: "Romeo Montague",
          aliases: ["Romeo"],
          synopsis: "Montague's only son. Falls in love at his enemy's feast.",
          properties: {
            role: "Protagonist",
            age: "17",
            arc: "From being in love with love to dying for one person",
            "first-appearance": { note: "s-feast" },
            "birth-date": "1286-03-02",
          },
          body: [
            h2("Who he is"),
            p("Only son of ", l("montague"), ". Quick to love and quicker to despair; a week ago it was a girl called Rosaline."),
            h2("Wants and needs"),
            p("Wants ", l("juliet"), ", at once and whatever it costs. Needs one day's patience, and never has it."),
            p("Kills ", l("tybalt"), " in ", l("s-duel"), " and is banished to Mantua."),
            revealedIn("part2", p("Dies in ", l("tomb"), ", by poison, beside a wife he believes is dead.")),
          ],
        },
        {
          key: "juliet",
          kind: "character",
          title: "Juliet Capulet",
          aliases: ["Juliet"],
          synopsis: "Capulet's only daughter, not yet fourteen. More practical than Romeo, and braver.",
          properties: {
            role: "Protagonist",
            age: "13",
            arc: "From obedient daughter to the one who decides",
            "first-appearance": { note: "s-feast" },
            "birth-date": "1289-07-31",
          },
          body: [
            h2("Who she is"),
            p("Only daughter of ", l("capulet"), ", raised by ", l("nurse"), ". Her father means her for Count Paris."),
            h2("Wants and needs"),
            p("Wants the marriage to be real: a time, a place, a priest. It is she who asks for them, in ", l("s-balcony"), "."),
            revealedIn("part2", p("Takes ", l("potion"), " on Tuesday night rather than marry Paris. See ", l("secret-sleep"), ".")),
          ],
        },
        {
          key: "tybalt",
          kind: "character",
          title: "Tybalt",
          synopsis: "Juliet's cousin. Keeps the feud alive when the old men are tired of it.",
          properties: { role: "Antagonist", age: "20", arc: "Looks for a fight until he finds one" },
          body: [
            h2("Who he is"),
            p("Nephew of Lady Capulet, and the best sword in ", l("verona"), ". To him ", l("feud"), " is not a quarrel but a creed."),
            h2("Voice"),
            p("Formal, cold, and never joking. Calls people “boy”."),
            p("Knows Romeo's voice at the feast (", l("s-feast"), "); dies by his hand in ", l("s-duel"), "."),
          ],
        },
        {
          key: "nurse",
          kind: "character",
          title: "The Nurse",
          aliases: ["Nurse"],
          synopsis: "Raised Juliet. Carries the messages, and cannot keep to the point.",
          properties: { role: "Supporting", age: "50", arc: "Helps the marriage happen, then advises against it" },
          body: [
            h2("Who she is"),
            p("Has looked after ", l("juliet"), " since she was weaned. Talks for three people and loves a secret."),
            p("Takes Juliet's message to Romeo, and brings back the hour of the wedding."),
          ],
        },
        {
          key: "friar",
          kind: "character",
          title: "Friar Laurence",
          aliases: ["the Friar"],
          synopsis: "Franciscan, herbalist, confessor to both houses. Every plan in the story is his.",
          properties: { role: "Supporting", age: "55", arc: "Means well, and is too clever by half" },
          body: [
            h2("Who he is"),
            p("Keeps a herb garden behind ", l("cell", "his cell"), " and knows what each plant cures and what it kills."),
            p("Marries them in ", l("s-wedding"), ", hoping to end ", l("feud"), ". Keeps ", l("secret-wedding", "the secret"), " from both families."),
            revealedIn("part2", p("Gives Juliet ", l("potion"), " and writes to Romeo in Mantua. The letter is turned back at the city gate.")),
          ],
        },
      ],
    },
    {
      key: "places",
      kind: "folder",
      title: "Places",
      reveal: "part1",
      children: [
        {
          key: "verona",
          kind: "location",
          title: "Verona",
          synopsis: "A walled city on the Adige, ruled by Prince Escalus.",
          properties: { type: "City" },
          body: [h2("Description"), p("A walled city on the Adige. Rich, hot in July, and split down the middle by ", l("feud"), ". The Prince has promised death to the next man who draws a sword in its streets.")],
        },
        {
          key: "house",
          kind: "location",
          title: "Capulet's house",
          properties: { type: "Building", region: { note: "verona" } },
          body: [h2("Description"), p("A great hall for feasts, and an orchard behind it with a high wall. Juliet's window looks out over the orchard.")],
        },
        {
          key: "cell",
          kind: "location",
          title: "Friar Laurence's cell",
          properties: { type: "Building", region: { note: "verona" } },
          body: [h2("Description"), p("One room at the Franciscan house, with a garden behind it. Herbs dry from the rafters. Both families come here for confession.")],
        },
        {
          key: "square",
          kind: "location",
          title: "The market square",
          properties: { type: "Other", region: { note: "verona" } },
          body: [h2("Description"), p("The open heart of ", l("verona"), ", and the place where the two households cannot avoid each other. No shade after noon.")],
        },
        {
          key: "tomb",
          kind: "location",
          title: "The Capulet tomb",
          properties: { type: "Building", region: { note: "verona" } },
          body: [
            h2("Description"),
            p("The family vault, in the churchyard of St Peter's. ", l("tybalt"), " is laid here on Tuesday."),
            revealedIn("never", p("Working note: decide whether Paris is at the tomb in this version. He is in the play, and it costs a page.")),
          ],
        },
      ],
    },
    {
      key: "world",
      kind: "folder",
      title: "World",
      reveal: "part1",
      children: [
        {
          key: "feud",
          kind: "note",
          title: "The feud",
          body: [
            p("Between ", l("capulet"), " and ", l("montague"), ". Nobody alive remembers how it started. It has broken out in the streets three times this year."),
            p("The servants fight because the masters do, and the young men fight because they are bored."),
          ],
        },
        {
          key: "capulet",
          kind: "entity",
          entityType: "Faction",
          title: "House Capulet",
          aliases: ["the Capulets"],
          properties: { kind: "Family", base: { note: "house" }, goal: "Marry Juliet to Count Paris" },
          body: [p("Old Capulet, Lady Capulet, their daughter ", l("juliet"), " and her cousin ", l("tybalt"), ".")],
        },
        {
          key: "montague",
          kind: "entity",
          entityType: "Faction",
          title: "House Montague",
          aliases: ["the Montagues"],
          properties: { kind: "Family", goal: "Keep Romeo out of the quarrel" },
          body: [p("Old Montague, Lady Montague, their son ", l("romeo"), " and his cousin Benvolio.")],
        },
        {
          key: "potion",
          kind: "entity",
          entityType: "Object",
          title: "The potion",
          reveal: "part2",
          properties: { owner: { note: "friar" }, location: { note: "cell" }, significance: "Forty-two hours of a sleep that looks like death" },
          body: [p("Distilled by ", l("friar"), " from his own garden. The drinker goes cold and stops breathing, to all appearances, for two and forty hours, and then wakes as from a sleep.")],
        },
      ],
    },
    {
      key: "secrets",
      kind: "folder",
      title: "Secrets",
      children: [
        {
          key: "secret-wedding",
          kind: "note",
          title: "Married in secret",
          reveal: "part1",
          body: [
            p(l("romeo"), " and ", l("juliet"), " are husband and wife, married by ", l("friar"), " on Monday afternoon. Neither family knows."),
            p("It is why Romeo will not fight Tybalt, and why Juliet cannot marry Paris."),
          ],
        },
        {
          key: "secret-sleep",
          kind: "note",
          title: "Juliet is only asleep",
          reveal: "part2",
          body: [p("The body the Capulets carry to ", l("tomb"), " on Wednesday is alive. ", l("potion"), " wears off on Thursday night. Only the Friar and Juliet know.")],
        },
        {
          key: "secret-letter",
          kind: "note",
          title: "What if the letter arrives",
          canon: "speculative",
          reveal: "part3",
          body: [
            p("Friar John gets out of the quarantined house a day sooner, and Romeo reads the plan in Mantua before his servant reaches him."),
            p("Not settled. If this stays, Part Three is the two of them in exile, and the feud has to end some other way."),
          ],
        },
        {
          key: "belief-dead",
          kind: "note",
          title: "Juliet died on her wedding morning",
          layer: "belief",
          reveal: "part2",
          body: [p("What ", l("verona"), " believes: Juliet was found dead in her bed on the morning she was to marry Paris. The truth is ", l("secret-sleep", "that she is asleep"), ".")],
        },
      ],
    },
    { key: "timeline", kind: "timeline", title: "Timeline of Verona" },
  ],

  releases: [
    { key: "part1", title: "Part 1: Violent Delights", kind: "book", ships: "part1" },
    { key: "part2", title: "Part 2: Star-Crossed", kind: "book", ships: "part2" },
    { key: "part3", title: "Part 3 (untitled)", kind: "book", notes: "Planned. Nothing drafted yet." },
  ],

  threads: [
    {
      key: "feud",
      name: "The feud",
      color: "#e2602a",
      closedIn: "s-tomb",
      cells: [
        { scene: "s-feast", note: "Tybalt knows Romeo's voice and calls for his sword." },
        { scene: "s-wedding", note: "The Friar hopes a marriage will end it." },
        { scene: "s-duel", note: "Tybalt kills Mercutio. Romeo kills Tybalt." },
        { scene: "s-tomb", note: "The families find them, and make peace." },
      ],
    },
    {
      key: "lovers",
      name: "Romeo and Juliet",
      color: "#1971c2",
      cells: [
        { scene: "s-feast", note: "They meet, and learn each other's names too late." },
        { scene: "s-balcony", note: "They swear to marry tomorrow." },
        { scene: "s-wedding", note: "Married, and nobody can know." },
        { scene: "s-duel", note: "Romeo is banished on his wedding day." },
        { scene: "s-tomb", note: "Romeo finds her asleep and thinks her dead." },
      ],
    },
  ],

  relationships: [
    { from: "romeo", to: "juliet", type: "love", label: "married in secret" },
    { from: "tybalt", to: "juliet", type: "family", label: "cousins" },
    { from: "romeo", to: "tybalt", type: "enemy" },
    { from: "friar", to: "romeo", type: "mentor", directed: true },
    { from: "nurse", to: "juliet", type: "works-for", label: "raised her", directed: true },
  ],

  knowledge: [
    { character: "friar", secret: "secret-wedding", note: "Performed it himself, and wrote nothing in the register." },
    { character: "romeo", secret: "secret-wedding", learnedIn: "s-wedding" },
    { character: "juliet", secret: "secret-wedding", learnedIn: "s-wedding" },
    { character: "nurse", secret: "secret-wedding", note: "Carried the message that set the hour." },
    { character: "friar", secret: "secret-sleep", note: "It is his plan." },
    { character: "juliet", secret: "secret-sleep" },
    { character: "romeo", secret: "secret-sleep", layer: "belief", note: "Believes she is dead. The Friar's letter never reached him." },
  ],

  setups: [
    { kind: "chekhov", title: "Tybalt knows Romeo's voice", setup: "s-feast", payoff: "s-duel", status: "paid" },
    { kind: "foreshadowing", title: "“These violent delights have violent ends”", setup: "s-wedding", payoff: "s-tomb", status: "paid", note: "The Friar says it as he marries them." },
  ],

  events: [
    { title: "The Prince's warning", date: "1303-07-14", description: "After a brawl in the square: the next man to break the peace pays with his life.", thread: "feud" },
    { title: "Capulet promises Juliet to Paris", date: "1303-07-15", about: "juliet" },
    { title: "Juliet drinks the potion", date: "1303-07-16", about: "juliet", thread: "lovers" },
    { title: "The Friar's letter is turned back", date: "1303-07-17", description: "Friar John is shut in a house under quarantine and never leaves for Mantua.", about: "friar", thread: "lovers" },
  ],

  // Romeo is the point of view of "The Balcony" and thinks of himself as married
  // there, the night before "The Secret Wedding", where he is.
  continuity: [{ rule: "knows-too-early", notes: ["s-balcony", "s-wedding", "secret-wedding"] }],
};
