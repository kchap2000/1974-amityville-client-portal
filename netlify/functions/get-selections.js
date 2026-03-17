const { google } = require('googleapis');

// Simple in-memory cache
let cachedData = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30000; // 30 seconds

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    // Check cache
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, selections: cachedData, cached: true }),
      };
    }

    // If Google Sheets is not configured, return empty selections
    if (!process.env.GOOGLE_SHEETS_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          selections: [],
          message: 'Google Sheets not configured — returning empty selections',
        }),
      };
    }

    const auth = new google.auth.JWT(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      null,
      (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );
    await auth.authorize();

    const sheets = google.sheets({ version: 'v4', auth });
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEETS_ID,
      range: 'Casting Selections!A:H',
    });

    const rows = result.data.values || [];
    // Skip header row if present
    const dataRows = rows.length > 0 && rows[0][0] === 'Character' ? rows.slice(1) : rows;

    const selections = dataRows
      .filter(row => row[4] === 'locked') // Only return locked entries
      .map(row => ({
        character: row[0] || '',
        variation: row[1] || '',
        imageUrl: row[2] || '',
        originalFilePath: row[3] || '',
        status: row[4] || '',
        lockedBy: row[5] || '',
        lockDate: row[6] || '',
        notes: row[7] || '',
      }));

    // Update cache
    cachedData = selections;
    cacheTimestamp = now;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, selections }),
    };
  } catch (err) {
    console.error('Get selections error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch selections', details: err.message }),
    };
  }
};
