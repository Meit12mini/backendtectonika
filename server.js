import dotenv from 'dotenv';
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import { Telegraf } from 'telegraf';

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Конфигурация
const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Инициализация Telegram бота
const bot = TELEGRAM_BOT_TOKEN ? new Telegraf(TELEGRAM_BOT_TOKEN) : null;

// 1) Проверка капчи
app.post('/api/verify-captcha', async (req, res) => {
  const { token } = req.body;
  
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

// 2) Приём данных формы с обработкой лида
app.post('/api/lead', async (req, res) => {
  try {
    const formData = req.body;

    // Игнорируем запросы без answers и phone (второй запрос)
    if (!formData.answers || !formData.phone) {
      console.log('Получен служебный запрос без данных лида - пропускаем');
      return res.json({ success: true, message: 'Служебный запрос обработан' });
    }

    // Обработка лида
    const processedLead = processLead(formData);
    
    // Логирование в консоль
    console.log('Новый лид:', {
      phone: formData.phone,
      status: processedLead.leadStatus,
      answers: formData.answers
    });

    // Отправка в Telegram (если настроен бот)
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

    res.json({ 
      success: true, 
      message: 'Лид сохранён',
      leadStatus: processedLead.leadStatus,
      clientMessage: processedLead.clientMessage
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Failed to save lead' });
  }
});

// Функция обработки лида
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

*Контакт:* [${phone}](tel:${phone.replace(/\D/g, '')})

*Ответы на вопросы:*
1. Для кого: ${answers['1']}
2. Участок: ${answers['2']}
3. Площадь: ${answers['3']}
4. Материал: ${answers['4']}
5. Бюджет: ${answers['5']}
6. Сроки: ${answers['6']}

*Рекомендации:* ${getActionRecommendation(leadStatus)}
  `.trim();
  
  const clientMessage = leadStatus === '🔥 ГОРЯЧИЙ' 
    ? 'Здравствуйте! Ваша заявка получила VIP-статус. Наш лучший специалист уже изучает ваши ответы и свяжется с вами в течение 15 минут для детального обсуждения проекта. Ваш персональный каталог и скидка уже формируются! С уважением, команда «Тектоника».'
    : 'Здравствуйте! Мы получили вашу заявку, спасибо за интерес к нашей компании! Наш менеджер свяжется с вами в ближайшее рабочее время для консультации. А пока мы готовим для вас смету и каталог проектов. С уважением, команда «Тектоника».';
  
  return {
    leadStatus,
    telegramMessage,
    clientMessage
  };
}

function getActionRecommendation(status) {
  switch(status) {
    case '🔥 ГОРЯЧИЙ':
      return 'Немедленно позвонить! Клиент готов к покупке в ближайшее время с высоким бюджетом.';
    case '👍 ТЕПЛЫЙ':
      return 'Позвонить в течение 2 часов. Клиент в среднесрочной перспективе с хорошим бюджетом.';
    case '❄️ ХОЛОДНЫЙ':
      return 'Отправить письмо с каталогом и позвонить на следующий день. Клиент на ранней стадии рассмотрения.';
    default:
      return 'Требуется дополнительный анализ.';
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!TELEGRAM_BOT_TOKEN) {
    console.warn('TELEGRAM_BOT_TOKEN не настроен - уведомления отправляться не будут');
  }
});