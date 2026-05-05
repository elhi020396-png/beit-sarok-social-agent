require('dotenv').config();
const express = require('express');
const { startScheduler } = require('./scheduler');
const { generateDMReply } = require('./content');
const { sendInstagramDM, replyToComment } = require('./meta');
const { sendEmailToOwner } = require('./email');
const { boostFacebookPost, boostInstagramPost } = require('./boost');

const app = express();
app.use(express.json());

// ==========================================
// בדיקת תקינות
// ==========================================
app.get('/', (req, res) => {
  res.json({
    status: '✅ בית סרוק Social Agent פעיל',
    time: new Date().toLocaleString('he-IL'),
    services: {
      meta: process.env.META_PAGE_ACCESS_TOKEN ? '✅' : '❌ חסר',
      anthropic: process.env.ANTHROPIC_API_KEY ? '✅' : '❌ חסר',
      drive: process.env.GOOGLE_REFRESH_TOKEN ? '✅' : '❌ חסר',
      email: process.env.RESEND_API_KEY ? '✅' : '❌ חסר',
      ads: process.env.META_AD_ACCOUNT_ID ? '✅' : '❌ חסר',
      groups: process.env.FACEBOOK_GROUP_IDS ? '✅' : '❌ חסר'
    }
  });
});

// ==========================================
// Meta Webhook
// ==========================================
app.get('/webhook/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'beit_sarok_secret_2024';

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('✅ Meta Webhook מאומת');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

app.post('/webhook/meta', async (req, res) => {
  res.sendStatus(200);

  try {
    const body = req.body;
    if (body.object !== 'instagram' && body.object !== 'page') return;

    for (const entry of body.entry || []) {
      // DMs
      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (!event.message?.text) continue;

          const senderId = event.sender.id;
          const messageText = event.message.text;
          console.log(`📨 DM: ${messageText}`);

          const reply = await generateDMReply('משתמש', messageText);

          if (reply.includes('[HOT_LEAD]')) {
            const cleanReply = reply.replace('[HOT_LEAD]', '').trim();
            await sendInstagramDM(senderId, cleanReply);
            await sendEmailToOwner(
              '🔥 ליד חם ב-DM!',
              `ליד חם!\n\nהודעה: "${messageText}"\nUser ID: ${senderId}\n\nצור קשר בהקדם!`
            );
          } else {
            await sendInstagramDM(senderId, reply);
          }
        }
      }

      // תגובות על פוסטים
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === 'feed' && change.value?.item === 'comment') {
            const comment = change.value;
            if (comment.verb !== 'add') continue;

            console.log(`💬 תגובה: ${comment.message}`);
            const { generateCommentReply } = require('./content');
            const reply = await generateCommentReply(comment.from?.name || 'משתמש', comment.message, '');
            await replyToComment(comment.comment_id, reply);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Webhook שגיאה:', err.message);
  }
});

// ==========================================
// אישור קידום פוסט
// ==========================================
app.get('/boost/approve', (req, res) => {
  const { type, postId, budget = 50, days = 3 } = req.query;
  if (!postId || !type) return res.status(400).send('<h2>❌ חסרים פרטים</h2>');

  res.send(`
    <!DOCTYPE html>
    <html dir="rtl" lang="he">
    <head>
      <meta charset="UTF-8">
      <title>אישור קידום — בית סרוק</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; text-align: center; background: #f5f5f5; }
        .card { background: white; padding: 40px; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
        h2 { color: #1a1a2e; }
        .details { background: #f0f4ff; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: right; line-height: 2; }
        .btn { background: #1877f2; color: white; border: none; padding: 16px 40px; border-radius: 8px; font-size: 18px; cursor: pointer; width: 100%; margin-top: 10px; }
        .btn:hover { background: #1565d8; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>🚀 אישור קידום פוסט</h2>
        <div class="details">
          <b>פלטפורמה:</b> ${type === 'facebook' ? '📘 פייסבוק' : '📸 אינסטגרם'}<br>
          <b>תקציב יומי:</b> ${budget}₪<br>
          <b>משך:</b> ${days} ימים<br>
          <b>עלות כוללת:</b> ${Number(budget) * Number(days)}₪
        </div>
        <form action="/boost/confirm" method="POST">
          <input type="hidden" name="type" value="${type}">
          <input type="hidden" name="postId" value="${postId}">
          <input type="hidden" name="budget" value="${budget}">
          <input type="hidden" name="days" value="${days}">
          <button type="submit" class="btn">✅ אשר קידום</button>
        </form>
        <p style="color:#888; font-size:13px; margin-top:16px;">לחיצה על האישור תפעיל את הקמפיין מיד</p>
      </div>
    </body>
    </html>
  `);
});

app.post('/boost/confirm', express.urlencoded({ extended: true }), async (req, res) => {
  const { type, postId, budget, days } = req.body;

  res.send(`<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><title>מקדם...</title>
    <style>body{font-family:Arial,sans-serif;max-width:500px;margin:80px auto;text-align:center;}</style>
    </head><body><h2>⏳ מפעיל קמפיין...</h2><p>אתה יכול לסגור את הדף.</p></body></html>`);

  try {
    let result;
    if (type === 'facebook') result = await boostFacebookPost(postId, Number(budget), Number(days));
    else result = await boostInstagramPost(postId, Number(budget), Number(days));

    await sendEmailToOwner(
      '✅ קמפיין קידום הופעל!',
      `הקמפיין הופעל!\n\nפלטפורמה: ${type === 'facebook' ? 'פייסבוק' : 'אינסטגרם'}\n` +
      `תקציב: ${budget}₪/יום × ${days} ימים = ${budget * days}₪\nקמפיין: ${result.campaignId}`
    );
  } catch (err) {
    console.error('❌ קמפיין:', err.message);
    await sendEmailToOwner('❌ שגיאה בקמפיין', `לא הצלחתי להפעיל:\n${err.message}`);
  }
});

// ==========================================
// חיבור דף לווובהוק
// ==========================================
async function subscribePageToWebhooks() {
  try {
    const url = new URL(`https://graph.facebook.com/v25.0/${process.env.META_PAGE_ID}/subscribed_apps`);
    url.searchParams.set('subscribed_fields', 'feed,messages,messaging_postbacks');
    url.searchParams.set('access_token', process.env.META_PAGE_ACCESS_TOKEN);
    const response = await fetch(url.toString(), { method: 'POST' });
    const data = await response.json();
    console.log('✅ דף מחובר לווובהוק:', JSON.stringify(data));
  } catch (err) {
    console.error('❌ שגיאה בחיבור ווובהוק:', err.message);
  }
}

// ==========================================
// הפעלה
// ==========================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Social Agent פעיל על פורט ${PORT}`);
  console.log(`🔑 META:      ${process.env.META_PAGE_ACCESS_TOKEN ? '✅' : '❌'}`);
  console.log(`🔑 ANTHROPIC: ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌'}`);
  console.log(`🔑 DRIVE:     ${process.env.GOOGLE_REFRESH_TOKEN ? '✅' : '❌'}`);
  console.log(`🔑 EMAIL:     ${process.env.RESEND_API_KEY ? '✅' : '❌'}`);
  console.log(`🔑 ADS:       ${process.env.META_AD_ACCOUNT_ID ? '✅' : '❌'}`);
  console.log(`🔑 GROUPS:    ${process.env.FACEBOOK_GROUP_IDS ? '✅' : '❌'}`);
  startScheduler();
  subscribePageToWebhooks();
});
