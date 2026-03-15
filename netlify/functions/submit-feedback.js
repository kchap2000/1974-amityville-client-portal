const { Resend } = require('resend');

exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const data = JSON.parse(event.body);
    const { reviewerName, selections, moodboardPicks, moodboardNotes, generalNotes, date } = data;

    // Validate
    if (!reviewerName || !selections || !Array.isArray(selections)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required fields: reviewerName, selections' }),
      };
    }

    // Build the email HTML
    const emailHtml = buildEmailHtml(reviewerName, selections, moodboardPicks, moodboardNotes, generalNotes, date);
    const emailText = buildEmailText(reviewerName, selections, moodboardPicks, moodboardNotes, generalNotes, date);

    // Send email via Resend
    const resend = new Resend(process.env.RESEND_API_KEY);

    const recipients = [process.env.NOTIFICATION_EMAIL_1];
    if (process.env.NOTIFICATION_EMAIL_2) {
      recipients.push(process.env.NOTIFICATION_EMAIL_2);
    }

    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'Amityville Portal <onboarding@resend.dev>',
      to: recipients,
      subject: `1974 Amityville — Casting Feedback from ${reviewerName}`,
      html: emailHtml,
      text: emailText,
    });

    if (error) {
      console.error('Resend error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to send email', details: error.message }),
      };
    }

    // Store submission data (as a simple log for now — can upgrade to Netlify Blobs later)
    console.log('=== SUBMISSION RECEIVED ===');
    console.log(JSON.stringify(data, null, 2));
    console.log('=== END SUBMISSION ===');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Feedback submitted successfully',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('Submit error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: err.message }),
    };
  }
};

// ---- Build styled HTML email ----
function buildEmailHtml(name, selections, moodPicks, moodNotes, generalNotes, date) {
  const gold = '#c9a84c';
  const bg = '#141414';
  const card = '#1c1c1c';
  const text = '#e8e4dc';
  const dim = '#8a8580';
  const red = '#c44e4e';
  const siteUrl = 'https://1974-amityville-portal.netlify.app';

  let castingRows = '';
  selections.forEach((s) => {
    let pickHtml = '';
    if (s.picks && s.picks.length > 0) {
      // Extract image paths from picks
      const pickItems = s.picks.map((p) => {
        const imgPath = s.imagePaths ? s.imagePaths[s.picks.indexOf(p)] : null;
        const imgTag = imgPath
          ? `<img src="${siteUrl}/${imgPath}" alt="${p}" style="width:80px;height:80px;object-fit:cover;border-radius:6px;margin-right:10px;vertical-align:middle;">`
          : '';
        return `<div style="display:flex;align-items:center;gap:8px;margin:4px 0;">${imgTag}<span style="color:${gold};font-weight:600;">${p}</span></div>`;
      });
      pickHtml = pickItems.join('');
    } else if (s.noneActive) {
      pickHtml = `<span style="color:${red};font-weight:600;">NONE — Changes Requested</span>`;
      if (s.changeText) {
        pickHtml += `<div style="color:${dim};font-style:italic;margin-top:4px;padding-left:12px;border-left:2px solid ${red};">"${s.changeText}"</div>`;
      }
    } else {
      pickHtml = `<span style="color:${dim};font-style:italic;">No selection made</span>`;
    }

    castingRows += `
      <tr>
        <td style="padding:16px 20px;border-bottom:1px solid #2a2a2a;">
          <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:16px;font-weight:600;letter-spacing:0.04em;margin-bottom:8px;">${s.character}</div>
          ${pickHtml}
        </td>
      </tr>`;
  });

  // Moodboard section
  let moodHtml = '';
  if (moodPicks && moodPicks.length > 0) {
    moodHtml = moodPicks.map((p) => `<span style="display:inline-block;background:rgba(201,168,76,0.15);color:${gold};padding:4px 12px;border-radius:4px;font-size:13px;margin:2px 4px 2px 0;">${p}</span>`).join('');
  } else {
    moodHtml = `<span style="color:${dim};font-style:italic;">No style selected</span>`;
  }

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:${bg};font-family:'Inter',-apple-system,Helvetica,Arial,sans-serif;color:${text};">
  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:12px;color:${gold};letter-spacing:0.3em;margin-bottom:8px;">1 9 7 4</div>
      <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:28px;font-weight:700;letter-spacing:0.04em;">AMITYVILLE</div>
      <div style="width:60px;height:2px;background:${gold};margin:12px auto;"></div>
      <div style="font-size:13px;color:${dim};letter-spacing:0.1em;text-transform:uppercase;">Casting & Cinematography Feedback</div>
    </div>

    <!-- Meta -->
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:4px 0;">Reviewer</td>
          <td style="color:${text};font-weight:600;text-align:right;padding:4px 0;">${name}</td>
        </tr>
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:4px 0;">Date</td>
          <td style="color:${text};text-align:right;padding:4px 0;">${date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
      </table>
    </div>

    <!-- Casting Selections -->
    <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:14px;color:${gold};letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">
      <span style="display:inline-block;width:30px;height:2px;background:${gold};vertical-align:middle;margin-right:8px;"></span>
      CASTING SELECTIONS
    </div>
    <table style="width:100%;border-collapse:collapse;background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;margin-bottom:24px;">
      ${castingRows}
    </table>

    <!-- Cinematography -->
    <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:14px;color:${gold};letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">
      <span style="display:inline-block;width:30px;height:2px;background:${gold};vertical-align:middle;margin-right:8px;"></span>
      CINEMATOGRAPHY STYLE
    </div>
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      ${moodHtml}
      ${moodNotes ? `<div style="color:${dim};font-style:italic;margin-top:8px;font-size:13px;">"${moodNotes}"</div>` : ''}
    </div>

    ${generalNotes ? `
    <!-- General Notes -->
    <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:14px;color:${gold};letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">
      <span style="display:inline-block;width:30px;height:2px;background:${gold};vertical-align:middle;margin-right:8px;"></span>
      GENERAL NOTES
    </div>
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;color:${dim};font-size:14px;line-height:1.6;">
      ${generalNotes}
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:${dim};">
      <p>Submitted via <a href="${siteUrl}" style="color:${gold};text-decoration:none;">1974 Amityville Client Portal</a></p>
    </div>
  </div>
</body>
</html>`;
}

// ---- Build plain-text fallback ----
function buildEmailText(name, selections, moodPicks, moodNotes, generalNotes, date) {
  let lines = [];
  lines.push('=== 1974 AMITYVILLE — CASTING FEEDBACK ===');
  lines.push('');
  lines.push(`Reviewer: ${name}`);
  lines.push(`Date: ${date || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');

  selections.forEach((s) => {
    lines.push(`--- ${s.character.toUpperCase()} ---`);
    if (s.picks && s.picks.length > 0) {
      s.picks.forEach((p) => lines.push(`  Selected: ${p}`));
    } else if (s.noneActive) {
      lines.push('  Selected: NONE');
      if (s.changeText) lines.push(`  Requested Changes: ${s.changeText}`);
    } else {
      lines.push('  (No selection made)');
    }
    lines.push('');
  });

  lines.push('--- CINEMATOGRAPHY STYLE ---');
  if (moodPicks && moodPicks.length > 0) {
    moodPicks.forEach((p) => lines.push(`  Selected: ${p}`));
  } else {
    lines.push('  (No style selected)');
  }
  if (moodNotes) lines.push(`  Notes: ${moodNotes}`);
  lines.push('');

  if (generalNotes) {
    lines.push('--- GENERAL NOTES ---');
    lines.push(generalNotes);
    lines.push('');
  }

  return lines.join('\n');
}
