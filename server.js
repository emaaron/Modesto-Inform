const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Resend } = require('resend');

const app = express();
app.use(express.json());
app.use(cors());

// ADD THIS LINE: This tells Express to serve index.html and other static assets from this folder
app.use(express.static(__dirname));

const resend = new Resend(process.env.RESEND_API_KEY);
const DATA_FILE = path.join(__dirname, 'subscribers.json');
const CSV_FILE = path.join(__dirname, 'modesto-watch-categories.csv');


// Helper: Parse CSV and return categories with both languages
function getCategoriesFromCSV() {
  if (!fs.existsSync(CSV_FILE)) return [];
  try {
    const fileContent = fs.readFileSync(CSV_FILE, 'utf8');
    const lines = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
    
    const categories = [];
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(',');
      if (row.length >= 4) {
        categories.push({
          key: row[0].replace(/"/g, '').trim(),
          group: row[1].replace(/"/g, '').trim(),
          label_en: row[2].replace(/"/g, '').trim(),
          label_es: row[3].replace(/"/g, '').trim()
        });
      }
    }
    return categories;
  } catch (err) {
    console.error('Error reading categories CSV:', err);
    return [];
  }
}

function getSubscribers() {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    return [];
  }
}

function saveSubscribers(subscribers) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(subscribers, null, 2), 'utf8');
}

// 1. Endpoint to provide categories
app.get('/api/categories', (req, res) => {
  const categories = getCategoriesFromCSV();
  res.json(categories);
});

// 2. Updated Subscription Endpoint accepting language preference and triggering Resend
app.post('/api/subscribe', async (req, res) => {
  const { name, email, categories, language } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const subscribers = getSubscribers();
  if (subscribers.some(sub => sub.email === email)) {
    return res.status(400).json({ error: 'This email is already subscribed!' });
  }

  const newSubscriber = {
    name: name || 'Subscriber',
    email: email,
    categories: Array.isArray(categories) ? categories : [],
    language: language === 'es' ? 'es' : 'en', // Default to English if invalid
    joinDate: new Date().toISOString()
  };

  subscribers.push(newSubscriber);
  saveSubscribers(subscribers);

  console.log(`New subscriber registered: ${email} [Lang: ${newSubscriber.language}]`);

  // --- SEND EMAIL VIA RESEND ---
  try {
    const isSpanish = newSubscriber.language === 'es';
    
    const subject = isSpanish 
      ? '¡Bienvenido a Modesto Informed - Alertas Activas!' 
      : 'Welcome to Modesto Informed - Custom Alerts Active!';

    const htmlContent = isSpanish ? `
      <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #15803d;">¡Hola ${newSubscriber.name}!</h2>
        <p>Has activado exitosamente tus alertas personalizadas para el Concejo Municipal de Modesto.</p>
        <p>Te notificaremos cuando tus temas seleccionados aparezcan en las próximas agendas oficiales.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b;">Modesto Informed — Proyecto Comunitario Independiente</p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; color: #334155; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #15803d;">Welcome, ${newSubscriber.name}!</h2>
        <p>Your custom Modesto City Council alerts have been successfully activated.</p>
        <p>We will email you whenever your selected categories appear on an upcoming official agenda.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b;">Modesto Informed — Independent Community Project</p>
      </div>
    `;

    await resend.emails.send({
      from: 'Modesto Informed <onboarding@resend.dev>', // Change to your verified domain when ready
      to: [newSubscriber.email],
      subject: subject,
      html: htmlContent,
    });

    console.log(`Welcome email successfully dispatched to ${email}`);
  } catch (error) {
    console.error('Failed to send email via Resend:', error);
  }

  res.status(200).json({ 
    message: newSubscriber.language === 'es' ? '¡Suscrito exitosamente!' : 'Subscribed successfully!' 
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});