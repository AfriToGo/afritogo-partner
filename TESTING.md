# Version 2 test report

## Local browser checks

The actual version 2 HTML, CSS, JavaScript and local SVG logos were loaded into
installed Chromium. Managed-browser policy blocked navigation to the local HTTP
server. Therefore only the test harness inlined CSS/JS/logo assets into an
about:blank document and removed the CSP meta tag from that test document.
The delivered index.html retains its separate files and CSP. Tests used synthetic
application data/files and an in-memory fetch stub; no real personal documents
were used and no server request or email was sent.

Sixteen browser test groups passed:

1. Compact first screen, 50-state dropdowns, no old marketing blocks or script errors.
2. Required fields, inline messages, and focus on the first error.
3. Typed digits blocked in personal names; letters blocked in telephone fields.
4. Invalid name, email, phone, address, city and ZIP matrix; invalid values inserted
   programmatically still block continuation (not dependent on keyboard filtering).
5. Restaurant-specific heading, labels and category options; valid business path.
6. Required non-owner fields; owner Yes hides/disables those fields.
7. Grocery-specific path; switching business type clears incompatible category;
   alcohol Yes requires license confirmation, No skips it.
8. Optional brand images, required ID/permits, EIN and final review.
9. Missing endpoint/agreement blocks submission instead of faking success.
10. Exact original API keys, combined name/address values, normalized phone values,
    text/plain transport, raw base64, server errors retain all entered data.
11. Success application ID/business email, confirmed-only owner-email status,
    sensitive input/file references cleared after receipt.
12. No claimed consent-email delivery when backend acknowledgement is absent.
13. 4096x2048 PNG resized to 2000x1000; PDF over 8 MiB rejected; unsupported SVG
    rejected; removing bad files unblocks continuation; sixth permit rejected.
14. Duplicate in-flight submits prevented; controls disabled while sending;
    direct-owner success skips the owner-email notice.
15. All six steps at widths 320, 360, 390, 430, 768, 1024, 1440: no page-level
    horizontal overflow and no application JavaScript errors.
16. Explicit field labels, unique IDs and all aria-describedby targets resolve.

All statements above describe local test results, not live deployment. Desktop
and mobile screenshots were inspected. They show the actual code, not generated
mockup images. An intermediate repeat of the tests encountered a UI automation
click timeout; the repeat-validation test was isolated and used programmatic
button activation for its invalid-value matrix. The complete final run passed;
normal form navigation was also exercised with browser click actions.

## Apps Script consent helper

`node qa/consent_checks.cjs` passed with mocked MailApp, PropertiesService,
LockService and Utilities. Checks include owner bypass, one non-owner email,
deduplication, correct recipient/reply-to, no document/CC disclosures, quota
handling, ambiguous failure without automatic resend, and rejection of multiple
recipients. This is NOT a live Google Apps Script execution or mail-delivery test.
JavaScript syntax checks also passed.

## Not tested / not configured

- Physical iPhone Safari or Android Chrome; no live Safari claim.
- Live Apps Script endpoint, CORS, its server validation/storage, email delivery,
  inbox reply processing, verification or approval of business owners.
- GitHub remote push, Pages hosting, DNS/TLS, live CSP enforcement.
- A full screen-reader audit or formal accessibility-conformance certification.
- Native HEIC decoding on an actual iPhone. Existing unsupported-format fallback
  is unchanged; it permits an original under 8 MiB with a visible warning.
- Whether any email address, phone number, street address or ZIP combination is
  real; those need separate verification, not format checks alone.

## Reproduce local checks

QA tooling is optional and is not needed for serving the site:

```sh
python -m pip install playwright beautifulsoup4
python -m playwright install chromium
python qa/browser_checks.py
node qa/consent_checks.cjs
node --check app.js
```

The QA script writes screenshots and a JSON report to ignored `qa-output/`.
It uses a system Chromium when present or Playwright's installed Chromium.
The files in `qa/` and `integration/` are not included by the webpage.
