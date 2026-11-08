import type { Audience } from "@/lib/audiences";
import cursors from "../blog/shots/cowrite-cursors.webp";
import screen from "./shots/screen.webp";
import ai from "./shots/workspace-ai.webp";

export const selfHosters: Audience = {
  slug: "self-hosters",
  name: "Self-hosters",
  icon: "code-bold-duotone",
  title: "A self-hosted writing app, open source, on Docker",
  description:
    "Run Plotra on your own server: an open-source (AGPL) app for novels and worldbuilding, with live co-writing. One Docker Compose command, no plan limits.",
  headline: ["A writing app", "you run yourself."],
  intro:
    "Plotra is open source under the AGPL, and all of it runs on your own machine: the same app as the hosted version, every view and module, on your database, your file store and your backups. There are no plans to buy and no plan limits. Docker, a domain, TLS and upgrades are yours to look after.",
  summary: "AGPL, one Docker Compose command, every feature, no plan limits, and AI only on a model you choose.",
  hero: {
    src: screen,
    alt: "A project open on a scene: the ribbon on the left, then the binder, the scene in the middle, the inspector on the right and the status bar along the bottom",
  },
  pains: [
    {
      title: "Your novel on someone else's server",
      body: "Years of drafts in a service that can change its prices, its terms or its mind.",
    },
    {
      title: "Writing apps that don't self-host",
      body: "Finding one with live co-writing that you can also run yourself is harder than it should be.",
    },
    {
      title: "The good parts held back",
      body: "A community edition to host, and the features you wanted in the paid one.",
    },
  ],
  features: [
    {
      title: "One command to start",
      body: "Clone the repository, fill in the secrets and start the stack. It runs the app, the live collaboration server, Postgres and an S3-compatible file store, in order, with the database migrated before the app starts.",
      points: [
        "Docker with Compose v2.20 or newer",
        "About 2 GB of free memory to build, 1 GB to run",
        "Health checks for the app and the collab server",
      ],
      code: `git clone https://github.com/ItzSudhan/plotra.git
cd plotra/docker
cp .env.example .env
# fill the empty secrets in .env, then:
docker compose up -d --build`,
    },
    {
      title: "Live co-writing on your own server",
      body: "Named cursors, comments, suggestions, version history and sharing all work as they do on the hosted version. The bundled collab server keeps each note's live state and copies it to Postgres within seconds of an edit.",
      points: [
        "Workspace invitations and project sharing",
        "Email through your own SMTP, or links written to the log",
        "Sign-in with Google if you add the credentials",
      ],
      shot: {
        src: cursors,
        alt: "A scene open in the editor with a co-writer's selection highlighted under her name, and her avatar in the status bar",
      },
    },
    {
      title: "AI on a model you choose, or none",
      body: "AI is off until someone turns it on, and with it off no AI control is shown anywhere. Give the whole instance one model, let each person add their own key, or point it at a local model on the server.",
      points: [
        "A workspace switch and a project switch, both off by default",
        "Saved personal keys are encrypted with your secret",
        "No credits and nothing sent anywhere you didn't choose",
      ],
      shot: {
        src: ai,
        alt: "The AI tab of the workspace settings with Allow AI in this workspace switched off, and the three things that follow from switching it on",
      },
    },
    {
      title: "Back up and upgrade with plain tools",
      body: "Everything is in a Postgres database and a file store. Dump one, archive the other, and rehearse a restore. Upgrading is a pull and a rebuild, with migrations run before the new app starts.",
      points: [
        "pg_dump works while the stack is running",
        "Nightly dumps to a bucket, if you want them",
        "Or bring your own Postgres, such as Neon",
      ],
      code: `docker compose exec -T postgres pg_dump -U plotra -Fc plotra > plotra-$(date +%F).dump

git pull
docker compose up -d --build`,
    },
  ],
  table: {
    title: "Hosted and self-hosted, side by side",
    head: ["", "Hosted", "Self-hosted"],
    rows: [
      ["Price", "Free, or Pro at $10 a month per workspace", "Free, on your own server"],
      ["Views, modules and features", "All of them", "All of them"],
      ["Projects, storage and members", "Limited on Free, more on Pro", "No limit"],
      ["People one project is shared with", "5 on Free, 200 on Pro", "200"],
      ["AI", "Your own key or a local model; hosted AI on Pro", "Your own key, or one model for the whole instance"],
      ["Email and Google sign-in", "Included", "When you add SMTP and Google credentials"],
      ["Backups, upgrades and TLS", "Done for you", "Yours"],
    ],
    note: "Rate limits and fixed caps, such as the number of invitations an hour, are the same on every server. Only the plan limits are gone.",
  },
  steps: [
    {
      title: "Check the requirements",
      body: "Docker with Compose v2.20 or newer, git and openssl, and about 2 GB of free memory for the first build.",
    },
    {
      title: "Start the stack",
      body: "Copy the example settings, generate the secrets and run one compose command. The first run builds three images.",
    },
    {
      title: "Put it behind a proxy",
      body: "For anything but localhost, give it a domain and a reverse proxy that does TLS.",
    },
    {
      title: "Decide about email and AI",
      body: "Set SMTP_URL to send invitations, and choose whose model AI runs on, if anyone's.",
    },
    {
      title: "Back up before anyone writes",
      body: "Dump the database and archive the file store on a schedule, and restore one into a scratch instance once.",
    },
  ],
  tools: [],
  faq: [
    {
      q: "Is self-hosted Plotra free?",
      a: "Yes. Plotra is open source under the AGPL-3.0, and a server you run has no plans, nothing to pay Plotra and no plan limits on projects, storage or members. If you want to charge the people on your instance, plans can be switched on.",
    },
    {
      q: "What does it need to run?",
      a: "Docker with Compose v2.20 or newer, git and openssl, about 2 GB of free memory to build the app image and 1 GB to run the stack. For anything other than localhost, a domain and a reverse proxy that does TLS.",
    },
    {
      q: "Does live co-writing work when I host it myself?",
      a: "Yes. The compose file includes the collab server. It is one process on one machine: it can't be scaled out by running more copies, and it does no TLS itself, so put it behind your proxy.",
    },
    {
      q: "Can I use a local model for AI?",
      a: "Yes. Each person can point the agent at a local model, or the server can give everyone one model. For the server to call a model on your own network, set AI_ALLOW_PRIVATE_URLS=true.",
    },
    {
      q: "How do I upgrade?",
      a: "Back up the database, then git pull and docker compose up -d --build. Migrations run before the new app starts. There are no tagged releases yet, so read the commit log before upgrading.",
    },
    {
      q: "Can strangers sign up on my instance?",
      a: "Anyone who can reach it can make an account, with a workspace of their own that sees nothing of yours. If you don't want that, keep it off the internet or put your proxy's access control in front of it.",
    },
    {
      q: "What does the AGPL mean for me?",
      a: "You can run Plotra, change it and share it. If you change it and let other people use your changed version over a network, you must offer them its source too.",
    },
  ],
  guides: [],
  docs: { label: "Self-hosting with Docker, in the docs", path: "/docs/self-hosting" },
};
