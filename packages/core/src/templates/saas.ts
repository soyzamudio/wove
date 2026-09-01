/** "Lift" — a four-page SaaS landing site for a fictional deploy-observability product. */
import { defineTemplate, wordmark } from "./util";

export const saasTemplate = defineTemplate({
  meta: {
    slug: "saas",
    name: "Lift",
    description: "A four-page SaaS landing site: product home, pricing tiers, about and contact. Blue and confident, built for a product that sells itself above the fold.",
  },
  settings: { siteTitle: "Lift", tagline: "Know what your last deploy actually changed" },
  design: {
    colors: { accent: "#2563eb", background: "#ffffff", foreground: "#18181b", darkBackground: "#0a0a0a", darkForeground: "#f4f4f5" },
    fonts: { heading: "inter", body: "inter" },
    radius: 12,
  },
  menus: [
    {
      location: "header",
      name: "Header",
      items: [
        { label: "Home", href: "/" },
        { label: "Pricing", href: "/pricing" },
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
      seo: { description: "Lift watches every release and tells your team what moved — error rates, latency and the customers affected — in the two minutes after you ship." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "split",
            eyebrow: "Deploy with evidence",
            headline: "Know what your last deploy actually changed",
            subheadline: "Lift watches every release and reports what moved — error rates, latency, and the customers affected — in the two minutes after you ship. No dashboard archaeology, no waiting for a support ticket to tell you.",
            buttons: [
              { label: "See pricing", href: "/pricing", variant: "primary" },
              { label: "Talk to us", href: "/contact", variant: "secondary" },
            ],
          },
        },
        {
          type: "logos",
          props: {
            headline: "Shipping on Lift every day",
            logos: [
              { url: wordmark("NORTHWIND"), alt: "Northwind" },
              { url: wordmark("Kestrel"), alt: "Kestrel" },
              { url: wordmark("MERIDIAN"), alt: "Meridian Labs" },
              { url: wordmark("Bellrock"), alt: "Bellrock" },
              { url: wordmark("HALYARD"), alt: "Halyard" },
            ],
          },
        },
        {
          type: "features",
          props: {
            headline: "Everything that happens after git push",
            intro: "Lift sits between your CI pipeline and your production signals. It knows which commit went out, when it finished rolling, and what changed on the other side of it.",
            columns: 3,
            items: [
              { icon: "git-compare", title: "Release diffs, not dashboards", body: "Every deploy gets a page: the commits it carried, the config it changed, and the metrics that moved against the previous release." },
              { icon: "activity", title: "Regression detection", body: "Lift compares the ten minutes after a release to the same window before it and flags the endpoints that got slower or noisier." },
              { icon: "users", title: "Blast radius", body: "See which accounts hit the new errors, how many requests they made, and whether they retried — before support does." },
              { icon: "rotate-ccw", title: "One-click rollback", body: "When a release goes wrong, roll back from the same page that told you, and Lift verifies the metrics came back." },
              { icon: "bell", title: "Alerts that name a commit", body: "Pages arrive with the suspect release attached, so the on-call engineer starts with a change list instead of a graph." },
              { icon: "plug", title: "Fits your pipeline", body: "GitHub Actions, GitLab CI, Buildkite and a plain webhook. Metrics from Prometheus, Datadog or OpenTelemetry." },
            ],
          },
        },
        {
          type: "stats",
          props: {
            headline: "What teams see in the first month",
            items: [
              { value: "4 min", label: "median time to spot a bad release" },
              { value: "63%", label: "fewer rollbacks after the fact" },
              { value: "18k", label: "deploys watched each week" },
              { value: "9 min", label: "average setup time" },
            ],
          },
        },
        {
          type: "testimonials",
          props: {
            headline: "From teams who ship on Fridays again",
            items: [
              { quote: "We used to find out about a bad deploy from a customer email. Now the release page tells us which endpoint got slower before the queue backs up.", name: "Dana Okoye", role: "Platform lead, Northwind" },
              { quote: "The blast radius view ended an argument we'd been having for a year. It's forty accounts, it's always been forty accounts, and now we can name them.", name: "Marco Vidal", role: "Engineering manager, Kestrel" },
              { quote: "Setup was one workflow step and an API key. The first regression it caught paid for the year.", name: "Priya Raman", role: "Staff engineer, Meridian Labs" },
            ],
          },
        },
        {
          type: "cta",
          props: {
            style: "dark",
            headline: "See your next deploy clearly",
            body: "Start on the free tier, connect one service, and watch your next release land with numbers attached.",
            buttons: [
              { label: "See pricing", href: "/pricing", variant: "primary" },
              { label: "Book a walkthrough", href: "/contact", variant: "secondary" },
            ],
          },
        },
      ],
    },
    {
      slug: "pricing",
      title: "Pricing",
      seo: { description: "Three plans for Lift: a free tier for one service, Team for growing engineering orgs, and Scale for regulated and high-volume deployments." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Pricing",
            headline: "Priced per service, not per seat",
            subheadline: "Invite the whole company. You pay for the services Lift watches, and nothing changes when your team grows.",
            buttons: [{ label: "Talk to sales", href: "/contact", variant: "secondary" }],
          },
        },
        {
          type: "columns",
          props: {
            columns: [
              {
                markdown: "### Solo\n\n**Free** forever\n\nFor one service and one engineer who wants their deploys to stop being a mystery.\n\n- 1 service\n- 7 days of release history\n- Regression detection\n- Email alerts\n- Community support\n\n[Start free](/contact)",
              },
              {
                markdown: "### Team\n\n**$40** per service / month\n\nFor engineering teams shipping several times a day across a handful of services.\n\n- Unlimited services\n- 90 days of release history\n- Blast radius by account\n- One-click rollback\n- Slack and PagerDuty alerts\n- Priority support\n\n[Start a trial](/contact)",
              },
              {
                markdown: "### Scale\n\n**Custom** annual\n\nFor larger orgs with audit requirements and traffic that spikes on purpose.\n\n- Everything in Team\n- 2 years of release history\n- SSO and SCIM\n- Audit export and data residency\n- Self-hosted collector\n- Named support engineer\n\n[Contact us](/contact)",
              },
            ],
          },
        },
        {
          type: "faq",
          props: {
            headline: "Questions about billing",
            items: [
              { question: "What counts as a service?", answer: "One deployable unit — an API, a worker, a frontend. Staging and preview environments of the same service are included free." },
              { question: "Do you charge per seat?", answer: "No. Invite everyone, including support and product. Pricing only tracks the number of production services Lift watches." },
              { question: "What happens when I go over?", answer: "Nothing breaks. We show the new service on your next invoice and email you before it lands, so a burst of microservices is never a surprise." },
              { question: "Can I cancel mid-month?", answer: "Yes. Plans are month to month and we refund the unused remainder of the period, no email thread required." },
              { question: "Do you offer a discount for non-profits?", answer: "Registered non-profits and student projects get the Team plan free for up to five services. Write to us and mention your organisation." },
            ],
          },
        },
        {
          type: "cta",
          props: {
            style: "card",
            headline: "Not sure which plan fits?",
            body: "Tell us how many services you run and how often you deploy. We will tell you what it costs in one reply, without a call.",
            buttons: [{ label: "Ask us", href: "/contact", variant: "primary" }],
          },
        },
      ],
    },
    {
      slug: "about",
      title: "About",
      seo: { description: "Lift is built by a small team of platform engineers who got tired of learning about bad releases from customers." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "About Lift",
            headline: "Built by people who carried the pager",
            subheadline: "We spent a decade on platform teams, correlating deploy timestamps against graphs by hand. Lift is the tool we kept describing to each other at 2am.",
            buttons: [],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## Why we started\n\nEvery team we worked on had the same ritual. Something feels wrong, someone opens three dashboards, someone else scrolls the deploy channel, and twenty minutes later a name appears next to a commit hash. The information was always there. It was never in one place, and it was never there when it mattered.\n\nLift began as an internal script that annotated a metrics dashboard with release markers. It turned out that the markers were the product. Once you can see the boundary between one release and the next, most incidents stop being investigations and start being decisions.\n\n## How we work\n\nWe are eight people across four time zones, funded by revenue and one seed round. We publish an incident report for every outage we cause, we do not run a sales team, and the person who answers your support email is the person who wrote the code.\n\nWe try to keep the product small. Lift will never be an all-in-one observability suite — there are good ones already, and we integrate with them. Our scope is the release: what went out, what moved, and what to do about it.",
          },
        },
        {
          type: "stats",
          props: {
            headline: "The company, in numbers",
            items: [
              { value: "2021", label: "year we started" },
              { value: "8", label: "people on the team" },
              { value: "4", label: "time zones" },
              { value: "100%", label: "of incidents written up publicly" },
            ],
          },
        },
      ],
    },
    {
      slug: "contact",
      title: "Contact",
      seo: { description: "Talk to the Lift team about pricing, a trial, or a walkthrough of your deploy pipeline." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Contact",
            headline: "Talk to an engineer, not a funnel",
            subheadline: "Whoever answers can read your pipeline config and tell you whether Lift will help. If it will not, we will say so.",
            buttons: [],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## Get in touch\n\n**Sales and trials** — [hello@liftdeploys.com](mailto:hello@liftdeploys.com). Tell us how many services you run and which CI system you use; we reply within one business day.\n\n**Support** — [support@liftdeploys.com](mailto:support@liftdeploys.com), or the Slack Connect channel we open with every Team account. Weekdays 08:00–20:00 UTC, with an on-call rotation for Scale customers.\n\n**Security** — [security@liftdeploys.com](mailto:security@liftdeploys.com) for vulnerability reports. We acknowledge within 24 hours and we pay bounties.\n\n## Where we are\n\nLift is a remote company registered in Lisbon, Portugal. There is no office to visit, but we are usually at the platform engineering meetups in Lisbon, Berlin and Toronto, and we are happy to buy the coffee.",
          },
        },
        {
          type: "cta",
          props: {
            style: "card",
            headline: "Prefer to see it working first?",
            body: "Read the plans, pick the one that looks right, and start a trial without talking to anybody.",
            buttons: [{ label: "See pricing", href: "/pricing", variant: "primary" }],
          },
        },
      ],
    },
  ],
});
