import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const RECAPTCHA_SECRET = process.env.RECAPTCHA_SECRET_KEY; // ключ из Google

// 1) Проверка капчи
app.post("/api/verify-captcha", async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ success: false, error: "Token is required" });
  }

  try {
    const verifyRes = await fetch(
      `https://www.google.com/recaptcha/api/siteverify?secret=${RECAPTCHA_SECRET}&response=${token}`,
      { method: "POST" }
    );

    const data = await verifyRes.json();
    if (!data.success) {
      return res.status(400).json({ success: false, error: "Invalid captcha" });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: "Captcha verification failed" });
  }
});

// 2) Приём данных формы
app.post("/api/lead", async (req, res) => {
  try {
    const formData = req.body;

    // Здесь можно дополнительно проверять капчу, если хочешь:
    // if (!formData.token) { return res.status(400).json({ error: "Token required" }); }

    // Логика сохранения в базу:
    console.log("Новый лид:", formData);

    res.json({ success: true, message: "Лид сохранён" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to save lead" });
  }
});

app.listen(3000, () => console.log("Server running on port 3000"));