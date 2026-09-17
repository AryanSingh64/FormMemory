# FormMemory

A lightweight, privacy-friendly browser extension for Firefox and Google Chrome (also works on Brave, Edge, and Opera) that remembers what you type in forms and auto-fills job applications in one click.

Everything stays right on your computer in your local browser storage. No accounts, no external servers, no tracking, and zero internet requests.

---

## What does it do?

- **1-Click Job Applications**: Sick of typing the same name, email, phone, LinkedIn URL, and work authorization on every single job board? Fill out your info once in the extension popup, and when you open a job application (Workday, Greenhouse, Lever, Ashby, etc.), hit `Alt + Shift + J` or click the floating button to fill the whole page at once.
- **Smart Form Memory**: As you type in regular forms, it remembers your entries (names, addresses, usernames). Next time you click that field, a clean dropdown appears with your most-used values at the top.
- **Links Emails & Passwords**: When you save login info, it pairs your email and password together. Click your email, and it fills the password automatically.
- **Password Generator**: Click into any password field and you can generate a strong 16-character password on the spot.
- **Delete Mistakes Easily**: Saved a typo? Hover over the suggestion in the dropdown and click [x] to delete it immediately.
- **Site Blacklist**: Want it to ignore your banking site or internal company portal? Turn it off for that specific domain with one click.
- **Backup Your Data**: You can download a JSON backup of all your saved info from the popup anytime, or import it on another computer.

---

## How to install it in Google Chrome / Brave / Edge

1. Open Chrome and navigate to:
   ```text
   chrome://extensions
   ```
2. Turn on the **"Developer mode"** toggle in the top-right corner.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Select the `chrome` folder from this project.
5. That is it! Click the puzzle icon in Chrome toolbar and pin FormMemory.

---

## How to install it in Firefox

1. Open Firefox and navigate to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click the button that says **"Load Temporary Add-on..."**.
3. Select `firefox/manifest.json` (or any file inside the `firefox` folder).
4. Done! Pin FormMemory in your toolbar so you can access it easily.

---

## How to use it

### For Job Applications
1. Click the FormMemory icon in your toolbar.
2. Under the **Job Profile** tab, put in your details: your name, contact info, current company, LinkedIn, GitHub, portfolio link, and work sponsorship answers. Click **Save Job Profile**.
3. Open any job application page (like Greenhouse, Lever, Workday, or the included `test_form.html`).
4. Press `Alt + Shift + J` on your keyboard, or click the **"Fill Job App"** button at the bottom of the page. The entire form fills up immediately.

### For Normal Forms & Passwords
1. Whenever you submit a form or log in, FormMemory asks in the top corner if you want to save it for that website. Click **Save**.
2. Next time you visit that page and click into an input, your saved values show up in a clean dropdown.
3. If you ever want to clear data for a specific site or wipe everything, open the extension popup and go to **Saved Sites**.

---

## Project Structure

This repository provides separate, ready-to-load builds for each browser:

- `chrome/`: The Chrome Manifest V3 version (configured with background `service_worker`).
- `firefox/`: The Firefox Manifest V3 version (configured with background `scripts` and Gecko ID).
- `test_form.html`: A safe test form with all kinds of inputs to test autofill and memory locally.
- `build.js`: Compiles and syncs shared core files into both `firefox/` and `chrome/` targets.
- `package-extension.js`: Builds standalone `.zip` packages for both Chrome and Firefox.

---

## Developer Commands

If you have Node.js installed, you can run:

- `npm run build` - Synchronizes all files and builds both `firefox` and `chrome` versions.
- `npm run package` - Builds and zips both extensions into `formmemory-chrome.zip` and `formmemory-firefox.zip`.
- `npm run test:syntax` - Quickly checks all JavaScript files across root, Firefox, and Chrome builds to ensure zero syntax errors.
