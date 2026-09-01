/** "Atelier" — a portfolio site for a fictional two-person design studio. */
import { defineTemplate, tile } from "./util";

const work = (bg: string, fg: string, shape: string, alt: string) => ({ url: tile(bg, fg, shape), alt });

export const portfolioTemplate = defineTemplate({
  meta: {
    slug: "portfolio",
    name: "Atelier",
    description: "A quiet portfolio for a studio or freelancer: a gallery-led home, a work page, an about with numbers, and a contact page. Serif headlines, near-black accent, sharp corners.",
  },
  settings: { siteTitle: "Atelier", tagline: "A design studio for considered brands" },
  design: {
    colors: { accent: "#18181b", background: "#fafaf9", foreground: "#18181b", darkBackground: "#0c0a09", darkForeground: "#f5f5f4" },
    fonts: { heading: "playfair", body: "system" },
    radius: 4,
  },
  menus: [
    {
      location: "header",
      name: "Header",
      items: [
        { label: "Home", href: "/" },
        { label: "Work", href: "/work" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
    { location: "footer", name: "Footer", items: [{ label: "Work", href: "/work" }, { label: "Contact", href: "/contact" }] },
  ],
  pages: [
    {
      slug: "home",
      title: "Home",
      seo: { description: "Atelier is a two-person design studio working on identity, packaging and print for food, hospitality and cultural clients." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Identity, packaging, print",
            headline: "Careful work for brands that intend to last",
            subheadline: "Atelier is a two-person studio in Porto. We take on six projects a year and give each of them the time an identity actually needs.",
            buttons: [
              { label: "See the work", href: "/work", variant: "primary" },
              { label: "Start a project", href: "/contact", variant: "secondary" },
            ],
          },
        },
        {
          type: "gallery",
          props: {
            columns: 3,
            images: [
              work("#e7e5e4", "#292524", '<circle cx="400" cy="300" r="150" fill="FG"/>', "Marca — identity for a Douro wine cooperative"),
              work("#292524", "#e7e5e4", '<rect x="180" y="140" width="440" height="320" fill="FG"/>', "Quinta — packaging for a small-batch olive oil"),
              work("#d6d3d1", "#1c1917", '<path d="M200 460 L400 140 L600 460 Z" fill="FG"/>', "Bienal — wayfinding for a contemporary art biennial"),
              work("#f5f5f4", "#78716c", '<rect x="140" y="200" width="520" height="60" fill="FG"/><rect x="140" y="320" width="330" height="60" fill="FG"/>', "Comum — editorial system for a neighbourhood newspaper"),
              work("#1c1917", "#a8a29e", '<circle cx="300" cy="300" r="110" fill="FG"/><circle cx="520" cy="300" r="110" fill="FG"/>', "Duplo — brand for a two-room guesthouse"),
              work("#e7e5e4", "#57534e", '<rect x="120" y="120" width="240" height="360" fill="FG"/><rect x="440" y="240" width="240" height="240" fill="FG"/>', "Praça — signage for a covered market"),
            ],
          },
        },
        {
          type: "testimonials",
          props: {
            headline: "What clients say afterwards",
            items: [
              { quote: "They asked harder questions in the first week than our last agency asked in six months. The identity we ended up with is the one we can actually run ourselves.", name: "Inês Carvalho", role: "Founder, Quinta do Vale" },
              { quote: "Six months on, the guidelines still answer every question our printers ask. That is the whole review.", name: "Tomás Beja", role: "Director, Bienal do Porto" },
            ],
          },
        },
        {
          type: "cta",
          props: {
            style: "plain",
            headline: "We take on six projects a year",
            body: "Two of next year's slots are still open. If you are planning an identity, packaging line or a book, tell us about it early.",
            buttons: [
              { label: "Start a project", href: "/contact", variant: "primary" },
              { label: "Browse the work", href: "/work", variant: "secondary" },
            ],
          },
        },
      ],
    },
    {
      slug: "work",
      title: "Work",
      seo: { description: "Selected identity, packaging, editorial and signage projects from Atelier, with a note on how the studio works." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Selected projects",
            headline: "Six projects a year, chosen carefully",
            subheadline: "A cross-section of recent work: identities, packaging systems, an editorial redesign and one very large set of signs.",
            buttons: [],
          },
        },
        {
          type: "gallery",
          props: {
            columns: 2,
            images: [
              work("#292524", "#e7e5e4", '<rect x="180" y="140" width="440" height="320" fill="FG"/>', "Quinta — packaging system for a small-batch olive oil, 2024"),
              work("#e7e5e4", "#292524", '<circle cx="400" cy="300" r="150" fill="FG"/>', "Marca — identity for a Douro wine cooperative, 2024"),
              work("#d6d3d1", "#1c1917", '<path d="M200 460 L400 140 L600 460 Z" fill="FG"/>', "Bienal — wayfinding and print for a contemporary art biennial, 2023"),
              work("#f5f5f4", "#78716c", '<rect x="140" y="200" width="520" height="60" fill="FG"/><rect x="140" y="320" width="330" height="60" fill="FG"/>', "Comum — editorial system for a neighbourhood newspaper, 2023"),
            ],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## How a project runs\n\n**Weeks 1–2 — Reading.** We sit with whatever exists: the packaging, the invoices, the way the phone is answered. Most identity problems are description problems, and they are visible before any design begins.\n\n**Weeks 3–6 — Drawing.** Two directions, developed far enough to be judged honestly. No mood boards presented as work, no third option added to make the second look better.\n\n**Weeks 7–10 — Building.** Type, colour, layout rules, and the artwork your suppliers need. Everything is delivered as files you own, in formats a printer will accept without a phone call.\n\n**Afterwards.** A written guide of about twenty pages, and an open line for a year. When a new format comes up, ask us; small extensions are on the house.\n\n## What it costs\n\nAn identity with a basic applications set starts around €14,000. Packaging lines and signage are quoted per project. We invoice in three parts and we do not work on speculation, ever.",
          },
        },
      ],
    },
    {
      slug: "about",
      title: "About",
      seo: { description: "Atelier is Rita Sousa and Nuno Ferreira, a two-person design studio in Porto working on identity, packaging and print since 2016." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "split",
            eyebrow: "About the studio",
            headline: "Two people, one room, a shared printer",
            subheadline: "Atelier is Rita Sousa and Nuno Ferreira. We founded the studio in 2016 after a decade between us at larger agencies, and we have kept it deliberately small.",
            buttons: [{ label: "Work with us", href: "/contact", variant: "primary" }],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## The two of us\n\n**Rita** draws. Type, marks, packaging structures, and the kind of grid that survives contact with a client's own team. She taught typography at ESAD for four years and still marks the odd portfolio.\n\n**Nuno** writes and organises. Naming, tone, the research that makes a brief honest, and the production management that keeps a print run on schedule.\n\nThere is no third person and no junior doing the real work at night. If you hire Atelier, the people in the first meeting are the people in the last one.\n\n## What we believe\n\nGood identity work is mostly editing. The interesting decisions are about what to leave out, what to keep doing for ten years, and what a small team can maintain without a designer on staff. We would rather deliver one system a client can run than five directions they will admire and abandon.\n\nWe work in Portuguese and English, mostly with food, hospitality and cultural clients, and we travel for the first meeting whenever the project makes it sensible.",
          },
        },
        {
          type: "stats",
          props: {
            headline: "Since 2016",
            items: [
              { value: "48", label: "projects completed" },
              { value: "6", label: "projects a year, on purpose" },
              { value: "2", label: "people, still" },
              { value: "9", label: "clients who came back" },
            ],
          },
        },
      ],
    },
    {
      slug: "contact",
      title: "Contact",
      seo: { description: "Enquire about a project with Atelier — identity, packaging, editorial and signage, from a two-person studio in Porto." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Contact",
            headline: "Tell us what you are making",
            subheadline: "A paragraph is enough to start. We reply to every enquiry, including the ones we cannot take.",
            buttons: [],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## Enquiries\n\nWrite to [studio@atelier.pt](mailto:studio@atelier.pt) with roughly what you need, when you need it, and what you have budgeted. Those three lines let us answer properly instead of arranging a call to find them out.\n\nWe usually reply within two working days. If we are full, we will say so in the first reply and suggest two other studios we trust.\n\n## Visiting\n\nRua de Santa Catarina 340, 4000-446 Porto. Second floor, the door with no sign on it. Come by appointment — the studio is often empty because one of us is at a printer in Guimarães.\n\n**Phone** +351 220 000 000, weekdays 10:00–18:00.\n\n## Working together remotely\n\nHalf our clients are outside Portugal and we have never found it a problem. Expect one video call a week, written notes after each one, and files where you can find them.",
          },
        },
        {
          type: "cta",
          props: {
            style: "plain",
            headline: "Have a look first",
            body: "The work page has four recent projects and a plain description of how a project actually runs.",
            buttons: [{ label: "See the work", href: "/work", variant: "primary" }],
          },
        },
      ],
    },
  ],
});
