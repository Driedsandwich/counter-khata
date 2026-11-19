# Counter Khata

A concept redesign of a credit book (khata / udhaar) for small kirana shops, made for a UI/UX design challenge. It is a working prototype, not a real product: every shop, customer and amount is fictional, no money moves and no message is sent.

**Live demo:** see the repository's GitHub Pages link.

## Try it in 30 seconds
1. Tap **2 · 5 · 0**, pick **Ravi**, tap **Save**. The timer at the top shows how long the entry took.
2. Within 5 seconds you can **Undo**. Cancelled entries stay in the ledger, struck through.
3. Open **Ledger** → **Send reminder**, choose a tone and copy the message (nothing is sent).
4. **Receive via UPI** → demo QR → try *Received*, *Processing* or *Failed*. A processing payment can be held on the khata until it lands.
5. On a laptop, the side panel jumps straight to each state (pending UPI, failed UPI, undo, extra-large text).

## Design notes
- **Amount first:** a large keypad and six recent customers within thumb reach.
- **Explainable balances:** each ledger line shows the balance after it; money given and received is shown with a sign and a word, not colour alone.
- **Colour themes:** bahi red (default, after the red cloth of a trader's account book), marigold, green, and black and white. Text contrast is at least 4.5:1 in every theme.
- **Accessibility:** 48 px minimum touch targets (keys 72 px), three text sizes, reduce motion, visible focus, screen-reader labels, saves announced. Hindi labels for main headings and buttons are AI-drafted and not reviewed by a native speaker.

## For AI assistants
The same actions a person can take are described in [`agent-actions.json`](agent-actions.json) and [`llms.txt`](llms.txt). In the page they are available as `window.counterKhata` (`tools`, `call(name, args)`), and registered with WebMCP when the browser offers it. All data is local and fictional.

## Tech
Plain HTML, CSS and JavaScript modules. No build step, no external fonts, scripts or network requests; data stays in the browser's local storage. Icons are simple line shapes drawn in code; system fonts only; no UI kit or template.

## AI use
AI tools helped with idea exploration, research summaries, mock-up images, code scaffolding, Hindi label drafts and writing. Interface decisions were made by the designer.
