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

## Verified facts
Checked on 20 November 2026. Each line says how it was checked, so it can be repeated.

| Claim | Result | How it was checked |
|---|---|---|
| Colour contrast, default theme | body text 15.23:1 · secondary 6.28:1 · button text 8.61:1 · accent on card 8.87:1 | `node checks/contrast.mjs` (WCAG 2 formula on the colour tokens in `styles.css`) |
| Colour-blind simulation | lowest ratio 6.17:1 (deuteranopia) and 6.45:1 (protanopia) in the default theme | same script; Machado et al. (2009) matrices at full severity |
| All four themes | lowest ratio across every theme and simulation is 5.65:1 (marigold) | same script |
| Money in and out without colour | ledger lines read "+ Given" or "− Received" | `app.js`, ledger row template |
| Touch targets | buttons at least 48 px high; keypad keys 72 px | `styles.css` (`min-height: 48px`, `.key { height: 72px }`) |
| Screen readers | 11 `aria-label` attributes, 1 `aria-live` region, 3 px focus outline (`:focus-visible`) | counted in `app.js`, `index.html`, `styles.css` |
| Text sizes | standard, large, extra large; the page never scrolls sideways; at extra large only the customer row scrolls sideways | headless Chrome at 390 px wide |
| Long amounts | the largest amount (₹98,76,54,321.50) stays on one line at standard and extra-large text, and the keypad does not move while typing | headless Chrome at 390 × 844 px, keypad top position compared before and after each key |
| Undo | after Save, a 5-second Undo bar floats over the screen; the keypad position is unchanged | Chrome, keypad top measured before and after Save |
| Timer | runs from the first key press to Save and shows "Saved in X s" | `app.js` |
| No network | the page cannot make requests (`connect-src 'none'`) | Content-Security-Policy in `index.html` |
| Indian digit grouping | 1,25,000 and 98,76,54,321 | `app.js` (`toLocaleString('en-IN')`) |

**Not done yet:** no usability tests with shopkeepers; Hindi labels are AI-drafted and not reviewed by a native speaker; UPI results are chosen in the demo, not received from a bank.

## For AI assistants
The same actions a person can take are described in [`agent-actions.json`](agent-actions.json) and [`llms.txt`](llms.txt). In the page they are available as `window.counterKhata` (`tools`, `call(name, args)`), and registered with WebMCP when the browser offers it. All data is local and fictional.

## Tech
Plain HTML, CSS and JavaScript modules. No build step, no external fonts, scripts or network requests; data stays in the browser's local storage. Icons are simple line shapes drawn in code; system fonts only; no UI kit or template.

## AI use
AI tools helped with idea exploration, research summaries, mock-up images, code scaffolding, Hindi label drafts and writing. Interface decisions were made by the designer.
