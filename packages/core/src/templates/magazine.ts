/** "Ledger" — a blog-forward publication template with three sample articles. */
import { defineTemplate } from "./util";

export const magazineTemplate = defineTemplate({
  meta: {
    slug: "magazine",
    name: "Ledger",
    description: "A blog-forward publication: a short home page that sends readers straight to the archive, an about page with the editorial standards, a contact page, and three sample articles to publish against.",
  },
  settings: { siteTitle: "Ledger", tagline: "A weekly letter about the money side of small business" },
  design: {
    colors: { accent: "#b45309", background: "#fffbf5", foreground: "#1c1917", darkBackground: "#12100e", darkForeground: "#f5f0e8" },
    fonts: { heading: "source-serif", body: "ibm-plex-sans" },
    radius: 8,
  },
  menus: [
    {
      location: "header",
      name: "Header",
      items: [
        { label: "Home", href: "/" },
        { label: "Blog", href: "/blog" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
    { location: "footer", name: "Footer", items: [{ label: "About", href: "/about" }, { label: "Contact", href: "/contact" }] },
  ],
  pages: [
    {
      slug: "home",
      title: "Home",
      seo: { description: "Ledger is a weekly letter about the money side of running a small business — pricing, cash flow, taxes and the decisions in between." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Published every Thursday",
            headline: "The money side of small business, explained once a week",
            subheadline: "Ledger is a letter for people who run something small: one bakery, one studio, one three-person agency. Pricing, cash flow, tax and the decisions in between — written plainly, with the arithmetic left in.",
            buttons: [
              { label: "Read the blog", href: "/blog", variant: "primary" },
              { label: "About Ledger", href: "/about", variant: "secondary" },
            ],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## What you get\n\nOne piece a week, usually about 1,200 words, on a single decision a small business owner actually faces. Whether to raise prices. What to do when a large client pays late. How to read your own accounts without an accountant translating.\n\nEvery piece is written from real numbers — sometimes ours, more often a reader's, always with permission and usually anonymised. When we get something wrong we correct it at the top of the piece, in the same size type as everything else.\n\nThere is no premium tier, no course, and no affiliate link to accounting software. Ledger is funded by a handful of sponsors who never see a draft before publication, and by readers who chip in what they can.",
          },
        },
        {
          type: "cta",
          props: {
            style: "card",
            headline: "Start with the archive",
            body: "Three years of Thursdays, from cash-flow basics to the long piece about what a 40% price rise actually did.",
            buttons: [{ label: "Read the blog", href: "/blog", variant: "primary" }],
          },
        },
        {
          type: "faq",
          props: {
            headline: "About this publication",
            items: [
              { question: "Who writes Ledger?", answer: "Ledger is written by **Hannah Mbeki**, who spent nine years as a bookkeeper for restaurants and studios before writing full time, with a fortnightly column from **Owen Pryce**, a former tax inspector." },
              { question: "How often does it come out?", answer: "Every Thursday morning, UK time, except for two weeks in August. Long investigations occasionally arrive on a Monday, and they say so in the subject line." },
              { question: "Is it about a particular country's tax rules?", answer: "The examples are usually British, because that is where the writers work. The reasoning — pricing, margin, timing — travels; the specific thresholds do not, and we always say which is which." },
              { question: "Can I republish a piece?", answer: "Yes, for non-commercial use, with a link back and the author's name. Commercial syndication is fine too, but write to us first so we can agree terms." },
              { question: "How is it paid for?", answer: "Sponsorship, clearly labelled at the top of the piece, and reader contributions. No sponsor has ever seen a piece before publication and no piece has ever been changed at a sponsor's request." },
            ],
          },
        },
      ],
    },
    {
      slug: "about",
      title: "About",
      seo: { description: "Who writes Ledger, how pieces are researched and corrected, and how the publication pays for itself." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "About",
            headline: "A letter written by people who did the bookkeeping",
            subheadline: "Ledger exists because most business writing is either advice from people who have never run one, or software marketing wearing a cardigan.",
            buttons: [],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## The people\n\n**Hannah Mbeki** writes most of what you read here. She spent nine years keeping the books for restaurants, design studios and one very disorganised theatre company, which is where she learned that almost every business crisis is a timing problem wearing a costume.\n\n**Owen Pryce** writes the fortnightly tax column. He spent eleven years as an inspector and now spends his time explaining, patiently, that the rule you are worried about probably does not apply to you.\n\n**Sam Ortega** edits, checks the arithmetic, and is the reason the charts have labels.\n\n## How we work\n\nEvery piece with numbers in it is built from a spreadsheet we are willing to share. When a reader lends us their figures, we anonymise the business, round nothing that changes the conclusion, and send them the draft before it runs.\n\nCorrections go at the top of the piece, dated, in the same type as the article. We do not quietly edit a published page.\n\n## How it is funded\n\nOne sponsor a week, labelled at the top, and reader contributions. Sponsors buy a paragraph and nothing else — not a topic, not a mention, not an early look. If that ever changes, it will be announced here first.",
          },
        },
        {
          type: "stats",
          props: {
            headline: "Ledger in numbers",
            items: [
              { value: "3 yrs", label: "published without missing a Thursday" },
              { value: "148", label: "pieces in the archive" },
              { value: "21k", label: "readers on the list" },
              { value: "6", label: "corrections, all still visible" },
            ],
          },
        },
      ],
    },
    {
      slug: "contact",
      title: "Contact",
      seo: { description: "Pitch a piece, lend us your numbers, ask a question, or sponsor an issue of Ledger." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Contact",
            headline: "Questions, pitches and corrections",
            subheadline: "Reader questions are the source of about a third of what we publish, so please do send them.",
            buttons: [],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## Write to us\n\n**Questions** — [hello@ledger.press](mailto:hello@ledger.press). If it is a good question we may build a piece around it; we will always ask before quoting you, and anonymous is fine.\n\n**Pitches** — [pitches@ledger.press](mailto:pitches@ledger.press). Two paragraphs on the argument and one line on what makes you the person to make it. We pay £400 for a standard piece and more for anything requiring real reporting. We answer every pitch within two weeks.\n\n**Corrections** — [corrections@ledger.press](mailto:corrections@ledger.press), and thank you in advance. Point at the sentence.\n\n**Sponsorship** — [sponsor@ledger.press](mailto:sponsor@ledger.press) for the rate card. One sponsor per issue, no tracking pixels, no sponsor sees a draft.\n\n## Lending us your numbers\n\nThe most useful thing a reader can send is a real set of figures. We anonymise the business, keep the arithmetic honest, and show you the draft before it runs. Nothing is published without written agreement.",
          },
        },
        {
          type: "cta",
          props: {
            style: "card",
            headline: "New here?",
            body: "The archive is the best introduction. Start with the piece about raising prices — it is the one readers forward most.",
            buttons: [{ label: "Read the blog", href: "/blog", variant: "primary" }],
          },
        },
      ],
    },
  ],
  samplePosts: [
    {
      slug: "the-price-rise-you-keep-postponing",
      title: "The price rise you keep postponing",
      excerpt: "A bakery raised its prices 12% and lost four customers. Here is what the spreadsheet said would happen, and what actually did.",
      terms: [{ taxonomy: "category", name: "Pricing" }, { taxonomy: "tag", name: "margin" }],
      content: "Every owner I have worked with has a price rise they have been postponing for at least a year. The fear is always the same and it is always stated the same way: *we will lose customers*. That is true. The question nobody works out is how many you can afford to lose, and the answer is almost always a much larger number than the one you are afraid of.\n\nHere is the arithmetic. A bakery sells a loaf at £4.00 and it costs £2.60 in flour, energy and labour, so the margin is £1.40. Raise the price 12%, to £4.48, and the margin becomes £1.88 — a 34% increase on the money you actually keep. To be worse off, you would have to lose more than a quarter of your volume. A quarter. Not four regulars who make a point of telling you.\n\nThe bakery in question did it in March. Volume fell about 3% for six weeks and then came back, because the substitute was not a cheaper loaf, it was no loaf. Annual profit rose by just under £9,000 on the same ovens and the same hours.\n\nWork out your own break-even loss before you decide. Do it on paper, once, and the fear becomes a number you can argue with.",
    },
    {
      slug: "what-to-do-when-a-big-client-pays-late",
      title: "What to do when a big client pays late",
      excerpt: "Late payment is a cash-flow problem before it is a relationship problem. Fix it in that order.",
      terms: [{ taxonomy: "category", name: "Cash flow" }, { taxonomy: "tag", name: "invoicing" }],
      content: "A client who pays sixty days late is not a moral problem, they are a financing arrangement you did not agree to. Treat it that way and the conversation gets much easier.\n\nStart with the number. If your largest client owes you £18,000 on thirty-day terms and consistently pays at ninety, they are holding roughly £12,000 of your working capital at all times. That is the size of the overdraft you are running on their behalf, and it is what the conversation is about — not fairness, not respect.\n\nThen fix the mechanics, because most late payment is administrative rather than deliberate. Invoice on the day the work is delivered, not at month end. Put the purchase order number where their system expects it. Find out the actual payment run date, which is a real date in a real calendar, and get your invoice in before the cut-off. In agencies I have worked with, these three changes alone moved average payment in by about three weeks.\n\nOnly then escalate: a late payment fee written into the contract, staged invoicing on long projects, or a deposit. And know your own limit in advance. A client who costs you £12,000 of permanent overdraft at a 15% margin needs to be worth £80,000 a year before the arrangement makes sense.",
    },
    {
      slug: "reading-your-own-accounts-in-twenty-minutes",
      title: "Reading your own accounts in twenty minutes",
      excerpt: "Four numbers, once a month. You do not need to understand accounting to run a business well, but you do need these.",
      terms: [{ taxonomy: "category", name: "Fundamentals" }, { taxonomy: "tag", name: "bookkeeping" }],
      content: "You do not need to understand double-entry bookkeeping to run a small business. You do need four numbers, and you need them monthly rather than once a year when your accountant sends the accounts back.\n\n**Cash at bank, minus what you owe in the next thirty days.** This is the only number that can end your business quickly. Write it down every month; the direction matters more than the value.\n\n**Gross margin.** Sales minus the direct cost of delivering them, as a percentage. If it moves more than a couple of points between months, something changed in pricing or in what you are buying, and you want to know which while you can still remember.\n\n**Fixed costs per month.** Rent, salaries, software, insurance — everything that arrives whether you sell anything or not. Divide it by your gross margin percentage and you have the sales figure you must hit to break even. Most owners guess this number badly, usually low.\n\n**Debtor days.** The average time between invoicing and being paid. Rising debtor days are the earliest warning you get of a cash squeeze, and they rise months before the bank balance does.\n\nTwenty minutes, four numbers, once a month. Everything else your accountant can handle.",
    },
  ],
});
