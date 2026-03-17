const { google } = require('googleapis');
const { Resend } = require('resend');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);
    const { character, variation, imageUrl, originalFilePath, lockedBy, notes, action, unlockPin } = data;

    // Handle unlock action
    if (action === 'unlock') {
      if (unlockPin !== process.env.UNLOCK_PIN) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Invalid unlock PIN' }),
        };
      }

      // Remove the row from Google Sheets
      await unlockCharacter(character);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `${character} unlocked` }),
      };
    }

    // Validate required fields for lock-in
    if (!character || !variation || !imageUrl || !lockedBy) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: character, variation, imageUrl, lockedBy' }),
      };
    }

    // Write to Google Sheets
    await writeToSheet({
      character,
      variation,
      imageUrl,
      originalFilePath: originalFilePath || '',
      lockedBy,
      lockDate: new Date().toISOString(),
      notes: notes || '',
    });

    // Send notification email via Resend
    await sendLockInEmail({ character, variation, imageUrl, lockedBy, notes });

    // Log for audit
    console.log('=== CHARACTER LOCKED IN ===');
    console.log(`Character: ${character}`);
    console.log(`Variation: ${variation}`);
    console.log(`Locked By: ${lockedBy}`);
    console.log(`Image: ${imageUrl}`);
    console.log(`Original: ${originalFilePath || '(not set)'}`);
    console.log(`Notes: ${notes || '(none)'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('=== END LOCK-IN ===');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: `${character} locked in as ${variation}`,
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('Lock-in error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: err.message }),
    };
  }
};

// ---- Google Sheets helpers ----

async function getAuth() {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await auth.authorize();
  return auth;
}

async function writeToSheet(data) {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.log('Google Sheets not configured — skipping sheet write. Data:', JSON.stringify(data));
    return;
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  // First check if character already has a row — update it if so
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Casting Selections!A:A',
  });

  const rows = existing.data.values || [];
  let rowIndex = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === data.character) {
      rowIndex = i + 1; // 1-indexed
      break;
    }
  }

  const rowData = [
    data.character,
    data.variation,
    data.imageUrl,
    data.originalFilePath,
    'locked',
    data.lockedBy,
    data.lockDate,
    data.notes,
  ];

  if (rowIndex > 0) {
    // Update existing row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `Casting Selections!A${rowIndex}:H${rowIndex}`,
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  } else {
    // Append new row
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Casting Selections!A:H',
      valueInputOption: 'RAW',
      requestBody: { values: [rowData] },
    });
  }
}

async function unlockCharacter(character) {
  if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
    console.log('Google Sheets not configured — skipping unlock for:', character);
    return;
  }

  const auth = await getAuth();
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;

  // Find the row and update status to unlocked
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: 'Casting Selections!A:H',
  });

  const rows = existing.data.values || [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === character) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Casting Selections!E${i + 1}`,
        valueInputOption: 'RAW',
        requestBody: { values: [['unlocked']] },
      });
      break;
    }
  }
}

// ---- Email notification ----

async function sendLockInEmail({ character, variation, imageUrl, lockedBy, notes }) {
  if (!process.env.RESEND_API_KEY) {
    console.log('Resend not configured — skipping email notification');
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const recipients = [process.env.NOTIFICATION_EMAIL_1 || 'khalilcm2000@gmail.com'];
  if (process.env.NOTIFICATION_EMAIL_2) recipients.push(process.env.NOTIFICATION_EMAIL_2);

  const siteUrl = 'https://1974-amityville-portal.netlify.app';
  const gold = '#c9a84c';
  const bg = '#141414';
  const card = '#1c1c1c';
  const text = '#e8e4dc';
  const dim = '#8a8580';
  const green = '#4a9e6e';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${bg};font-family:'Inter',-apple-system,Helvetica,Arial,sans-serif;color:${text};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:12px;color:${gold};letter-spacing:0.3em;margin-bottom:8px;">1 9 7 4</div>
      <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:28px;font-weight:700;letter-spacing:0.04em;">AMITYVILLE</div>
      <div style="width:60px;height:2px;background:${gold};margin:12px auto;"></div>
      <div style="font-size:13px;color:${dim};letter-spacing:0.1em;text-transform:uppercase;">Character Lock-In Notification</div>
    </div>

    <div style="background:${green};color:white;text-align:center;padding:12px;border-radius:8px;margin-bottom:24px;font-weight:600;font-size:14px;letter-spacing:0.08em;">
      LOCKED IN
    </div>

    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:6px 0;">Character</td>
          <td style="color:${gold};font-weight:700;text-align:right;padding:6px 0;font-size:16px;">${character}</td>
        </tr>
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:6px 0;">Variation</td>
          <td style="color:${text};font-weight:600;text-align:right;padding:6px 0;">${variation}</td>
        </tr>
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:6px 0;">Locked By</td>
          <td style="color:${text};text-align:right;padding:6px 0;">${lockedBy}</td>
        </tr>
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:6px 0;">Date</td>
          <td style="color:${text};text-align:right;padding:6px 0;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
      </table>
    </div>

    ${imageUrl ? `
    <div style="text-align:center;margin-bottom:24px;">
      <img src="${siteUrl}/${imageUrl}" alt="${character} ${variation}" style="max-width:300px;border-radius:8px;border:2px solid ${gold};">
    </div>
    ` : ''}

    ${notes ? `
    <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:14px;color:${gold};letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">
      <span style="display:inline-block;width:30px;height:2px;background:${gold};vertical-align:middle;margin-right:8px;"></span>
      NOTES
    </div>
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;color:${dim};font-size:14px;line-height:1.6;">
      ${notes}
    </div>
    ` : ''}

    <div style="text-align:center;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:${dim};">
      <p>Locked via <a href="${siteUrl}" style="color:${gold};text-decoration:none;">1974 Amityville Client Portal</a></p>
    </div>
  </div>
</body>
</html>`;

  const plainText = [
    '=== 1974 AMITYVILLE — CHARACTER LOCK-IN ===',
    '',
    `Character: ${character}`,
    `Variation: ${variation}`,
    `Locked By: ${lockedBy}`,
    `Date: ${new Date().toISOString()}`,
    notes ? `Notes: ${notes}` : '',
    '',
    `View portal: ${siteUrl}`,
  ].filter(Boolean).join('\n');

  await resend.emails.send({
    from: process.env.FROM_EMAIL || 'Amityville Portal <onboarding@resend.dev>',
    to: recipients,
    subject: `🔒 Character Locked In: ${character} — ${variation}`,
    html,
    text: plainText,
  });
}
