# Owner-consent email — integration, not a deployed service

The static site does not send emails itself. `OwnerConsent.gs` is an optional
Google Apps Script helper for the application's existing receiver. It is **not**
a complete receiver, is not imported by `index.html`, and has not been deployed.
No emails have been sent while creating or testing this package.

## Intended flow

1. Validate the original JSON schema on the server, including `website`, enums,
   email/phone formats, decoded attachment sizes, number and contents of files,
   required owner details when `is_owner === "No"`, and all consent checkboxes.
   Add request limits and rate limits. Client checks are not a security boundary.
2. Store the application and documents privately. Assign a permanent application
   number. Reuse the same number for a retry; do not create a fresh application on
   every retry. Never publish IDs, EINs or application files to the GitHub repo.
3. For non-owner applicants, set approval state to **pending owner authorization**.
4. Set Apps Script property `OWNER_CONSENT_REPLY_TO` to a mailbox your team monitors,
   e.g. `support@afritogo.com`. Authorize the Mail service for the script account.
5. Add the helper to that same Apps Script project and call:

```js
// applicationId and validatedApplication must come from YOUR validated,
// privately persisted application. These are not extra browser payload fields.
var ownerConsent;
try {
  ownerConsent = requestOwnerConsent(applicationId, validatedApplication);
} catch (_) {
  ownerConsent = { status: 'pending', email: validatedApplication.owner_email };
}
// Persist the returned delivery status alongside the application.
// Do not fail an already-stored application merely because email delivery failed.
return ContentService.createTextOutput(JSON.stringify({
  ok: true,
  applicationId: applicationId,
  ownerConsent: ownerConsent
})).setMimeType(ContentService.MimeType.JSON);
```

6. The owner receives an authorization-request email and replies to your monitored
   mailbox. An AfriToGo reviewer verifies the reply and records an approval or
   rejection. **Email delivery is not owner consent, identity verification, or
   agreement acceptance.** This version deliberately does not implement automated
   approval links or inbox-reading automations.

The helper deduplicates a permanent application ID + owner email with a lock and
hashed Script Properties key. On an ambiguous failure it returns `pending` rather
than automatically resending. Resolve these cases manually. Script Properties are
not an unlimited database: move delivery-state records into your private datastore
as volume grows, and delete old keys according to your retention policy.

`sent` means the Mail service accepted the send request, not guaranteed inbox
delivery. Monitor failures/bounces. Do not automatically treat a reply from an
unrelated email address as authorization. If owner details change, invalidate any
previous authorization before requesting consent again.

## Browser integration already provided

The request keys are unchanged. The receiver derives the need for consent from
`is_owner: "No"` and uses `owner_name`, `owner_phone` and `owner_email`.
The browser only displays "A consent email was sent" when the server returns:

```json
{"ok":true,"applicationId":"AFT-0012","ownerConsent":{"status":"sent","email":"owner@example.com"}}
```

The returned email must match the owner email entered on the form. Without that
confirmation, the screen simply says owner authorization is required; it never
pretends an email was sent or the owner has approved.

## References

- Mail service: https://developers.google.com/apps-script/reference/mail/mail-app
- Web app POST data: https://developers.google.com/apps-script/guides/web
- Server validation is still required: https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Constraint_validation
