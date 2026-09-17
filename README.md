# FormMemory (Firefox Manifest V3 Extension) - Job Edition

**FormMemory** is a privacy-first, local-only Firefox extension built to automate form filling with special optimization for **Job Applications** (Workday, Greenhouse, Lever, Ashby, BambooHR, LinkedIn) alongside intelligent field memory and credential management.

Zero external dependencies. Zero telemetry. All data stays strictly in local browser storage.

---

## Primary Feature: 1-Click Job Application Autofill

Tired of typing the same information on hundreds of job applications? FormMemory features a built-in ATS heuristic engine:

1. **Job Seeker Profile** (stored once in the extension popup):
   - **Personal**: First Name, Last Name, Full Name, Email, Phone
   - **Professional**: Current Company, Current Job Title, Total Experience (Years), Notice Period
   - **Links**: LinkedIn URL, GitHub URL, Portfolio Website
   - **Location**: City, State
   - **Work Authorization & Sponsorship**: Legal authorization (Yes/No), Visa sponsorship required (Yes/No)
   - **Summary / Cover Letter**: Pitch / introduction snippet
2. **Instant 1-Click Autofill**:
   - Detects ATS forms on any job portal (Workday, Greenhouse, Lever, Ashby, etc.).
   - Shows a floating **"Fill Job App"** button on the bottom of the page.
   - Or simply press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd> to autofill all matching fields in one shot!

---

## 7 Core Additions

1. **In-Dropdown Suggestion Deletion**:
   - Hover over any saved suggestion to see a small `x` icon, or press <kbd>Shift</kbd> + <kbd>Delete</kbd> on a highlighted suggestion to remove typos or outdated inputs instantly.
2. **Built-in Strong Password Generator**:
   - Focus any password field to see **"Generate Strong Password (16 chars)"** at the top of the dropdown. Generates cryptographically secure random passwords using `crypto.getRandomValues`.
3. **Domain Blacklist ("Never for this site")**:
   - Easily silence FormMemory on banking sites or sensitive domains from the popup or submit prompt banner.
4. **Credential Linking & Auto-Password Matching**:
   - Pairs emails and passwords together. Selecting an email automatically fills the corresponding password, or opens a filtered list if multiple passwords exist for that account.
5. **Prompt-to-Save on Submit**:
   - Prompts you cleanly in the top-right corner when submitting forms: *"Save form information for [domain]? [Save] [Don't Save]"*.
6. **Data Backup & Restore (JSON Export / Import)**:
   - Export all your job profiles, credentials, and saved site histories into a JSON backup file in one click, and restore it on any machine.
7. **Keyboard Shortcut Support (<kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>)**:
   - Trigger instant job application autofill without lifting your hands from the keyboard.

---

## Installation / Loading in Firefox

1. Open Firefox and go to:
   ```text
   about:debugging#/runtime/this-firefox
   ```
2. Click **"Load Temporary Add-on…"**.
3. Select [`manifest.json`](manifest.json) in `a:\FormFilling`.
4. FormMemory will be loaded and active immediately!

---

## How to Test on Local Sandbox

1. Open the included local sandbox:
   **[http://localhost:8080/test_form.html](http://localhost:8080/test_form.html)**
2. Click the **FormMemory** extension icon in Firefox:
   - In the **Job Profile** tab, enter your details (Name, Company, Title, LinkedIn, GitHub, etc.) and click **"Save Job Profile"**.
3. Go back to [`http://localhost:8080/test_form.html`](http://localhost:8080/test_form.html):
   - Notice the floating **"Fill Job App"** button in the bottom corner.
   - Click it or press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>F</kbd>.
   - Watch the entire ATS Job Application form populate instantly!
4. Scroll down to the **Authentication Form**:
   - Click into the password field to test **"Generate Strong Password"**.
   - Hover over suggestions to test the **"x"** deletion button.
