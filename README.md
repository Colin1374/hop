# hop

Tiny client-side link converter: x.com / twitter.com / t.co links and @handles → a
Nitter mirror (default `nitter.app`).

- Open `index.html` (or the hosted URL) and paste a link, a whole message, or `@handle`.
- `?u=<encoded-url>` or `#<url>` prefills the box, for iOS Shortcuts share-sheet use.
- No server, no build step at runtime, no tracking. Everything runs in the browser.
- The destination mirror can be changed in the app's **Instance** panel if the
  current one goes down.

Source of truth: `index.html`. `hop.html` is the same file with the app icon
inlined, for standalone/offline use from disk.
