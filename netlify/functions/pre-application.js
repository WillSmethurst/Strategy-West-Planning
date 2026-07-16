/**
 * Strategy West Planning - Pre-Application handler
 *
 * Flow:  form POST  ->  append row to Google Sheet  ->  upsert GHL contact  ->  attach note
 *
 * The Sheet is the system of record. If the Sheet write fails, the client is told to
 * try again. GHL is secondary: if it fails, the answers are already safe in the Sheet,
 * so we log and return success rather than making the client retype everything.
 *
 * The Social Security number is written to the Sheet ONLY. It is deliberately kept out
 * of the GHL contact note, which is visible to every user in the sub-account. The note
 * records whether an SSN was provided, not what it is.
 *
 * No third-party dependencies. Node 20 on Netlify provides fetch and node:crypto, which
 * is everything needed to sign a service-account JWT and call the Sheets REST API.
 *
 * Required environment variables (Netlify -> Site configuration -> Environment variables):
 *   GHL_PIT                      Private Integration Token for the sub-account (starts "pit-")
 *   GHL_LOCATION_ID              Sub-account Location ID
 *   SHEET_ID                     Google Sheet ID (from the sheet's URL)
 *   SHEET_TAB                    Worksheet/tab name          (optional, default "Pre-Applications")
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL Service account address (...iam.gserviceaccount.com)
 *   GOOGLE_PRIVATE_KEY           Service account private key, PEM including BEGIN/END lines.
 *                                Literal \n sequences are converted to real newlines.
 */

const crypto = require('crypto');

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';
const MAX_POLICIES = 5;

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';

/* ─── Sheet column order. Must match the header row in the Sheet exactly. ─── */
const COLUMNS = [
  'Submitted At',
  'First Name',
  'Middle Initial',
  'Last Name',
  'Date of Birth',
  'Place of Birth',
  'Email',
  'Phone',
  'Street Address',
  'Apt / Suite #',
  'City',
  'State',
  'Zip / Postal Code',
  'Country',
  'Social Security Number / ITIN',
  'Valid U.S. Driver\u2019s License?',
  'Driver\u2019s License Number',
  'State or Country of Issue',
  'Type of Citizenship',
  'Net Worth',
  'Estimated Annual Income',
  'Existing Coverage Outside of Job?',
  'Policy 1 \u2014 Amount of Coverage',
  'Policy 1 \u2014 Type of Coverage',
  'Policy 2 \u2014 Amount of Coverage',
  'Policy 2 \u2014 Type of Coverage',
  'Policy 3 \u2014 Amount of Coverage',
  'Policy 3 \u2014 Type of Coverage',
  'Policy 4 \u2014 Amount of Coverage',
  'Policy 4 \u2014 Type of Coverage',
  'Policy 5 \u2014 Amount of Coverage',
  'Policy 5 \u2014 Type of Coverage',
  'Current Occupation',
  'Employer',
  'Employer Address',
  'Doctor \u2014 Full Name',
  'Doctor \u2014 Office Phone',
  'Doctor \u2014 Email',
  'Doctor \u2014 Office Address',
];

/* ─── helpers ─────────────────────────────────────────── */

const clean = (v, max = 500) =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const blank = '-'; // placeholder for empty values in the note

function stamp() {
  return new Date().toLocaleString('en-US', {
    timeZone: 'America/Denver',
    dateStyle: 'medium',
    timeStyle: 'short',
  }) + ' MT';
}

function normalizePolicies(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_POLICIES) : [];
  return list
    .map(p => ({ amount: clean(p && p.amount, 60), type: clean(p && p.type, 60) }))
    .filter(p => p.amount || p.type);
}

/* ─── Google auth: sign a service-account JWT, trade it for an access token ─── */

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function privateKey() {
  const raw = process.env.GOOGLE_PRIVATE_KEY || '';
  // Netlify stores the key on one line with literal \n sequences. Restore real newlines.
  return raw.replace(/\\n/g, '\n');
}

