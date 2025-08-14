import express, { response } from "express";
import fetch from "node-fetch";
import { google } from "googleapis";
import dotenv from "dotenv";
import cors from "cors"


dotenv.config();
const app = express();
app.use(cors({origin:'*'}));
app.use(express.json());

// Проверка reCAPTCHA
async function verifyRecaptcha(token) {
  const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`
  }).then(r => r.json());
  const data = await res.json();
  console.log('reCAPTCHA',data)
  return data.success && data.score > 0.5;
}

// Google Sheets API
async function appendToSheet(values) {
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: "База Лидов!A1",
    valueInputOption: "RAW",
    requestBody: { values: [values] }
  });
}

// Telegram
async function sendTelegramMessage(text) {
  await fetch(`https://api.telegram.org/bot${process.env.TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: process.env.TG_CHAT_ID, text, parse_mode: "Markdown" })
  });
  const data = await response.json();
  if(!data.ok){
    console.error('Telegram error', data);
  }
}

// WhatsApp (пример с Wazzup)
async function sendWhatsApp(phone, message) {
  await fetch("https://api.wazzup24.com/v3/message", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.WAZZUP_TOKEN}`
    },
    body: JSON.stringify({
      channelId: process.env.WAZZUP_CHANNEL,
      chatType: "whatsapp",
      phone,
      text: message
    })
  });
}

app.post("/api/lead", async (req, res) => {
  console.log('ggggg')
  try {
    const { googleSheetRow, telegramMessage, clientMessage, leadStatus, token } = req.body;
    console.log('ggg', token)
    if (!(await verifyRecaptcha(token))) {
      return res.status(400).json({ error: "reCAPTCHA failed" });
    }

    await appendToSheet(googleSheetRow);
    await sendTelegramMessage(telegramMessage);
    await sendWhatsApp(googleSheetRow[1], clientMessage);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(3001, () => console.log("Backend running on http://localhost:3001"));