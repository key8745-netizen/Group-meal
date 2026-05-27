/**
 * Netlify Function: ocr-menu
 *
 * Accepts a base64-encoded image, sends it to Claude Vision,
 * and returns a structured JSON with the menu rows it found.
 *
 * POST body: { imageBase64: string }
 * Response:  { rows: Array<{ date: string; headCount: number; dishes: string[] }> }
 *
 * Required env var in Netlify dashboard: ANTHROPIC_API_KEY
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Handler } from '@netlify/functions';

const client = new Anthropic();

const SYSTEM_PROMPT = `你是一個專門解讀臺灣學校或機構「營養午餐菜單」的 AI 助手。
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

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let imageBase64: string;
  try {
    const body = JSON.parse(event.body ?? '{}');
    imageBase64 = body.imageBase64;
    if (!imageBase64) throw new Error('missing imageBase64');
  } catch {
    return { statusCode: 400, body: 'Invalid request body' };
  }

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'image',
              source: {
                type:       'base64',
                media_type: 'image/jpeg',
                data:       imageBase64,
              },
            },
            {
              type: 'text',
              text: '請分析這張菜單照片並以 JSON 格式回傳菜單資料。',
            },
          ],
        },
      ],
      system: SYSTEM_PROMPT,
    });

    const raw   = (message.content[0] as { type: string; text: string }).text;
    const clean = raw.replace(/```json\n?|\n?```/g, '').trim();
    const data  = JSON.parse(clean);

    return {
      statusCode: 200,
      headers:    { 'Content-Type': 'application/json' },
      body:       JSON.stringify(data),
    };
  } catch (err) {
    console.error('ocr-menu error:', err);
    return {
      statusCode: 500,
      body:       err instanceof Error ? err.message : 'Internal error',
    };
  }
};
