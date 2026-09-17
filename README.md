# FormMemory

A lightweight Firefox extension that remembers what you type in forms and auto-fills job applications in one click.

Everything stays right on your computer in your local browser storage. No accounts, no external servers, no tracking, and no internet requests.

---

## What does it do?

- **1-Click Job Applications**: Sick of typing the same name, email, phone, LinkedIn URL, and work authorization on every single job board? Fill out your info once in the extension popup, and when you open a job application (Workday, Greenhouse, Lever, Ashby, etc.), hit `Alt + Shift + F` or click the floating button to fill the whole page at once.
- **Smart Form Memory**: As you type in regular forms, it remembers your entries (names, addresses, usernames). Next time you click that field, a clean little dropdown appears with your most-used values at the top.
- **Links Emails & Passwords**: When you save login info, it pairs your email and password together. Click your email, and it fills the password automatically.
- **Password Generator**: Click into any password field and you can generate a strong 16-character password on the spot.
- **Delete Mistakes Easily**: Saved a typo? Hover over the suggestion in the dropdown and click `x` to delete it immediately.
- **Site Blacklist**: Want it to ignore your banking site or internal company portal? Turn it off for that specific domain with one click.
- **Backup Your Data**: You can download a JSON backup of all your saved info from the popup anytime, or import it on another computer.

---

## How to install it in Firefox (takes 10 seconds)

1. Open Firefox and type this into your address bar:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click the button that says **"Load Temporary Add-on..."**.
3. Go into this folder (`FormMemory`) and select the `manifest.json` file.
4. That's it! FormMemory will show up in your toolbar.

*(Tip: Click the puzzle piece icon on your top-right toolbar and pin FormMemory so you can easily click it).*

---

## How to use it

### For Job Applications
1. Click the FormMemory icon in your toolbar.
2. Under the **Job Profile** tab, put in your details: your name, contact info, current company, LinkedIn, GitHub, portfolio link, and work sponsorship answers. Click **Save Job Profile**.
3. Open any job application page (like Greenhouse, Lever, Workday, or the included `test_form.html`).
4. Press `Alt + Shift + F` on your keyboard, or click the **"Fill Job App"** button at the bottom of the page. The entire form fills up immediately.

### For Normal Forms & Passwords
1. Whenever you submit a form or log in, FormMemory asks in the top corner if you want to save it for that website. Click **Save**.
2. Next time you visit that page and click into an input, your saved values show up in a clean dropdown.
3. If you ever want to clear data for a specific site or wipe everything, open the extension popup and go to **Saved Sites**.

---

## Project Files

- `manifest.json`: Firefox extension setup file
- `content.js`: The script that handles auto-filling and form detection on websites
- `content.css`: Minimal styling for dropdowns and buttons (matches your browser's dark/light theme)
- `popup.html` / `popup.js` / `popup.css`: The popup where you edit your job profile and manage saved sites
- `background.js`: Handles keyboard shortcuts like `Alt + Shift + F`
- `test_form.html`: A test page you can open in Firefox to try out all the features safely
- `package-extension.js`: Helper script to zip the extension for sharing or publishing

---

## Commands

If you have Node.js installed, you can run:

- `npm run package` - Zips up the extension into `formmemory-extension.zip` so you can send it to someone or upload it to GitHub releases.
- `npm run test:syntax` - Quickly checks all JavaScript files to make sure there are no code errors.
