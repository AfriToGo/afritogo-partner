/**
 * OPTIONAL APPS SCRIPT INTEGRATION — NOT LOADED BY THE STATIC WEBSITE.
 * Call only AFTER server-side validation and private application storage.
 * Not a doPost endpoint; this does not store uploaded identity documents.
 * Requests an email reply for manual owner-authorization review.
 * Does NOT mark the application approved, or claim agreement acceptance.
 *
 * Script property required: OWNER_CONSENT_REPLY_TO (a monitored mailbox).
 * Configure spam/rate limits before exposing the application endpoint.
 * Source: https://developers.google.com/apps-script/reference/mail/mail-app
 */
function requestOwnerConsent(applicationId, validatedApplication) {
  if (!validatedApplication || !['Yes', 'No'].includes(validatedApplication.is_owner)) {
    throw new Error('Invalid owner selection.');
  }
  if (validatedApplication.is_owner === 'Yes') return { status: 'not_required' };
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(String(applicationId || ''))) {
    throw new Error('Use the permanent application ID returned by private storage.');
  }
  if (String(validatedApplication.website || '').trim()) throw new Error('Spam-trap value present.');
  var email = String(validatedApplication.owner_email || '').trim();
  if (!/^[^\s@,;<>\r\n]+@[^\s@,;<>\r\n]+\.[A-Za-z]{2,63}$/.test(email) || email.length > 254) {
    throw new Error('A single valid owner email is required.');
  }
  function oneLine(value, maxLength) {
    var text = String(value || '').replace(/[\r\n\x00-\x1F\x7F]/g, ' ').trim();
    if (!text || text.length > maxLength) throw new Error('Invalid application identity fields.');
    return text;
  }
  var ownerName = oneLine(validatedApplication.owner_name, 220);
  var applicantName = oneLine(validatedApplication.applicant_name, 220);
  var businessName = oneLine(validatedApplication.business_name, 220);
  var properties = PropertiesService.getScriptProperties();
  var replyTo = String(properties.getProperty('OWNER_CONSENT_REPLY_TO') || '').trim();
  if (!/^[^\s@,;<>\r\n]+@[^\s@,;<>\r\n]+\.[A-Za-z]{2,63}$/.test(replyTo)) {
    throw new Error('Configure OWNER_CONSENT_REPLY_TO to a monitored mailbox first.');
  }
  // Do not put addresses or application contents into Script Properties.
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    String(applicationId) + '\n' + email.toLowerCase(), Utilities.Charset.UTF_8);
  var key = 'atg-consent-' + digest.map(function(byte) {
    return ('0' + ((byte + 256) % 256).toString(16)).slice(-2);
  }).join('');
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return { status: 'pending', email: email };
  try {
    var previousText = properties.getProperty(key);
    if (previousText) {
      var previous = JSON.parse(previousText);
      // Ambiguous prior attempts require manual review; never silently resend.
      return { status: previous.status === 'sent' ? 'sent' : 'pending', email: email };
    }
    if (MailApp.getRemainingDailyQuota() < 1) return { status: 'pending', email: email };
    var body = 'Hello ' + ownerName + ',\n\n'
      + applicantName + ' has submitted an AfriToGo partner application for ' + businessName + '.\n\n'
      + 'Application number: ' + applicationId + '\n\n'
      + 'Before we can approve the business, we need your authorization as its owner. '
      + 'Please reply to this email confirming whether you authorize ' + applicantName
      + ' to submit and discuss this application for ' + businessName + '.\n\n'
      + 'Please include your full name and the application number in your reply. '
      + 'If you did not authorize this application, reply to let us know.\n\n'
      + 'Do not reply with a government ID, EIN, payment information or other sensitive documents. '
      + 'This authorization request does not activate a plan, charge you, approve the business, '
      + 'or replace the Merchant Partner Agreement.\n\n'
      + 'AfriToGo\n' + replyTo;
    properties.setProperty(key, JSON.stringify({ status: 'sending', at: new Date().toISOString() }));
    try {
      MailApp.sendEmail({ to: email, subject: 'Owner authorization requested — AfriToGo ' + applicationId,
        body: body, name: 'AfriToGo', replyTo: replyTo });
      properties.setProperty(key, JSON.stringify({ status: 'sent', at: new Date().toISOString() }));
      return { status: 'sent', email: email };
    } catch (error) {
      properties.setProperty(key, JSON.stringify({ status: 'review_required', at: new Date().toISOString() }));
      // The application remains stored. Handle retry manually to avoid duplicates.
      return { status: 'pending', email: email };
    }
  } finally {
    lock.releaseLock();
  }
}
