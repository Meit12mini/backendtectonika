import express from "express";
import fetch from "node-fetch";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Проверка reCAPTCHA
async function verifyRecaptcha(token) {
  const res = await fetch(`https://www.google.com/recaptcha/api/siteverify`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`
  });
  const data = await res.json();
  return data.success && data.score > 0.5;
}

// Эндпоинт для квиза
app.post("/api/lead", async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: "Token is required" });

  const valid = await verifyRecaptcha(token);
  if (!valid) return res.status(400).json({ error: "reCAPTCHA failed" });

  res.json({ success: true, message: "Token valid" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on http://localhost:${PORT}`));