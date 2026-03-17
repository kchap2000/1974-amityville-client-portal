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
    const { fileName, fileData, fileType, uploaderName, category, notes } = data;

    // Validate required fields
    if (!fileName || !fileData || !fileType || !uploaderName || !category) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: fileName, fileData, fileType, uploaderName, category'
        }),
      };
    }

    // Build the email HTML
    const emailHtml = buildEmailHtml(uploaderName, fileName, fileType, category, notes);
    const emailText = buildEmailText(uploaderName, fileName, fileType, category, notes);

    // Send email via Resend with attachment
    const resend = new Resend(process.env.RESEND_API_KEY);

    const recipients = [process.env.NOTIFICATION_EMAIL_1];
    if (process.env.NOTIFICATION_EMAIL_2) {
      recipients.push(process.env.NOTIFICATION_EMAIL_2);
    }

    const { error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'Amityville Portal <onboarding@resend.dev>',
      to: recipients,
      subject: `🎬 New Asset Upload: ${category} — ${fileName}`,
      html: emailHtml,
      text: emailText,
      attachments: [
        {
          filename: fileName,
          content: fileData,
        },
      ],
    });

    if (error) {
      console.error('Resend error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to send email', details: error.message }),
      };
    }

    // Log submission
    console.log('=== ASSET UPLOAD RECEIVED ===');
    console.log(`Uploader: ${uploaderName}`);
    console.log(`Category: ${category}`);
    console.log(`File: ${fileName} (${fileType})`);
    console.log(`Notes: ${notes || '(none)'}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    console.log('=== END ASSET UPLOAD ===');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Asset uploaded successfully',
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (err) {
    console.error('Upload error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error', details: err.message }),
    };
  }
};

// ---- Build styled HTML email ----
function buildEmailHtml(uploaderName, fileName, fileType, category, notes) {
  const gold = '#c9a84c';
  const bg = '#141414';
  const card = '#1c1c1c';
  const text = '#e8e4dc';
  const dim = '#8a8580';
  const siteUrl = 'https://1974-amityville-portal.netlify.app';

  // Get file icon based on type
  const fileIcon = getFileIcon(fileType);

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
      <div style="font-size:13px;color:${dim};letter-spacing:0.1em;text-transform:uppercase;">Asset Upload Notification</div>
    </div>

    <!-- Meta -->
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:4px 0;">Uploader</td>
          <td style="color:${text};font-weight:600;text-align:right;padding:4px 0;">${uploaderName}</td>
        </tr>
        <tr>
          <td style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;padding:4px 0;">Date</td>
          <td style="color:${text};text-align:right;padding:4px 0;">${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</td>
        </tr>
      </table>
    </div>

    <!-- Asset Details -->
    <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:14px;color:${gold};letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">
      <span style="display:inline-block;width:30px;height:2px;background:${gold};vertical-align:middle;margin-right:8px;"></span>
      ASSET DETAILS
    </div>
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px;">Category</div>
            <div style="color:${gold};font-weight:600;font-size:16px;">${category}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
            <div style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px;">File Name</div>
            <div style="color:${text};font-weight:600;word-break:break-all;">${fileName}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 0;">
            <div style="color:${dim};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:2px;">File Type</div>
            <div style="color:${text};">${fileIcon} ${getFileTypeName(fileType)}</div>
          </td>
        </tr>
      </table>
    </div>

    ${notes ? `
    <!-- Notes -->
    <div style="font-family:'Oswald',Helvetica,sans-serif;font-size:14px;color:${gold};letter-spacing:0.15em;text-transform:uppercase;margin-bottom:12px;">
      <span style="display:inline-block;width:30px;height:2px;background:${gold};vertical-align:middle;margin-right:8px;"></span>
      NOTES
    </div>
    <div style="background:${card};border:1px solid rgba(255,255,255,0.06);border-radius:8px;padding:16px 20px;margin-bottom:24px;color:${dim};font-size:14px;line-height:1.6;">
      ${notes}
    </div>
    ` : ''}

    <!-- Footer -->
    <div style="text-align:center;padding-top:24px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:${dim};">
      <p>Submitted via <a href="${siteUrl}" style="color:${gold};text-decoration:none;">1974 Amityville Client Portal</a></p>
      <p style="margin-top:0.3rem;">File attached to this email.</p>
    </div>
  </div>
</body>
</html>`;
}

// ---- Build plain-text fallback ----
function buildEmailText(uploaderName, fileName, fileType, category, notes) {
  let lines = [];
  lines.push('=== 1974 AMITYVILLE — ASSET UPLOAD ===');
  lines.push('');
  lines.push(`Uploader: ${uploaderName}`);
  lines.push(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push('');
  lines.push('--- ASSET DETAILS ---');
  lines.push(`Category: ${category}`);
  lines.push(`File Name: ${fileName}`);
  lines.push(`File Type: ${getFileTypeName(fileType)}`);
  lines.push('');

  if (notes) {
    lines.push('--- NOTES ---');
    lines.push(notes);
    lines.push('');
  }

  lines.push('File is attached to this email.');

  return lines.join('\n');
}

function getFileIcon(fileType) {
  if (fileType.includes('image')) return '🖼️';
  if (fileType.includes('pdf')) return '📄';
  if (fileType.includes('word') || fileType.includes('document')) return '📝';
  return '📎';
}

function getFileTypeName(fileType) {
  const typeMap = {
    'image/png': 'PNG Image',
    'image/jpeg': 'JPEG Image',
    'application/pdf': 'PDF Document',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  };
  return typeMap[fileType] || fileType;
}