async function accessToken() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = privateKey();

  if (!email) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL is not set');
  if (!key.includes('BEGIN PRIVATE KEY')) {
    throw new Error('GOOGLE_PRIVATE_KEY is missing or malformed');
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64url(JSON.stringify({
    iss: email,
    scope: SHEETS_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${claim}`);
  signer.end();
  const signature = base64url(signer.sign(key));
  const assertion = `${header}.${claim}.${signature}`;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Google token ${res.status}: ${text.slice(0, 300)}`);
  }

  const token = JSON.parse(text).access_token;
  if (!token) throw new Error('Google token response contained no access_token');
  return token;
}

/* ─── Google Sheets ───────────────────────────────────── */

async function appendRow(row) {
  const token = await accessToken();
  const sheetId = process.env.SHEET_ID;
  const tab = process.env.SHEET_TAB || 'Pre-Applications';

  if (!sheetId) throw new Error('SHEET_ID is not set');

  // valueInputOption=RAW so SSNs and zips keep leading zeros and aren't reformatted.
  const range = encodeURIComponent(`${tab}!A1`);
  const url = `${SHEETS_BASE}/${sheetId}/values/${range}:append`
    + `?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [row] }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sheets append ${res.status}: ${text.slice(0, 300)}`);
  }
}

/* ─── GoHighLevel ─────────────────────────────────────── */

