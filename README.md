# AfriToGo partner application — version 2

Static HTML, CSS and vanilla JavaScript. No framework, build step, third-party
browser scripts, analytics or browser persistence. Intended hostname:
`partner.afritogo.com`. The customer website/Hyperzod code is not part of this
package and is not modified.

## Changes in this revision

- Separate applicant First Name / Last Name; separate owner First Name / Last Name.
- Unicode letter-based personal names; accents, spaces, hyphens and apostrophes
  supported. Digits, email addresses, emoji and unrelated punctuation rejected.
  Business names remain normal business text and may contain numbers/punctuation.
- Properly formatted email required for applicant, owner and business; no
  Gmail-only restriction. Email syntax checks do not prove the mailbox exists.
- Phone inputs reject letters and email addresses. Accept US-style 10 digits or
  an optional 1 prefix; international numbers require `+` and country code.
  Accept ordinary formatting characters. Serialize numbers into +digits form.
  These are format checks, not carrier/ownership verification.
- Mailing and business addresses now use Address Line 1, optional Address Line 2,
  City, a dropdown containing all 50 US states, and ZIP Code (5-digit or ZIP+4).
  The browser does not verify deliverability or the city/state/ZIP combination.
- Owner Yes skips extra owner information. No requires all owner contact fields.
- Restaurant applicants see Restaurant information / Cuisine Type. Grocery
  applicants see Grocery store information / Grocery Store Type. The wrong
  branch's categories are never shown. Changing type resets the old category and
  specific-country/cuisine detail, while retaining common business contact data.
  These are conditional views of one shared form, not duplicate HTML forms.
- Replaced the marketing split-screen layout with a compact centered form.
  Removed benefits, Before you begin, Questions/help, and signoff blocks.
  Kept only the logo and small Partner with AfriToGo heading above the progress.
  No invented replacement banner; you can add your own design later.
- Existing six steps, uploads, EIN, agreement, liquor-license condition, spam trap,
  submission transport and original JSON request keys are retained.
- Added a separate, optional Apps Script owner-consent email helper and integration
  notes. Nothing sends an email until the server is configured and deployed.

## Main files

- `index.html` — six-step form, accessible labels, native inputs and 50-state lists.
- `styles.css` — white/orange/black, mobile-first layouts and focus/error states.
- `app.js` — conditions, field validation, image processing, review, submission.
- `CNAME` — exactly `partner.afritogo.com` (no other content).
- `assets/` — the original all-orange AfriToGo logo and icon from the prior site.
- `integration/OwnerConsent.gs` — optional server email helper; not a frontend script.
- `integration/README.md` — consent process, integration, limits and deployment notes.
- `qa/` — optional local QA scripts; never required to run the website.

## Preview

Open `index.html` to inspect the local site. For a local server, from this folder:

```sh
python -m http.server 8080
```

Open `http://localhost:8080`. No build command is required. A local preview does
not establish that the live Apps Script request or GitHub Pages deployment works.

## Before accepting real applications

Edit the three constants at the very top of `app.js`:

```js
const OFFER_TEXT = "Founding Partner offer — details to be confirmed.";
const AGREEMENT_URL = "#";
const APPS_SCRIPT_URL = "PASTE_WEB_APP_URL_HERE";
```

The original offer placeholder and `plan: "Founding Partner"` request value were
retained from the explicit build brief. The older Starter/Growth/Platinum pricing
screenshots are workflow references, not approval to publish those prices.
Finalize offer wording and agreement before launch. The form refuses to send
while the endpoint or agreement is still a placeholder.

The Google Apps Script receiver must accept JSON from `e.postData.contents`,
validate the entire payload and attachments on the server, privately store the
application/documents, and return a JSON result. It must authorize email sending
separately; the static site cannot send owner consent emails on its own.
No receiver or private-storage credentials have been supplied with this task.

## Preserved request contract

The separated UI fields are combined into the originally requested keys so an
existing receiver does not break:

