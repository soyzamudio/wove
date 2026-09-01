/** "Corner" — a neighbourhood café site: home, menu, about, contact. */
import { defineTemplate } from "./util";

export const localBusinessTemplate = defineTemplate({
  meta: {
    slug: "local-business",
    name: "Corner",
    description: "A warm site for a café, shop or studio with a street address: a full-bleed home page, a menu page, an about page and the practical details customers actually look for.",
  },
  settings: { siteTitle: "Corner", tagline: "Coffee, bread and a table to sit at — Mill Street since 2014" },
  design: {
    colors: { accent: "#15803d", background: "#fdfcf8", foreground: "#1c1917", darkBackground: "#0f1210", darkForeground: "#f0f4f0" },
    fonts: { heading: "lora", body: "system" },
    radius: 16,
  },
  menus: [
    {
      location: "header",
      name: "Header",
      items: [
        { label: "Home", href: "/" },
        { label: "Menu", href: "/menu" },
        { label: "About", href: "/about" },
        { label: "Contact", href: "/contact" },
      ],
    },
    { location: "footer", name: "Footer", items: [{ label: "Menu", href: "/menu" }, { label: "Contact", href: "/contact" }] },
  ],
  pages: [
    {
      slug: "home",
      title: "Home",
      seo: { description: "Corner is a café and bakery on Mill Street: coffee roasted in the county, bread baked overnight, and a room you are welcome to sit in all morning." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "background",
            eyebrow: "Mill Street, since 2014",
            headline: "Coffee, bread, and a table you can keep",
            subheadline: "We open at seven, bake through the morning, and nobody has ever been asked to leave for nursing one flat white. Corner is a café first and a business second — just about.",
            buttons: [
              { label: "See the menu", href: "/menu", variant: "primary" },
              { label: "Find us", href: "/contact", variant: "secondary" },
            ],
          },
        },
        {
          type: "features",
          props: {
            headline: "Menu highlights",
            intro: "The board changes with what the bakers feel like and what the market has, but these six are always on it.",
            columns: 3,
            items: [
              { icon: "coffee", title: "The house flat white", body: "A seasonal blend roasted eight miles away, pulled a little short. Sweet enough that people who take sugar forget to ask for it. £3.40." },
              { icon: "croissant", title: "Overnight sourdough", body: "Mixed at four, baked at six, sold by two. A 900g loaf with a dark crust and an open crumb. £5.20, or £3.00 for a half." },
              { icon: "egg", title: "Eggs on toast, properly", body: "Two eggs from the farm at Whitley, softly scrambled, on a thick slice of our own bread with cultured butter. £8.50." },
              { icon: "soup", title: "The one soup", body: "Whatever the vegetables demanded that morning, with a heel of bread. Always vegetarian, usually vegan, £7.00 and worth arriving early for." },
              { icon: "cake", title: "Cardamom bun", body: "Laminated on Wednesday and Saturday, gone by eleven both days. We are sorry about this and have no plans to change it. £3.80." },
              { icon: "leaf", title: "Tea that is actually tea", body: "Leaf tea in a proper pot, six kinds, including a smoky lapsang that divides the room. £3.20 with a free top-up of water." },
            ],
          },
        },
        {
          type: "stats",
          props: {
            headline: "A morning at Corner",
            items: [
              { value: "7am", label: "doors open, seven days" },
              { value: "120", label: "loaves baked each morning" },
              { value: "8 mi", label: "to the roastery" },
              { value: "2014", label: "the year we took the lease" },
            ],
          },
        },
        {
          type: "testimonials",
          props: {
            headline: "From the neighbourhood",
            items: [
              { quote: "I have written two dissertations at the table by the window and they have never once made me feel like I should buy something else.", name: "Ellie Hargreaves", role: "Regular since 2018" },
              { quote: "The sourdough is the reason I stopped baking my own. That is the highest compliment I have.", name: "Dev Chaudhry", role: "Lives above the chemist" },
              { quote: "They learned my order and my daughter's name in the same week. It is the only place on Mill Street that feels like the street used to.", name: "Marian Doyle", role: "Regular since day one" },
            ],
          },
        },
        {
          type: "faq",
          props: {
            headline: "Hours and location",
            items: [
              { question: "When are you open?", answer: "**Monday to Friday** 7:00–16:00\n\n**Saturday** 8:00–16:00\n\n**Sunday** 8:00–14:00\n\nThe kitchen stops hot food an hour before closing. We shut for a week after Christmas and post the exact dates on the door in November." },
              { question: "Where are you?", answer: "42 Mill Street, on the corner with Bridge Road. Two minutes from the market square, opposite the old post office." },
              { question: "Can I park nearby?", answer: "There is free two-hour parking on Bridge Road and a pay-and-display car park behind the library, three minutes' walk. There are eight bike hoops directly outside." },
              { question: "Do you take bookings?", answer: "Not for tables of four or fewer — just turn up. For six or more, or for the back room, email us a couple of days ahead and we will hold it." },
              { question: "Is it dog friendly? Is there step-free access?", answer: "Dogs are welcome everywhere except the two tables nearest the counter. The front door is level, the room is on one floor, and the accessible toilet is at the back on the right." },
              { question: "Do you do coeliac-safe or vegan food?", answer: "The soup is nearly always vegan and we keep oat milk as standard with no surcharge. We cannot promise a coeliac-safe kitchen — there is flour in the air from four in the morning — and we would rather say so than risk it." },
            ],
          },
        },
        {
          type: "cta",
          props: {
            style: "card",
            headline: "Come in before the buns go",
            body: "Cardamom buns come out at half past eight on Wednesdays and Saturdays. They are usually gone by eleven.",
            buttons: [
              { label: "See the menu", href: "/menu", variant: "primary" },
              { label: "How to find us", href: "/contact", variant: "secondary" },
            ],
          },
        },
      ],
    },
    {
      slug: "menu",
      title: "Menu",
      seo: { description: "The full Corner menu: coffee and tea, the bakery counter, breakfast and lunch, and what changes with the seasons." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Served all day",
            headline: "What is on the board today",
            subheadline: "Prices are what you pay, sitting in or taking away. Bring your own cup and take 30p off any coffee.",
            buttons: [],
          },
        },
        {
          type: "columns",
          props: {
            columns: [
              { markdown: "### Coffee\n\nRoasted eight miles away, changed with the season.\n\n| | |\n|---|---|\n| Espresso | £2.60 |\n| Macchiato | £2.90 |\n| Flat white | £3.40 |\n| Cortado | £3.20 |\n| Latte | £3.60 |\n| Filter, batch | £3.00 |\n| Filter, hand brewed | £4.20 |\n| Iced coffee | £3.60 |\n\nOat, whole or semi-skimmed, all the same price. Decaf is the same beans, water-processed.\n\n### Tea and other drinks\n\n| | |\n|---|---|\n| Leaf tea, pot | £3.20 |\n| Mint or ginger | £3.00 |\n| Hot chocolate | £3.80 |\n| Apple juice | £2.60 |" },
              { markdown: "### From the bakery\n\nBaked from four in the morning. When it is gone, it is gone.\n\n| | |\n|---|---|\n| Sourdough loaf, 900g | £5.20 |\n| Half loaf | £3.00 |\n| Seeded rye | £5.60 |\n| Croissant | £3.20 |\n| Almond croissant | £3.90 |\n| Cardamom bun (Wed, Sat) | £3.80 |\n| Cinnamon swirl | £3.60 |\n| Scone, plain or fruit | £3.00 |\n| Slice of the cake | £4.20 |\n\nWhole cakes to order with three days' notice — ask at the counter or email us.\n\n**Day-old bread** is half price from four o'clock, and free to anyone who asks quietly." },
              { markdown: "### Breakfast, until 11:30\n\n| | |\n|---|---|\n| Toast, butter and jam | £4.00 |\n| Eggs on toast | £8.50 |\n| Mushrooms on toast | £8.50 |\n| The full plate | £11.50 |\n| Porridge, honey, seeds | £6.00 |\n| Yoghurt and compote | £5.50 |\n\n### Lunch, from 11:30\n\n| | |\n|---|---|\n| The one soup, with bread | £7.00 |\n| Cheese and pickle sandwich | £7.50 |\n| Ham, mustard, butter | £7.50 |\n| Roast vegetable sandwich | £7.50 |\n| Salad of the day | £8.00 |\n| Soup and half sandwich | £9.50 |\n\nEverything on bread we baked that morning. Ask about allergens — the kitchen has the folder and is happy to fetch it." },
            ],
          },
        },
        {
          type: "cta",
          props: {
            style: "plain",
            headline: "Ordering for a meeting or a birthday?",
            body: "We do platters, sandwich boxes and whole cakes with a few days' notice. Tell us how many people and we will suggest quantities.",
            buttons: [{ label: "Get in touch", href: "/contact", variant: "primary" }],
          },
        },
      ],
    },
    {
      slug: "about",
      title: "About",
      seo: { description: "How Corner started, who bakes the bread, and why the café closes at four in the afternoon." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "split",
            eyebrow: "Our story",
            headline: "A launderette, a lease, and one very good oven",
            subheadline: "Corner opened in 2014 in a room that had been a launderette for thirty years. The tiles are original. So, we are told, is the draught.",
            buttons: [{ label: "See the menu", href: "/menu", variant: "primary" }],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## How it started\n\nJoanna took the lease on 42 Mill Street in the spring of 2014, mostly because the rent was low and the room got the morning sun. The plan was coffee and a small counter of pastries. The bread began as a favour to a neighbour and took over within a year.\n\nWe put a proper deck oven in the back in 2016, which meant losing four seats and gaining the thing people now come for. It has run six days a week ever since, and it is the reason the whole building smells the way it does at half past five in the morning.\n\n## Who is here\n\n**Joanna** opens up, runs the counter, and knows roughly two hundred people's orders. **Tomasz** bakes; he arrives at four and leaves at noon, and the crust is his doing. **Amara** runs the kitchen and decides what the soup is, which she treats as a serious responsibility. Three more people work the floor at weekends, most of them students who have been with us for years.\n\n## Why we close at four\n\nBecause the baking starts at four the other way round. We tried evenings twice; both times the bread suffered and so did everyone making it. A café that is good in the morning and closed by teatime is a better business than one that is mediocre for fourteen hours.\n\n## What we buy, and where\n\nCoffee from a roastery eight miles away, on a seasonal contract we have kept since 2015. Flour from a mill in the next county. Eggs from Whitley Farm, delivered on Tuesdays and Fridays. Vegetables from the Wednesday market, which is why the soup on Wednesday afternoons is always the best one.",
          },
        },
      ],
    },
    {
      slug: "contact",
      title: "Contact",
      seo: { description: "Find Corner at 42 Mill Street: opening hours, parking, access, and how to book the back room or order a cake." },
      blocks: [
        {
          type: "hero",
          props: {
            layout: "centered",
            eyebrow: "Find us",
            headline: "42 Mill Street, on the corner with Bridge Road",
            subheadline: "Open seven days from seven in the morning. Two minutes from the market square, opposite the old post office.",
            buttons: [{ label: "See the menu", href: "/menu", variant: "secondary" }],
          },
        },
        {
          type: "markdown",
          props: {
            width: "content",
            markdown: "## Opening hours\n\n**Monday to Friday** 7:00 – 16:00\n\n**Saturday** 8:00 – 16:00\n\n**Sunday** 8:00 – 14:00\n\nHot food stops an hour before closing. We shut for one week after Christmas; the dates go on the door in November and on this page as soon as we know them.\n\n## Getting here\n\n42 Mill Street, on the corner with Bridge Road. Free two-hour parking along Bridge Road, and a pay-and-display car park behind the library, three minutes away. Eight bike hoops directly outside. The number 4 and 19 buses stop in the market square.\n\nThe front door is level with the pavement, the room is on one floor, and the accessible toilet is at the back on the right. Dogs are welcome except at the two tables by the counter.\n\n## Talking to us\n\n**Email** [hello@cornermillstreet.co.uk](mailto:hello@cornermillstreet.co.uk) — cakes to order, platters, the back room, and anything we have got wrong.\n\n**Phone** 01xxx 000 000 during opening hours. If nobody picks up it is because there are eleven people in the queue; try again in ten minutes or send an email.\n\n**Jobs** — we hire two or three times a year and always from people who have eaten here. Bring a note in and hand it to whoever is behind the counter.",
          },
        },
        {
          type: "cta",
          props: {
            style: "card",
            headline: "Planning something bigger?",
            body: "The back room seats fourteen and is free to book if everyone is eating. Email us a few days ahead.",
            buttons: [{ label: "Read about us", href: "/about", variant: "primary" }],
          },
        },
      ],
    },
  ],
});