async function ghl(path, body) {
  const res = await fetch(`${GHL_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GHL_PIT}`,
      Version: GHL_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`GHL ${path} ${res.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function upsertContact(d) {
  const out = await ghl('/contacts/upsert', {
    locationId: process.env.GHL_LOCATION_ID,
    firstName: d.firstName,
    lastName: d.lastName,
    name: [d.firstName, d.lastName].filter(Boolean).join(' '),
    email: d.email,
    phone: d.phone,
    source: 'Pre-Application Form',
  });
  const id = out?.contact?.id || out?.id;
  if (!id) throw new Error('GHL upsert returned no contact id');
  return id;
}

function buildNote(d, policies) {
  const L = [];
  const row = (k, v) => L.push(`${k}: ${v || blank}`);

  L.push(`PRE-APPLICATION | submitted ${stamp()}`);
  L.push('');

  L.push('YOUR INFORMATION');
  row('First Name', d.firstName);
  row('Middle Initial', d.middleInitial);
  row('Last Name', d.lastName);
  row('Date of Birth', d.dob);
  row('Place of Birth', d.placeOfBirth);
  row('Email', d.email);
  row('Phone', d.phone);
  L.push('');

  L.push('RESIDENTIAL ADDRESS');
  row('Street', d.street);
  row('Apt / Suite #', d.apt);
  row('City', d.city);
  row('State', d.state);
  row('Zip / Postal Code', d.zip);
  row('Country', d.country);
  L.push('');

  L.push('IDENTIFICATION & CITIZENSHIP');
  /* The SSN is intentionally NOT written here. It lives in the Sheet only. */
  row('SSN / ITIN', d.ssn ? 'Provided (see Sheet)' : 'Not provided');
  row('Valid U.S. Driver\u2019s License', d.hasDL);
  if (d.hasDL === 'Yes') {
    row('Driver\u2019s License Number', d.dlNumber);
    row('State or Country of Issue', d.dlIssuer);
  }
  row('Type of Citizenship', d.citizenship);
  L.push('');

  L.push('FINANCIAL PICTURE');
  row('Net Worth', d.netWorth);
  row('Estimated Annual Income', d.annualIncome);
  row('Existing Coverage Outside of Job', d.hasCoverage);
  if (d.hasCoverage === 'Yes') {
    if (policies.length) {
      policies.forEach((p, i) => {
        L.push(`  Policy ${i + 1} | Amount: ${p.amount || blank}  |  Type: ${p.type || blank}`);
      });
    } else {
      L.push('  (Answered Yes, but no policy details were entered)');
    }
  }
  L.push('');

  L.push('EMPLOYMENT');
  row('Current Occupation', d.occupation);
  row('Employer', d.employer);
  row('Employer Address', d.employerAddress);
  L.push('');

  L.push('PRIMARY DOCTOR');
  row('Full Name', d.doctorName);
  row('Office Phone', d.doctorPhone);
  row('Email', d.doctorEmail);
  row('Office Address', d.doctorAddress);

  return L.join('\n');
}

/* ─── handler ─────────────────────────────────────────── */

exports.handler = async (event) => {
  const reply = (status, body) => ({
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== 'POST') {
    return reply(405, { message: 'Method not allowed' });
  }

  let d;
  try {
    d = JSON.parse(event.body || '{}');
  } catch {
    return reply(400, { message: 'Malformed request' });
  }

  /* Bot traps: honeypot filled, or form completed impossibly fast.
     Return 200 so bots don't learn they were caught. */
  if (clean(d.website)) return reply(200, { ok: true });
  const elapsed = Date.now() - Number(d.startedAt || 0);
  if (Number.isFinite(elapsed) && elapsed > 0 && elapsed < 4000) {
    return reply(200, { ok: true });
  }

  /* Normalize every field through clean() - never trust the client. */
  const f = {};
  [
    'firstName', 'middleInitial', 'lastName', 'dob', 'placeOfBirth', 'email', 'phone',
    'street', 'apt', 'city', 'state', 'zip', 'country', 'ssn', 'hasDL', 'dlNumber',
    'dlIssuer', 'citizenship', 'netWorth', 'annualIncome', 'hasCoverage', 'occupation',
    'employer', 'employerAddress', 'doctorName', 'doctorPhone', 'doctorEmail',
    'doctorAddress',
  ].forEach(k => { f[k] = clean(d[k]); });

  /* Server-side mirror of the form's required rules. */
  const required = {
    firstName: 'First name', lastName: 'Last name', dob: 'Date of birth',
    placeOfBirth: 'Place of birth', email: 'Email address', phone: 'Phone number',
    street: 'Street address', city: 'City', state: 'State', zip: 'Zip / postal code',
    country: 'Country', hasDL: 'Driver\u2019s license question',
    citizenship: 'Type of citizenship', hasCoverage: 'Existing coverage question',
  };
  const missing = Object.keys(required).filter(k => !f[k]);
  if (f.hasDL === 'Yes') {
    if (!f.dlNumber) missing.push('dlNumber');
    if (!f.dlIssuer) missing.push('dlIssuer');
  }
  if (missing.length) {
    return reply(400, { message: 'Some required answers are missing.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) {
    return reply(400, { message: 'Email address looks invalid.' });
  }

  /* If they answered "No", discard any conditional values that came along. */
  if (f.hasDL !== 'Yes') { f.dlNumber = ''; f.dlIssuer = ''; }
  const policies = f.hasCoverage === 'Yes' ? normalizePolicies(d.policies) : [];

  /* Flatten policies into the fixed Policy 1-5 column pairs. */
  const policyCells = [];
  for (let i = 0; i < MAX_POLICIES; i++) {
    policyCells.push(policies[i]?.amount || '', policies[i]?.type || '');
  }

  const row = [
    stamp(),
    f.firstName, f.middleInitial, f.lastName, f.dob, f.placeOfBirth, f.email, f.phone,
    f.street, f.apt, f.city, f.state, f.zip, f.country,
    f.ssn, f.hasDL, f.dlNumber, f.dlIssuer, f.citizenship,
    f.netWorth, f.annualIncome, f.hasCoverage,
    ...policyCells,
    f.occupation, f.employer, f.employerAddress,
    f.doctorName, f.doctorPhone, f.doctorEmail, f.doctorAddress,
  ];

  if (row.length !== COLUMNS.length) {
    console.error(`Column drift: row ${row.length} vs headers ${COLUMNS.length}`);
    return reply(500, { message: 'Server misconfiguration' });
  }

  /* The Sheet is the system of record - it must succeed. */
  try {
    await appendRow(row);
  } catch (err) {
    console.error('Sheets append failed:', err.message);
    return reply(502, { message: 'We couldn\u2019t save that. Please try again.' });
  }

  /* GHL is secondary. If it fails, the answers are already safe in the Sheet,
     so we still return success to the client and log for manual repair. */
  try {
    const contactId = await upsertContact(f);
    await ghl(`/contacts/${contactId}/notes`, {
      body: buildNote(f, policies),
      userId: process.env.GHL_USER_ID || undefined,
    });
  } catch (err) {
    console.error('GHL step failed (row is in the Sheet):', err.message);
  }

  return reply(200, { ok: true });
};