- `applicant_name` = first name + last name.
- `owner_name` = owner first name + owner last name, or an empty string for Yes.
- `mailing_address` = line 1, optional line 2, then `City, ST ZIP`, separated by newlines.
- `business_address` uses the same format.
- Phone values are normalized to `+digits`; leading zeros in ZIP Codes are retained.

No extra first/last/address keys are added to the JSON body. To store individual
components in separate spreadsheet columns, change the receiver/schema together
in a future version rather than guessing how to split a person's name afterward.

```js
fetch(APPS_SCRIPT_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'text/plain;charset=utf-8' },
  body: JSON.stringify(payload)
});
```

Actual implementation also sets a timeout, omits cookies and prevents duplicate
in-flight submissions. It does not use `no-cors` or claim success from an opaque
response. A successful response must include an application number:

```json
{"ok":true,"applicationId":"AFT-0012"}
```

Optional owner-email acknowledgement:

```json
{"ok":true,"applicationId":"AFT-0012","ownerConsent":{"status":"sent","email":"owner@example.com"}}
```

A failure keeps form values and selected files intact. Timeouts or connection
failures instruct the applicant to check receipt before retrying. Server-side
idempotency is still required; the browser only prevents simultaneous repeated taps.

## Owner-consent workflow

For `is_owner === "No"`, approval must remain **pending owner authorization**.
`integration/OwnerConsent.gs` can send a request to the provided owner email and
ask the owner to reply to your monitored support address. It includes basic
retry/deduplication protection. The AfriToGo team must review the owner's reply
and record authorization; this package does not automatically approve applicants.
It does not email IDs, EINs, addresses or attachments to the owner.

Email sending and review have NOT been deployed or tested against a live account.
The success page only says a consent email was sent when the receiver confirms
`status: "sent"` for the matching owner email. Otherwise it says authorization
is required, without inventing an email-delivery claim.

## Upload behavior

JPG/JPEG/PNG/WEBP/HEIC/HEIF/PDF accepted. Files are checked by extension and basic
signature, not just their browser-reported MIME type. This is not malware scanning.
Decodable photos are resized to a maximum 2000px long edge and encoded as JPEG
at quality 0.8. PDFs stay unchanged. Maximum final size is 8 MiB per file.
HEIC/HEIF originals under the limit are retained with a warning if this browser
cannot decode them. Larger undecodable files must be converted before uploading.

Uploads are processed one at a time. The payload has raw base64, not data-URL
prefixes. Both image uploads are optional; ID is exactly one, permits one to five.
File names are rendered with textContent, not executable HTML.

## GitHub Pages

Commit the files to the intended AfriToGo repository's `main` branch. Enable
Pages from `main` and repository root. Configure `partner.afritogo.com` as its
custom domain and set your DNS CNAME to the actual account's GitHub Pages host.
Enable HTTPS after the certificate is available. Never point AfriToGo at a Girlz
Culture repository. The `CNAME` file alone does not configure DNS or hosting.

This delivery contains a local main-branch commit. No accessible AfriToGo
repository was returned by the connected GitHub search; no remote push or Pages
configuration was performed.

## Security and live launch checklist

- Validate all inputs again on the server. Treat the honeypot as one simple
  signal, not full spam protection. Enforce size limits, quotas and rate limits.
- Keep government IDs, permits and EINs in private storage with limited access,
  retention rules and no publicly shared download links.
- Never put applicant files, private spreadsheets, API secrets or real test
  identity documents in this repository.
- Provide your privacy notice and finalized agreement before distributing QR codes.
- Verify valid/invalid submissions, network failures, duplicate submissions,
  file handling and owner email delivery with synthetic data on real iPhone
  Safari and Android Chrome before collecting applications.
- The browser tests are local; see TESTING.md for their exact limitations.

## Technical references

- Email syntax vs mailbox verification: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/email
- Phone inputs need explicit constraints: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/tel
- Client and server validation: https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation
- Apps Script web apps: https://developers.google.com/apps-script/guides/web
- Apps Script email: https://developers.google.com/apps-script/reference/mail/mail-app
