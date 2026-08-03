/**
 * Netlify Function: ocr-menu
 *
 * Accepts a base64-encoded JPEG image, sends it to Gemini Vision,
 * and returns structured menu data.
 *
 * POST body: { imageBase64: string }
 * Response:  { rows: Array<{ date: string; headCount: number; dishes: string[] }> }
 *
 * Required env var in Netlify dashboard: GEMINI_API_KEY
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Handler } from '@netlify/functions';

const PROMPT = `你是一個專門解讀臺灣學校或機構「營養午餐菜單」的 AI 助手。
使用者會上傳一張菜單的照片（可能是紙本翻拍或掃描）。

請仔細閱讀照片內容，提取以下資訊，並以 JSON 格式回覆，不要加任何額外說明：
{
  "rows": [
    {
      "date": "YYYY-MM-DD",
      "headCount": 360,
      "dishes": ["菜色1", "菜色2", "菜色3"]
    }
  ]
}

注意事項：
- date 必須是 ISO 格式 (YYYY-MM-DD)，若圖片只有月/日，年份請用當前年份
- headCount 若圖片未標示人數，預設為 360
- dishes 陣列中每個元素是一道菜的名稱，原文照抄，不要修改或翻譯
- 若一天有多道菜，全部放進 dishes 陣列
- 若無法辨識日期，該天跳過不回傳
- 只回傳 JSON，不要有任何前言或解釋`;

/**
 * Upper bound on the base64 payload (~3 MB decoded).
 *
 * This endpoint is unauthenticated — Netlify Functions are public by default —
 * so every accepted request spends GEMINI_API_KEY quota. The browser
 * pre-compresses to a ≤ 1200px JPEG, which lands far under this, so the cap
 * costs legitimate uploads nothing while stopping an anonymous caller from
 * pushing huge images through the paid Vision model.
 *
 * NOTE: this is a size guard, not a rate limit. Per-caller rate limiting needs
 * state a stateless function does not have (Netlify Edge / an external store);
 * if abuse shows up in the Gemini billing dashboard, that is the next lever.
 */
const MAX_BASE64_CHARS = 4_000_000;

/** Rejects anything that is not a plain base64 body before it reaches Gemini. */
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let imageBase64: string;
  try {
    const body = JSON.parse(event.body ?? '{}');
    imageBase64 = body.imageBase64;
    if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
      throw new Error('missing imageBase64');
    }
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  if (imageBase64.length > MAX_BASE64_CHARS) {
    return { statusCode: 413, body: 'Image too large' };
  }

  if (!BASE64_RE.test(imageBase64)) {
    return { statusCode: 400, body: 'imageBase64 must be raw base64 (no data: prefix)' };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: 'GEMINI_API_KEY is not set' };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent([
      { inlineData: { data: imageBase64, mimeType: 'image/jpeg' } },
      PROMPT,
    ]);

    const raw   = result.response.text();
    const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
    const data  = JSON.parse(clean);

    return {
      statusCode: 200,
      headers:    { 'Content-Type': 'application/json' },
      body:       JSON.stringify(data),
    };
  } catch (err) {
    // Log the detail server-side; don't echo upstream/Gemini error text to an
    // unauthenticated caller (it can carry model/quota/key-state internals).
    console.error('ocr-menu error:', err);
    return { statusCode: 502, body: 'OCR failed' };
  }
};
