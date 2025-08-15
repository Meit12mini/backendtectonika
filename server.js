import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { Telegraf } from 'telegraf';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация с проверкой
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Валидация конфигурации
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('Telegram credentials not configured!');
  console.log(`BOT_TOKEN exists: ${!!TELEGRAM_BOT_TOKEN}`);
  console.log(`CHAT_ID exists: ${!!TELEGRAM_CHAT_ID}`);
}

// Инициализация Telegram бота с улучшенным логированием
let bot;
try {
  bot = TELEGRAM_BOT_TOKEN ? new Telegraf(TELEGRAM_BOT_TOKEN) : null;
  if (bot) {
    console.log('Telegram bot initialized successfully');
    bot.catch((err) => {
      console.error('Telegram bot error:', err);
    });
  }
} catch (botError) {
  console.error('Failed to initialize Telegram bot:', botError);
}

// Функция для отправки в Telegram с подробным логированием
async function sendTelegramNotification(message) {
  if (!bot || !TELEGRAM_CHAT_ID) {
    console.warn('Telegram not configured - skipping notification');
    return false;
  }

  try {
    console.log('Attempting to send Telegram message...');
    console.log('Message content:', message);
    
    const sentMessage = await bot.telegram.sendMessage(
      TELEGRAM_CHAT_ID, 
      message,
      { parse_mode: 'Markdown' }
    );
    
    console.log('Message successfully sent to Telegram');
    console.log('Message ID:', sentMessage.message_id);
    return true;
  } catch (error) {
    console.error('Telegram send error:', error);
    console.error('Error details:', {
      code: error.code,
      response: error.response,
      description: error.description
    });
    return false;
  }
}

// Обработчик для /api/lead
app.post('/api/lead', async (req, res) => {
  try {
    const formData = req.body;
    console.log('Received lead data:', JSON.stringify(formData, null, 2));

    // Игнорируем пустые запросы
    if (!formData.answers || !formData.phone) {
      console.log('Empty lead request - skipping processing');
      return res.json({ success: true, message: 'Empty request processed' });
    }

    // Обработка лида
    const processedLead = processLead(formData);
    console.log('Processed lead:', processedLead);

    // Отправка в Telegram
    const notificationResult = await sendTelegramNotification(processedLead.telegramMessage);
    
    if (!notificationResult) {
      console.warn('Telegram notification failed');
    }

    res.json({ 
      success: true, 
      message: 'Лид сохранён',
      leadStatus: processedLead.leadStatus,
      clientMessage: processedLead.clientMessage,
      telegramSent: notificationResult
    });

  } catch (err) {
    console.error('Lead processing error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to process lead',
      details: err.message 
    });
  }
});

// ... (остальные функции processLead и getActionRecommendation остаются без изменений)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Current configuration:', {
    hasBotToken: !!TELEGRAM_BOT_TOKEN,
    hasChatId: !!TELEGRAM_CHAT_ID,
    recaptchaConfigured: !!RECAPTCHA_SECRET
  });
});