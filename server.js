const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const SUBMISSIONS_PATH = path.join(DATA_DIR, 'submissions.json');
const GOAL = Number(process.env.ACTION_GOAL || 0);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

function ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR);
    }
    if (!fs.existsSync(SUBMISSIONS_PATH)) {
        fs.writeFileSync(SUBMISSIONS_PATH, '[]', 'utf8');
    }
}

function readSubmissions() {
    ensureDataFile();
    try {
        const content = fs.readFileSync(SUBMISSIONS_PATH, 'utf8');
        return JSON.parse(content);
    } catch (error) {
        console.warn('Unable to read submissions file, resetting to empty array.', error.message);
        writeSubmissions([]);
        return [];
    }
}

function writeSubmissions(entries) {
    ensureDataFile();
    fs.writeFileSync(SUBMISSIONS_PATH, JSON.stringify(entries, null, 2), 'utf8');
}

async function sendNotification(payload) {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, NOTIFY_TO } = process.env;
    if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS || !NOTIFY_TO) {
        return; // Email delivery not configured
    }

    const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT),
        secure: Number(SMTP_PORT) === 465,
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS
        }
    });

    const message = {
        from: SMTP_USER,
        to: NOTIFY_TO,
        subject: 'New Nurses Under Fire contact submission',
        text: `Name: ${payload.name}\nEmail: ${payload.email}\nPhone: ${payload.phone}\nZIP: ${payload.zip}\n\nMessage:\n${payload.message}`
    };

    await transporter.sendMail(message);
}

app.get('/api/metrics', (_req, res) => {
    const submissions = readSubmissions();
    const totalActions = submissions.length;
    res.json({
        contactSubmissions: totalActions,
        totalActions,
        goal: GOAL
    });
});

app.post('/api/contact', async (req, res) => {
    const { name = '', email = '', phone = '', zip = '', message = '' } = req.body || {};

    if (!name.trim() || !email.trim() || !message.trim()) {
        return res.status(400).json({ error: 'Name, email, and message are required.' });
    }

    if (zip && !/^\d{5}$/.test(String(zip).trim())) {
        return res.status(400).json({ error: 'ZIP code must be 5 digits.' });
    }

    if (message.length > 5000) {
        return res.status(400).json({ error: 'Message is too long. Please limit to 5,000 characters.' });
    }

    const submission = {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        zip: String(zip).trim(),
        message: message.trim(),
        submittedAt: new Date().toISOString()
    };

    const submissions = readSubmissions();
    submissions.push(submission);
    writeSubmissions(submissions);

    try {
        await sendNotification(submission);
    } catch (error) {
        console.warn('Email notification failed:', error.message);
    }

    res.status(201).json({ message: 'Submission recorded.', metrics: { contactSubmissions: submissions.length, totalActions: submissions.length, goal: GOAL } });
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
});
