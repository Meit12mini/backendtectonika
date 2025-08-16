import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { Telegraf } from 'telegraf';
import { google } from 'googleapis';
dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// -------------------- Google API sheets ----------------------
async function appendLeadToSheet(lead) {
  const auth = new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_SHEETS_CREDENTIALS,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const client = await auth.getClient();
  const sheets = google.sheets({ version: 'v4', auth: client });

  // Время по Якутску (UTC+9)
  const yakutskTime = new Date().toLocaleString("ru-RU", {
    timeZone: "Asia/Yakutsk",
    hour12: false
  });

  // Телефон без +
  const cleanPhone = lead.phone ? lead.phone.replace(/^\+/, "") : "";

  const values = [[
    yakutskTime,
    cleanPhone,
    lead.answers?.['1'] || '',
    lead.answers?.['2'] || '',
    lead.answers?.['3'] || '',
    lead.answers?.['4'] || '',
    lead.answers?.['5'] || '',
    lead.answers?.['6'] || '',
  ]];

  const res = await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range: process.env.GOOGLE_SHEETS_RANGE,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values },
  });

  console.log('Новая строка добавлена в Google Sheets:', res.data.updates.updatedRange);
}


// -------------------- Telegram --------------------
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const bot = TELEGRAM_BOT_TOKEN ? new Telegraf(TELEGRAM_BOT_TOKEN) : null;

// -------------------- API --------------------
app.post('/api/verify-captcha', async (req, res) => {
    const { token } = req.body;

    if (process.env.NODE_ENV === 'development') {
        console.log('Локальная проверка капчи - пропускаем');
        return res.json({ success: true, score: 1.0, action: 'local-test' });
    }

    if (!token) {
        return res.status(400).json({ success: false, error: 'Token is required' });
    }

    try {
        const verifyRes = await fetch(
            'https://www.google.com/recaptcha/api/siteverify',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `secret=${RECAPTCHA_SECRET}&response=${token}`
            }
        );

        const data = await verifyRes.json();

        if (!data.success) {
            return res.status(400).json({ success: false, error: 'Invalid captcha' });
        }

        res.json({ success: true, score: data.score, action: data.action });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Captcha verification failed' });
    }
});

app.post('/api/lead', async (req, res) => {
    try {
        const formData = req.body;

        if (!formData.answers || !formData.phone) {
            console.log('Получен служебный запрос без данных лида - пропускаем');
            return res.json({ success: true, message: 'Служебный запрос обработан' });
        }

        const processedLead = processLead(formData);

        console.log('Новый лид:', {
            phone: formData.phone,
            status: processedLead.leadStatus,
            answers: formData.answers
        });

        // ---------------- Telegram ----------------
        if (bot && TELEGRAM_CHAT_ID) {
            try {
                await bot.telegram.sendMessage(
                    TELEGRAM_CHAT_ID,
                    processedLead.telegramMessage,
                    { parse_mode: 'Markdown' }
                );
                console.log('Уведомление отправлено в Telegram');
            } catch (tgError) {
                console.error('Ошибка отправки в Telegram:', tgError);
            }
        }

        // ---------------- WhatsApp (Wazzup API) ----------------
        const WAZZUP_API_KEY = process.env.WAZZUP_API_KEY;
        const WAZZUP_CHANNEL_ID = process.env.WAZZUP_CHANNEL_ID;
        const TO_NUMBER = process.env.WAZZUP_TO_NUMBER; // свой номер для теста

        if (WAZZUP_API_KEY && WAZZUP_CHANNEL_ID && TO_NUMBER) {
            try {
                const waRes = await fetch("https://api.wazzup24.com/v3/message", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${WAZZUP_API_KEY}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        channelId: WAZZUP_CHANNEL_ID,
                        chatType: "whatsapp",
                        chatId: TO_NUMBER,
                        text: processedLead.telegramMessage // можно использовать тот же текст, что для Telegram
                    })
                });
                const waData = await waRes.json();
                console.log('Уведомление отправлено в WhatsApp:', waData);
            } catch (waError) {
                console.error('Ошибка отправки в WhatsApp через Wazzup:', waError);
            }
        } else {
            console.warn('WAZZUP_API_KEY, CHANNEL_ID или TO_NUMBER не настроены');
        }

         // ---------------- Google Sheets ----------------
        try {
            await appendLeadToSheet(formData);
        } catch (sheetError) {
            console.error('Ошибка записи в Google Sheets:', sheetError);
        }

        res.json({ success: true });

        
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: 'Failed to save lead' });
    }
});

// -------------------- Логика обработки лида --------------------
function processLead(leadData) {
    const { answers, phone } = leadData;
    const budget = answers['5'];
    const timeline = answers['6'];

    let leadStatus;

    if (
        (budget === '5-8 млн ₽' || budget === 'Более 8 млн ₽') ||
        timeline === 'В ближайший месяц'
    ) {
        leadStatus = '🔥 ГОРЯЧИЙ';
    } else if (
        (budget === '3-5 млн ₽') ||
        timeline === 'В течение 3-6 месяцев'
    ) {
        leadStatus = '👍 ТЕПЛЫЙ';
    } else {
        leadStatus = '❄️ ХОЛОДНЫЙ';
    }

    const telegramMessage = `
📌 *Новый лид (${leadStatus})* 📌

*Контакт:* [${phone}])

*Ответы на вопросы:*
1. Для кого: ${answers['1']}
2. Участок: ${answers['2']}
3. Площадь: ${answers['3']}
4. Материал: ${answers['4']}
5. Бюджет: ${answers['5']}
6. Сроки: ${answers['6']}
`.trim();

    return {
        leadStatus,
        telegramMessage
    };
}



const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('TELEGRAM_BOT_TOKEN не настроен - уведомления отправляться не будут');
    }
});