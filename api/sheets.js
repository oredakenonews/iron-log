// api/sheets.js - Google Sheetsにデータを読み書きする

function base64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function getAccessToken(credentials) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const unsigned = `${headerB64}.${payloadB64}`;

  // RSA-SHA256署名
  const pemKey = credentials.private_key;
  const pemContents = pemKey.replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\n/g, '');
  const binaryKey = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, encoder.encode(unsigned)
  );

  const sigB64 = base64url(String.fromCharCode(...new Uint8Array(signature)));
  const jwt = `${unsigned}.${sigB64}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
    });
  }

  try {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const accessToken = await getAccessToken(credentials);

    if (req.method === 'GET') {
      // データ読み込み
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:Z10000`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      const rows = data.values || [];

      // 1行目はヘッダー、2行目以降をデータとしてJSONに変換
      // フォーマット: date, exercisesJSON
      const sessions = {};
      for (let i = 1; i < rows.length; i++) {
        const [date, exercisesJSON] = rows[i];
        if (date && exercisesJSON) {
          try {
            sessions[date] = { date, exercises: JSON.parse(exercisesJSON) };
          } catch {}
        }
      }
      return new Response(JSON.stringify(sessions), { status: 200, headers });
    }

    if (req.method === 'POST') {
      // データ保存
      const body = await req.json();
      const sessions = body.sessions;

      // 全データを行に変換
      const values = [['date', 'exercises']];
      for (const [date, session] of Object.entries(sessions)) {
        values.push([date, JSON.stringify(session.exercises)]);
      }

      // 先にシート全体をクリア
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:Z10000:clear`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        }
      );

      // 全データを書き込み
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1?valueInputOption=RAW`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ values }),
        }
      );

      return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
