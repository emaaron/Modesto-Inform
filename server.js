const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const { Resend } = require('resend');

const app = express();
app.use(express.json());
app.use(cors());

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

// 2. Updated Subscription Endpoint accepting language preference
app.post('/api/subscribe', (req, res) => {
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

  console.log(`New subscriber: ${email} [Lang: ${newSubscriber.language}]`);
  res.status(200).json({ message: newSubscriber.language === 'es' ? '¡Suscrito exitosamente!' : 'Subscribed successfully!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});