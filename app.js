"use strict";

// ================= EDIT THESE THREE VALUES BEFORE LAUNCH =================
const OFFER_TEXT = "Founding Partner offer — details to be confirmed.";
const AGREEMENT_URL = "#";
const APPS_SCRIPT_URL = "https://script.google.com/u/0/home/projects/1S9L4hdK8bBL0Ua4Gvi4HZTs73vNRuS_-w5g7Gfrec9JP0ZXWtSbYLxww/edit";
// ========================================================================

(() => {
  const MAX_FILE_BYTES = 8 * 1024 * 1024;
  const MAX_IMAGE_EDGE = 2000;
  const JPEG_QUALITY = 0.8;
  const REQUEST_TIMEOUT_MS = 120000;
  const SUPPORT_EMAIL = "support@afritogo.com";
  const STEP_TITLES = ["Your information", "Business information", "Our offer", "Logo and cover image", "Legal and compliance", "Review and submit"];
  const STEP_FIELDS = {
    1: ["applicant_first_name", "applicant_last_name", "applicant_email", "applicant_phone", "mailing_address_line1", "mailing_address_line2", "mailing_city", "mailing_state", "mailing_zip", "is_owner", "owner_first_name", "owner_last_name", "owner_phone", "owner_email", "business_type"],
    2: ["business_name", "business_email", "business_phone", "business_address_line1", "business_address_line2", "business_city", "business_state", "business_zip", "category", "category_detail", "order_types", "equipment_needed", "sells_alcohol", "liquor_license_confirmed"],
    3: [],
    4: ["logo", "cover"],
    5: ["owner_id", "permits", "ein"],
    6: ["agreement_accepted", "permits_confirmed"]
  };
  const FILE_RULES = {
    owner_id: { max: 1, required: true, label: "Owner ID" },
    permits: { max: 5, required: true, label: "Permits" },
    logo: { max: 1, required: false, label: "Logo" },
    cover: { max: 1, required: false, label: "Cover image" }
  };
  const STATE_CODES = new Set(["AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"]);
  const PERSON_NAME = /^[\p{L}\p{M}]+(?:[ \u0027\u2019\u02BC-][\p{L}\p{M}]+)*$/u;
  const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"]);
  const RADIO_NAMES = new Set(["is_owner", "business_type", "order_types", "equipment_needed", "sells_alcohol"]);
  const BOOLEAN_NAMES = new Set(["liquor_license_confirmed", "agreement_accepted", "permits_confirmed"]);
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const form = $("#partner-form");
  const controls = $("#application-fields");
  const state = { step: 1, dirty: false, sending: false, succeeded: false, nextFileId: 0, files: { owner_id: [], permits: [], logo: [], cover: [] } };
  let processingQueue = Promise.resolve();
  let lastBusinessType = "";

  function value(name) {
    if (RADIO_NAMES.has(name)) return $(`input[name="${name}"]:checked`, form)?.value || "";
    if (BOOLEAN_NAMES.has(name)) return !!$(`[name="${name}"]`, form)?.checked;
    return ($(`[name="${name}"]`, form)?.value || "").trim();
  }

  function fullName(prefix) {
    return `${value(prefix + "_first_name")} ${value(prefix + "_last_name")}`.trim().replace(/ +/g, " ");
  }

  function formattedAddress(prefix) {
    return [value(prefix + "_address_line1"), value(prefix + "_address_line2"),
      `${value(prefix + "_city")}, ${value(prefix + "_state")} ${value(prefix + "_zip")}`].filter(Boolean).join("\n");
  }

  function normalizedPhone(name) {
    const entered = value(name);
    const digits = entered.replace(/\D/g, "");
    return entered.startsWith("+") ? `+${digits}` : `+1${digits.length === 11 ? digits.slice(1) : digits}`;
  }

  function isValidPhone(entered) {
    // Never accept alphabetic extensions, email addresses or arbitrary digit strings.
    if (!/^\+?[0-9 ().-]+$/.test(entered)) return false;
    const digits = entered.replace(/\D/g, "");
    if (/^(\d)\1+$/.test(digits)) return false;
    if (entered.startsWith("+") && !digits.startsWith("1")) return /^[2-9]\d{7,14}$/.test(digits);
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(national) && (!entered.startsWith("+") || digits.startsWith("1"));
  }

  function isValidEmail(entered, input) {
    if (input.validity.typeMismatch || entered.length > 254) return false;
    const parts = entered.split("@");
    if (parts.length !== 2) return false;
    const [local, domain] = parts;
    if (!local || local.length > 64 || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
    if (!/^[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(local)) return false;
    if (!/^[A-Za-z0-9.-]+$/.test(domain)) return false;
    const labels = domain.split(".");
    return labels.length > 1 && labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
      && /^(?:[A-Za-z]{2,63}|xn--[A-Za-z0-9-]{2,59})$/.test(labels[labels.length - 1]);
  }

  function stepTitle(step) {
    if (step === 2 && value("business_type")) return value("business_type") === "Restaurant" ? "Restaurant information" : "Grocery store information";
    return STEP_TITLES[step - 1];
  }

  function isConditionalInactive(name) {
    if (name.startsWith("owner_") && name !== "owner_id") return value("is_owner") !== "No";
    if (name === "liquor_license_confirmed") return value("sells_alcohol") !== "Yes";
    return false;
  }

  function setError(name, message) {
    const field = $(`[data-field="${name}"]`, form);
    const error = $(`#${name}-error`, form);
    if (!field || !error) return;
    field.classList.toggle("has-error", !!message);
    error.textContent = message || "";
    error.hidden = !message;
    $$(`[name="${name}"]`, form).forEach(input => {
      if (message) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    });
  }

  function fieldMessage(name) {
    if (isConditionalInactive(name)) return "";
    if (FILE_RULES[name]) {
      const entries = state.files[name];
      if (FILE_RULES[name].required && entries.length === 0) return name === "permits" ? "Add at least one permit or certification file." : "Add one owner government-issued ID file.";
      if (entries.length > FILE_RULES[name].max) return `Choose no more than ${FILE_RULES[name].max} files.`;
      if (entries.some(item => item.status === "preparing")) return "Your file is still being prepared. Please let it finish before continuing.";
      if (entries.some(item => item.status === "error")) return "Remove or replace the file marked with an error before continuing.";
      return "";
    }
    const input = $(`[name="${name}"]`, form);
    const entered = value(name);
    if (RADIO_NAMES.has(name)) return entered ? "" : "Please select an option.";
    if (BOOLEAN_NAMES.has(name)) return entered ? "" : "Please confirm this statement before continuing.";
    if (input?.required && !entered) return "Please complete this field.";
    if (!entered) return "";
    if (input?.hasAttribute("data-person-name") && !PERSON_NAME.test(entered.normalize("NFC"))) return "Use letters only. Spaces, hyphens and apostrophes in names are allowed.";
    if (input?.type === "email" && !isValidEmail(entered, input)) return "Enter a valid email address, such as name@example.com.";
    if (input?.type === "tel" && !isValidPhone(entered)) return "Enter a phone number with area code, or + and country code. No letters.";
    if (name.endsWith("_state") && !STATE_CODES.has(entered)) return "Select a state from the list.";
    if (name.endsWith("_zip") && !/^\d{5}(?:-\d{4})?$/.test(entered)) return "Enter a 5-digit ZIP Code or ZIP+4 (12345-6789).";
    if (name.endsWith("_city") && (!/\p{L}/u.test(entered) || /[@<>\r\n]/.test(entered))) return "Enter the city name.";
    if (name.endsWith("_address_line1") && (!/\p{L}/u.test(entered) || /[@<>\r\n]/.test(entered))) return "Enter a street address, not a phone number or email.";
    if (name.endsWith("_address_line2") && /[@<>\r\n]/.test(entered)) return "Enter an apartment, suite or unit, or leave this optional field blank.";
    if (name === "ein" && !/^\d{2}-?\d{7}$/.test(entered)) return "Enter 9 digits, with or without the dash: XX-XXXXXXX.";
    if (name === "category") {
      const allowed = value("business_type") === "Grocery Store"
        ? ["African Grocery Store", "Caribbean Grocery Store", "Other"]
        : ["African", "Caribbean", "Other"];
      if (!allowed.includes(entered)) return "Select a category for your business type.";
    }
    if (input?.maxLength > 0 && entered.length > input.maxLength) return `Use ${input.maxLength} characters or fewer.`;
    return "";
  }

  function validateStep(step, moveFocus = true) {
    let firstInvalid = null;
    STEP_FIELDS[step].forEach(name => {
      const message = fieldMessage(name);
      setError(name, message);
      if (message && !firstInvalid) firstInvalid = $(`[name="${name}"]`, form);
    });
    if (firstInvalid && moveFocus) {
      $("#step-status").textContent = "Please correct the highlighted fields before continuing.";
      firstInvalid.focus();
    }
    return !firstInvalid;
  }

  function refreshChoices() {
    $$(".choice", form).forEach(label => label.classList.toggle("is-checked", !!$("input", label)?.checked));
  }

  function updateConditions() {
    const ownerNeeded = value("is_owner") === "No";
    const ownerFields = $("#owner-fields");
    ownerFields.hidden = !ownerNeeded;
    ownerFields.disabled = !ownerNeeded;
    ["owner_first_name", "owner_last_name", "owner_phone", "owner_email"].forEach(name => {
      $(`[name="${name}"]`).required = ownerNeeded;
      if (!ownerNeeded) setError(name, "");
    });
    const licenseNeeded = value("sells_alcohol") === "Yes";
    const alcoholFields = $("#alcohol-fields");
    alcoholFields.hidden = !licenseNeeded;
    alcoholFields.disabled = !licenseNeeded;
    $("#liquor_license_confirmed").required = licenseNeeded;
    if (!licenseNeeded) {
      $("#liquor_license_confirmed").checked = false;
      setError("liquor_license_confirmed", "");
    }
    const businessType = value("business_type");
    if (businessType !== lastBusinessType) {
      const switchedType = !!lastBusinessType;
      lastBusinessType = businessType;
      if (switchedType) $("#category_detail").value = "";
      const grocery = businessType === "Grocery Store";
      $("#category-label").textContent = grocery ? "Grocery Store Type" : "Cuisine Type";
      $("#step-2-title").textContent = stepTitle(2);
      $("#business-name-label").textContent = grocery ? "Grocery store name" : "Restaurant name";
      $("#business-path-note").textContent = grocery ? "Grocery store application" : "Restaurant application";
      $("#category-detail-label").textContent = grocery ? "Country or specialty" : "Specific cuisine or country";
      $("#category_detail-hint").textContent = grocery ? "For example, Ghanaian, Nigerian or Jamaican groceries." : "For example, Ghanaian, Nigerian or Jamaican cuisine.";
      const select = $("#category");
      select.replaceChildren(new Option(grocery ? "Select grocery store type" : "Select cuisine type", ""));
      (grocery ? ["African Grocery Store", "Caribbean Grocery Store", "Other"] : ["African", "Caribbean", "Other"]).forEach(option => select.add(new Option(option, option)));
      setError("category", "");
    }
    refreshChoices();
  }

  function clearSubmissionError() {
    $("#submission-error").hidden = true;
    $("#submission-errors").replaceChildren();
  }

  function showSubmissionErrors(messages) {
    const list = $("#submission-errors");
    list.replaceChildren();
    const safeMessages = (Array.isArray(messages) ? messages : [messages]).slice(0, 30);
    safeMessages.forEach(message => {
      const item = document.createElement("li");
      item.textContent = typeof message === "string" ? message.slice(0, 2000) : "The server could not validate the application. Please contact support.";
      list.append(item);
    });
    $("#submission-error").hidden = false;
    $("#submission-error").focus();
  }

  function showStep(step, focus = true) {
    state.step = Math.min(6, Math.max(1, step));
    $$(".form-step").forEach(panel => { panel.hidden = Number(panel.dataset.step) !== state.step; });
    $("#step-counter").textContent = `Step ${state.step} of 6`;
    $("#step-summary").textContent = stepTitle(state.step);
    const progress = $("#application-progress");
    progress.value = state.step;
    progress.textContent = `Step ${state.step} of 6`;
    progress.setAttribute("aria-valuetext", `Step ${state.step} of 6: ${stepTitle(state.step)}`);
    $$(".step-track li").forEach((item, i) => {
      item.classList.toggle("is-complete", i + 1 < state.step);
      if (i + 1 === state.step) item.setAttribute("aria-current", "step");
      else item.removeAttribute("aria-current");
    });
    $("#back-button").hidden = state.step === 1;
    $("#next-button").hidden = state.step === 6;
    $("#submit-button").hidden = state.step !== 6;
    $("#next-note").hidden = state.step === 6;
    $("#next-note").textContent = state.step < 6 ? `Next: ${stepTitle(state.step + 1)}` : "";
    $("#file-rules").hidden = ![4, 5].includes(state.step);
    clearSubmissionError();
    if (state.step === 6) renderReview();
    if (focus) {
      $("#application-card").scrollIntoView({ block: "start", behavior: "auto" });
      $(`#step-${state.step}-title`).focus({ preventScroll: true });
      $("#step-status").textContent = `Step ${state.step} of 6. ${stepTitle(state.step)}.`;
    }
  }

  function formatSize(bytes) {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  function fileNames(name) {
    return state.files[name].length ? state.files[name].map(item => item.original.name).join("\n") : "Not provided (optional)";
  }

  function renderReview() {
    const ownerPairs = value("is_owner") === "No"
      ? [["Owner name", fullName("owner")], ["Owner phone", value("owner_phone")], ["Owner email", value("owner_email")]] : [];
    const groups = [
      { title: "Your information", step: 1, pairs: [["Name", fullName("applicant")], ["Email", value("applicant_email")], ["Phone", value("applicant_phone")], ["Mailing address", formattedAddress("mailing")], ["Business owner?", value("is_owner")], ...ownerPairs] },
      { title: stepTitle(2), step: 2, pairs: [["Business", value("business_name")], ["Type", value("business_type")], ["Email for updates", value("business_email")], ["Phone", value("business_phone")], ["Business address", formattedAddress("business")], ["Category", value("category")], ["Specific cuisine / country", value("category_detail") || "Not provided"], ["Orders", value("order_types")], ["Equipment needed?", value("equipment_needed")], ["Sells alcohol?", value("sells_alcohol")], ...(value("sells_alcohol") === "Yes" ? [["NYS liquor license", value("liquor_license_confirmed") ? "Confirmed" : "Not confirmed"]] : [])] },
      { title: "Your offer", step: 3, pairs: [["Plan", "Founding Partner"], ["Offer", OFFER_TEXT]] },
      { title: "Business images", step: 4, pairs: [["Logo", fileNames("logo")], ["Cover image", fileNames("cover")]] },
      { title: "Documents", step: 5, pairs: [["Owner ID", fileNames("owner_id")], ["Permits", fileNames("permits")], ["Business EIN", `Ending in ${value("ein").replace(/\D/g, "").slice(-4)}`]] }
    ];
    const consentNote = $("#owner-consent-review");
    consentNote.hidden = value("is_owner") !== "No";
    consentNote.textContent = value("is_owner") === "No" ? `Owner authorization is required from ${fullName("owner")} (${value("owner_email")}) before this business can be approved.` : "";
    const summary = $("#review-summary");
    summary.replaceChildren();
    groups.forEach(group => {
      const section = document.createElement("section");
      section.className = "review-group";
      const header = document.createElement("header");
      const title = document.createElement("h3"); title.textContent = group.title;
      const edit = document.createElement("button"); edit.type = "button"; edit.className = "edit-button";
      edit.textContent = "Edit"; edit.setAttribute("aria-label", `Edit ${group.title.toLowerCase()}`);
      edit.addEventListener("click", () => { if (!state.sending) showStep(group.step); });
      header.append(title, edit);
      const details = document.createElement("dl");
      group.pairs.forEach(([key, val]) => {
        const pair = document.createElement("div"); pair.className = "review-pair";
        const term = document.createElement("dt"); term.textContent = key;
        const description = document.createElement("dd"); description.textContent = val;
        pair.append(term, description); details.append(pair);
      });
      section.append(header, details); summary.append(section);
    });
  }

  async function readHead(file) {
    // FileReader works in Safari versions without Blob.arrayBuffer().
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = () => reject(new Error("This file could not be read. Please select it again."));
      reader.readAsArrayBuffer(file.slice(0, 512));
    });
  }

  async function identifyFile(file) {
    const ext = file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new Error("Choose a JPG, JPEG, PNG, WEBP, HEIC, HEIF or PDF file.");
    if (!file.size) throw new Error("This file is empty. Please choose another file.");
    const bytes = await readHead(file);
    const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
    let mime = "";
    if (ascii(0, 5) === "%PDF-") mime = "application/pdf";
    else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) mime = "image/jpeg";
    else if (bytes[0] === 137 && ascii(1, 4) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) mime = "image/png";
    else if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") mime = "image/webp";
    else if (ascii(4, 8) === "ftyp" && /heic|heix|hevc|hevx|heim|heis|hevm|hevs|mif1|msf1/.test(ascii(8, 64))) mime = ext === "heif" ? "image/heif" : "image/heic";
    if (!mime) throw new Error("This file is not a readable supported image or PDF. Please export it again.");
    if ((mime === "application/pdf") !== (ext === "pdf")) throw new Error("The file contents do not match its extension. Please export it as an image or PDF again.");
    return mime;
  }

  async function decodeImage(file, mime) {
    const blob = file.type === mime ? file : new Blob([file], { type: mime });
    if (typeof createImageBitmap === "function") {
      try {
        const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
        return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() };
      } catch (_) { /* Safari may decode HEIC through <img> even when this path fails. */ }
    }
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const image = new Image();
      const timeout = window.setTimeout(() => { cleanup(); reject(new Error("Image decoding timed out.")); }, 30000);
      function cleanup() { clearTimeout(timeout); URL.revokeObjectURL(url); image.onload = null; image.onerror = null; }
      image.onload = () => {
        cleanup();
        if (!image.naturalWidth || !image.naturalHeight) { reject(new Error("Image dimensions could not be read.")); return; }
        resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight, dispose: () => { image.src = ""; } });
      };
      image.onerror = () => { cleanup(); reject(new Error("Image format cannot be decoded by this browser.")); };
      image.src = url;
    });
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The photo could not be compressed.")), "image/jpeg", JPEG_QUALITY);
    });
  }

  async function prepareFile(file) {
    const mime = await identifyFile(file);
    if (mime === "application/pdf") {
      if (file.size > MAX_FILE_BYTES) throw new Error("This PDF is over 8 MB. Upload a smaller PDF; PDFs are not compressed.");
      return { blob: file, name: file.name, mimeType: mime, note: "PDF kept unchanged." };
    }
    let decoded;
    try { decoded = await decodeImage(file, mime); }
    catch (_) {
      if (mime === "image/heic" || mime === "image/heif") {
        if (file.size > MAX_FILE_BYTES) throw new Error("This browser cannot compress HEIC/HEIF. Export as JPG or PDF, or choose a file under 8 MB.");
        // Native HEIC decoding is not available in every browser. Do not add a
        // third-party decoder or send IDs to an external conversion service.
        return { blob: file, name: file.name, mimeType: mime, note: "This browser cannot compress HEIC/HEIF. Original file will be uploaded (under 8 MB).", warning: true };
      }
      throw new Error("This image could not be opened. Try exporting it again as JPG, PNG or PDF.");
    }
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(decoded.width, decoded.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    try {
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Photo processing is unavailable. Please upload a PDF or try another browser.");
      // A white matte prevents transparent PNG backgrounds becoming black in JPEG.
      context.fillStyle = "#FFFFFF"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
      const blob = await canvasBlob(canvas);
      if (blob.size > MAX_FILE_BYTES) throw new Error("This image is still over 8 MB after compression. Choose a smaller image.");
      return { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg", mimeType: "image/jpeg", note: `Prepared photo · ${canvas.width} × ${canvas.height} px` };
    } finally { decoded.dispose(); canvas.width = 1; canvas.height = 1; }
  }

  function renderFiles(name) {
    const list = $(`#${name}-list`);
    list.replaceChildren();
    state.files[name].forEach(entry => {
      const item = document.createElement("li"); item.className = "file-row";
      const details = document.createElement("div"); details.className = "file-details";
      const filename = document.createElement("span"); filename.className = "file-name"; filename.textContent = entry.original.name;
      const status = document.createElement("span"); status.className = "file-status";
      if (entry.status === "preparing") status.textContent = "Preparing file…";
      else if (entry.status === "error") { status.classList.add("is-error"); status.textContent = entry.error; }
      else { status.textContent = `${formatSize(entry.prepared.blob.size)} · ${entry.prepared.note}`; if (entry.prepared.warning) status.classList.add("is-warning"); }
      details.append(filename, status);
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "file-remove";
      remove.textContent = "×"; remove.disabled = state.sending;
      remove.setAttribute("aria-label", `Remove ${entry.original.name}`);
      remove.addEventListener("click", () => {
        if (state.sending) return;
        state.files[name] = state.files[name].filter(file => file.id !== entry.id);
        state.dirty = true; renderFiles(name); setError(name, "");
        $(`#${name}`).focus();
        $("#step-status").textContent = `${entry.original.name} removed.`;
      });
      item.append(details, remove); list.append(item);
    });
  }

  function queueFiles(name, files) {
    if (state.sending) return;
    const selected = Array.from(files);
    if (!selected.length) return;
    const rule = FILE_RULES[name];
    if (rule.max === 1 && selected.length > 1) { setError(name, "Choose one file only."); return; }
    const unique = selected.filter((file, i, all) =>
      !all.slice(0, i).some(other => other.name === file.name && other.size === file.size && other.lastModified === file.lastModified) &&
      (rule.max === 1 || !state.files[name].some(entry => entry.original.name === file.name && entry.original.size === file.size && entry.original.lastModified === file.lastModified)));
    if (rule.max > 1 && state.files[name].length + unique.length > rule.max) { setError(name, "Choose no more than 5 permit files. Extra files were not added."); return; }
    if (rule.max === 1) state.files[name] = [];
    setError(name, ""); state.dirty = true;
    unique.forEach(file => {
      const entry = { id: ++state.nextFileId, original: file, status: "preparing", prepared: null, error: "" };
      state.files[name].push(entry);
      processingQueue = processingQueue.then(async () => {
        if (!state.files[name].includes(entry)) return;
        try {
          const prepared = await prepareFile(file);
          if (!state.files[name].includes(entry)) return;
          entry.prepared = prepared; entry.status = "ready";
        } catch (error) {
          if (!state.files[name].includes(entry)) return;
          entry.status = "error"; entry.error = error instanceof Error ? error.message : "The file could not be prepared.";
        }
        renderFiles(name);
        const errorElement = $(`#${name}-error`);
        if (entry.status === "error" || !errorElement.hidden) setError(name, fieldMessage(name));
        $("#step-status").textContent = entry.status === "ready" ? `${file.name} is ready.` : `${file.name}: ${entry.error}`;
      });
    });
    renderFiles(name);
  }

  function asBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== "string" || !result.includes(",")) { reject(new Error("A file could not be encoded. Please select it again.")); return; }
        resolve(result.slice(result.indexOf(",") + 1));
      };
      reader.onerror = () => reject(new Error("A file could not be read. Please select it again."));
      reader.readAsDataURL(blob);
    });
  }

  async function createPayload() {
    const ownerIsApplicant = value("is_owner") === "Yes";
    const digits = value("ein").replace(/\D/g, "");
    // Separate UI names/addresses are composed into the original API fields.
    // The server derives owner authorization requirements from is_owner === "No".
    // Keep this object aligned with the Apps Script contract. No extra keys,
    // data-URL prefixes, analytics, tracking IDs, or file metadata are sent.
    const payload = {
      applicant_name: fullName("applicant"), applicant_email: value("applicant_email"),
      applicant_phone: normalizedPhone("applicant_phone"), mailing_address: formattedAddress("mailing"),
      is_owner: value("is_owner"), owner_name: ownerIsApplicant ? "" : fullName("owner"),
      owner_phone: ownerIsApplicant ? "" : normalizedPhone("owner_phone"), owner_email: ownerIsApplicant ? "" : value("owner_email"),
      business_type: value("business_type"), business_name: value("business_name"),
      business_email: value("business_email"), business_phone: normalizedPhone("business_phone"), business_address: formattedAddress("business"),
      category: value("category"), category_detail: value("category_detail"), order_types: value("order_types"),
      equipment_needed: value("equipment_needed"), sells_alcohol: value("sells_alcohol"),
      liquor_license_confirmed: value("sells_alcohol") === "Yes" && value("liquor_license_confirmed"),
      ein: `${digits.slice(0, 2)}-${digits.slice(2)}`, plan: "Founding Partner",
      agreement_accepted: value("agreement_accepted"), permits_confirmed: value("permits_confirmed"), website: value("website"),
      files: { owner_id: [], permits: [], logo: [], cover: [] }
    };
    // Sequential encoding avoids decoding/encoding eight photos in parallel.
    for (const name of Object.keys(FILE_RULES)) {
      for (const entry of state.files[name]) {
        if (entry.status !== "ready" || !entry.prepared || entry.prepared.blob.size > MAX_FILE_BYTES) throw new Error(`Check the ${FILE_RULES[name].label.toLowerCase()} files before submitting.`);
        payload.files[name].push({ name: entry.prepared.name, mimeType: entry.prepared.mimeType, data: await asBase64(entry.prepared.blob) });
      }
    }
    return payload;
  }

  function configuredAgreement() {
    if (!AGREEMENT_URL.trim() || AGREEMENT_URL.trim() === "#") return false;
    try { const url = new URL(AGREEMENT_URL, location.href); return url.protocol === "https:"; } catch (_) { return false; }
  }

  function configuredEndpoint() {
    // Restrict sensitive application documents to an explicitly configured
    // Google Apps Script HTTPS /exec deployment, not a pasted arbitrary URL.
    try {
      const url = new URL(APPS_SCRIPT_URL);
      return url.protocol === "https:" && url.hostname === "script.google.com" && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec\/?$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash;
    } catch (_) { return false; }
  }

  function configurationMessages() {
    const errors = [];
    if (!configuredEndpoint()) errors.push(`Applications are not open for submission yet. Please contact ${SUPPORT_EMAIL}; your entries have not been sent.`);
    if (!configuredAgreement()) errors.push("The Merchant Partner Agreement is not available yet. Please contact support before agreeing or submitting.");
    return errors;
  }

  function setSending(sending) {
    state.sending = sending;
    controls.disabled = sending;
    $("#submit-button").disabled = sending;
    form.setAttribute("aria-busy", String(sending));
    $("#submission-status").hidden = !sending;
    $("#submit-button").textContent = sending ? "Submitting your application…" : "Submit application →";
    if (!sending) updateConditions();
  }

  function finishSuccess(applicationId, businessEmail, consent) {
    state.succeeded = true; state.dirty = false;
    $("#application-id").textContent = applicationId;
    $("#success-message").textContent = `Application ${applicationId} received. We'll review it within 2 business days and email you at ${businessEmail}.`;
    const consentStatus = $("#owner-consent-status");
    consentStatus.hidden = !consent.required;
    consentStatus.textContent = consent.required
      ? (consent.sent ? `A consent email was sent to ${consent.email}. The owner must authorize the application before approval.`
        : "Owner authorization is required before the business can be approved.") : "";
    $("#success-screen").hidden = false;
    $("#form-progress").hidden = true;
    $("#submission-status").hidden = true;
    // Release uploaded documents and clear sensitive form values after receipt.
    Object.keys(state.files).forEach(key => { state.files[key] = []; });
    form.reset(); form.replaceChildren(); form.hidden = true;
    $("#application-card").scrollIntoView({ block: "start", behavior: "auto" });
    $("#success-title").focus({ preventScroll: true });
  }

  async function submitApplication(event) {
    event.preventDefault();
    if (state.sending || state.succeeded) return;
    if (state.step < 6) {
      if (validateStep(state.step)) showStep(state.step + 1);
      return;
    }
    clearSubmissionError();
    for (let step = 1; step <= 6; step++) {
      if (!validateStep(step, false)) { showStep(step); validateStep(step); return; }
    }
    const configurationErrors = configurationMessages();
    if (configurationErrors.length) { showSubmissionErrors(configurationErrors); return; }
    const businessEmail = value("business_email");
    const ownerConsent = { required: value("is_owner") === "No", email: value("owner_email"), sent: false };
    let timer;
    let timedOut = false;
    setSending(true);
    try {
      const payload = await createPayload();
      const controller = new AbortController();
      timer = window.setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload),
        redirect: "follow",
        credentials: "omit",
        cache: "no-store",
        signal: controller.signal
      });
      const body = await response.text();
      let result;
      try { result = JSON.parse(body); }
      catch (_) { throw new Error("We could not confirm receipt of your application. Your entries are still here. Check your email or contact support before trying again to avoid a duplicate application."); }
      if (!response.ok || !result || result.ok !== true) {
        const errors = Array.isArray(result?.errors) && result.errors.length ? result.errors : ["Your application could not be accepted. Please check your details or contact support."];
        showSubmissionErrors(errors); return;
      }
      if (typeof result.applicationId !== "string" || !result.applicationId.trim() || result.applicationId.length > 100) throw new Error("The server did not return an application number. Check your email or contact support before submitting again.");
      // Optional, documented server response. A field filled by the applicant is NOT consent.
      ownerConsent.sent = ownerConsent.required && result.ownerConsent?.status === "sent"
        && typeof result.ownerConsent?.email === "string"
        && result.ownerConsent.email.toLowerCase() === ownerConsent.email.toLowerCase();
      finishSuccess(result.applicationId.trim(), businessEmail, ownerConsent);
    } catch (error) {
      const message = timedOut
        ? "The connection timed out before we could confirm receipt. Your entries are still here. Check your email or contact support before submitting again; the server may have received the application."
        : error instanceof TypeError
          ? "We could not confirm receipt because of a network or connection problem. Your entries are still here. Check your email or contact support before trying again."
          : error instanceof Error ? error.message : "We could not confirm receipt. Please contact support before trying again.";
      showSubmissionErrors([message]);
    } finally {
      clearTimeout(timer);
      if (!state.succeeded) setSending(false);
      else state.sending = false;
    }
  }

  function initialize() {
    $("#offer-text").textContent = OFFER_TEXT;
    $("#copyright-year").textContent = String(new Date().getFullYear());
    $("#agreement-link").href = AGREEMENT_URL;
    $("#agreement-notice").hidden = configuredAgreement();
    $("#agreement-link").addEventListener("click", event => {
      if (!configuredAgreement()) {
        event.preventDefault();
        $("#agreement-notice").hidden = false;
        $("#step-status").textContent = "The merchant agreement is not available yet. Please contact support.";
      }
    });
    $("#next-button").addEventListener("click", () => { if (!state.sending && validateStep(state.step)) showStep(state.step + 1); });
    $("#back-button").addEventListener("click", () => { if (!state.sending) showStep(state.step - 1); });
    form.addEventListener("submit", submitApplication);
    form.addEventListener("change", event => {
      const input = event.target;
      if (!input.name || input.type === "file") return;
      state.dirty = true; updateConditions();
      if ($(`#${input.name}-error`)?.hidden === false) setError(input.name, fieldMessage(input.name));
    });
    form.addEventListener("beforeinput", event => {
      const input = event.target;
      if (event.isComposing || !event.data || !event.inputType.startsWith("insert")) return;
      const forbidden = input.matches('[data-person-name]') ? /[^\p{L}\p{M} \u0027\u2019\u02BC-]/u
        : input.matches('input[type="tel"]') ? /[^0-9 +().-]/
        : input.matches('[name$="_zip"],#ein') ? /[^0-9-]/ : null;
      if (forbidden && forbidden.test(event.data) && event.cancelable) {
        event.preventDefault();
        setError(input.name, input.matches('[data-person-name]') ? "Use letters, spaces, hyphens or apostrophes only."
          : input.type === "tel" ? "Phone numbers cannot contain letters or email addresses." : "Use digits and a dash only.");
      }
    });
    form.addEventListener("input", event => {
      const input = event.target;
      if (!input.name || input.type === "file") return;
      state.dirty = true;
      if ($(`#${input.name}-error`)?.hidden === false || input.matches('[data-person-name],input[type="tel"],[name$="_zip"]')) setError(input.name, fieldMessage(input.name));
    });
    form.addEventListener("focusout", event => {
      const input = event.target;
      if (input.matches('input,select') && input.value.trim()) {
        if (input.matches('[data-person-name]')) input.value = input.value.normalize("NFC").trim().replace(/ +/g, " ");
        setError(input.name, fieldMessage(input.name));
      }
    });
    Object.keys(FILE_RULES).forEach(name => {
      const input = $(`#${name}`);
      input.addEventListener("change", () => { queueFiles(name, input.files); input.value = ""; });
      const zone = $(`[data-upload-zone="${name}"]`);
      ["dragenter", "dragover"].forEach(type => zone.addEventListener(type, event => { event.preventDefault(); if (!state.sending) zone.classList.add("is-dragging"); }));
      ["dragleave", "drop"].forEach(type => zone.addEventListener(type, event => {
        event.preventDefault(); zone.classList.remove("is-dragging");
        if (type === "drop" && !state.sending) queueFiles(name, event.dataTransfer?.files || []);
      }));
    });
    window.addEventListener("beforeunload", event => {
      if (state.dirty && !state.succeeded) { event.preventDefault(); event.returnValue = ""; }
    });
    // No localStorage/sessionStorage, cookies, analytics, or external scripts.
    controls.disabled = false; updateConditions(); showStep(1, false);
    $("#initialization-message").hidden = true;
  }

  initialize();
})();
