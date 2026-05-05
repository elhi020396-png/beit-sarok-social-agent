const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const {
  generateFacebookPost, generateInstagramPost, generateGroupPost,
  generateWhatsAppPost, generateVideoCaption, generateVideoTopic,
  generateWeeklyPlan, generateCommentReply
} = require('./content');

const {
  postToFacebook, postToInstagram, postToFacebookGroup,
  postVideoToFacebook, postReelToInstagram,
  postVideoStoryToInstagram, postVideoStoryToFacebook,
  getRecentPosts, getPostComments, getGroupPostComments, replyToComment
} = require('./meta');

const { checkForNewVideos, getVideoDownloadUrl } = require('./drive');
const { sendEmailToOwner } = require('./email');
const { findTopPerformers } = require('./boost');

// ==========================================
// נושאי תוכן לפי יום
// ==========================================
const WEEKLY_TOPICS = {
  0: { topic: 'טעות נפוצה שאנשים עושים לפני קניית דירה', goal: 'engagement' },
  1: { topic: 'כמה כסף אפשר לחסוך עם בדיקה נכונה לפני רכישה', goal: 'sale' },
  2: { topic: 'תוכנית השגרירים של בית סרוק', goal: 'ambassador' },
  3: { topic: 'שאלה שכל קונה דירה צריך לשאול', goal: 'engagement' },
  4: { topic: 'ההבדל בין שמאות לדוח בית סרוק', goal: 'sale' },
  5: { topic: 'טיפ שבועי לרוכשי נדל"ן', goal: 'engagement' }
};

// ==========================================
// מצב סרטונים
// ==========================================
const VIDEO_STATE_FILE = path.join(__dirname, 'video-state.json');

let videoState = {
  lastVideoPostedDate: null,
  publishedVideoIds: [],
  reminderSentDate: null
};

function loadVideoState() {
  try {
    if (fs.existsSync(VIDEO_STATE_FILE)) {
      videoState = { ...videoState, ...JSON.parse(fs.readFileSync(VIDEO_STATE_FILE, 'utf8')) };
      console.log('📂 מצב סרטונים נטען');
    }
  } catch (e) {
    console.error('❌ שגיאה בטעינת מצב סרטונים:', e.message);
  }
}

function saveVideoState() {
  try {
    fs.writeFileSync(VIDEO_STATE_FILE, JSON.stringify(videoState, null, 2), 'utf8');
  } catch (e) {
    console.error('❌ שגיאה בשמירת מצב סרטונים:', e.message);
  }
}

function getFacebookGroupIds() {
  return (process.env.FACEBOOK_GROUP_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
}

function isShabbat() { return new Date().getDay() === 6; }
function todayString() { return new Date().toDateString(); }

let lastVideoCheck = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// ==========================================
// פונקציות ראשיות
// ==========================================

async function runDailyPost() {
  const dayOfWeek = new Date().getDay();
  const { topic, goal } = WEEKLY_TOPICS[dayOfWeek] || WEEKLY_TOPICS[0];
  console.log(`📅 פרסום יומי: ${topic}`);

  // פייסבוק
  try {
    const fbPost = await generateFacebookPost(topic, goal);
    await postToFacebook(fbPost);
  } catch (err) {
    console.error('❌ פוסט פייסבוק:', err.message);
    await sendEmailToOwner('⚠️ שגיאה בפוסט פייסבוק', err.message);
  }

  // אינסטגרם
  const defaultImage = process.env.INSTAGRAM_DEFAULT_IMAGE_URL;
  if (defaultImage) {
    try {
      await new Promise(r => setTimeout(r, 30000));
      const igPost = await generateInstagramPost(topic, goal);
      await postToInstagram(defaultImage, igPost);
    } catch (err) {
      console.error('❌ פוסט אינסטגרם:', err.message);
    }
  }
}

async function runGroupPosts() {
  const groupIds = getFacebookGroupIds();
  if (!groupIds.length) return;

  const dayOfWeek = new Date().getDay();
  const { topic, goal } = WEEKLY_TOPICS[dayOfWeek] || WEEKLY_TOPICS[0];
  let posted = 0;

  for (const groupId of groupIds.slice(0, 5)) {
    try {
      const post = await generateGroupPost(topic, goal);
      const result = await postToFacebookGroup(groupId, post);
      if (result) posted++;
      await new Promise(r => setTimeout(r, 15000));
    } catch (err) {
      console.error(`❌ קבוצה ${groupId}:`, err.message);
    }
  }
  console.log(`✅ פורסם ב-${posted} קבוצות`);
}

async function sendWhatsAppSuggestion() {
  try {
    const dayOfWeek = new Date().getDay();
    const { topic } = WEEKLY_TOPICS[dayOfWeek] || WEEKLY_TOPICS[0];
    const post = await generateWhatsAppPost(topic);

    await sendEmailToOwner(
      '📱 פוסט יומי לקבוצות ווצאפ',
      `שלום אלחי!\n\nהנה הפוסט להיום לקבוצות הווצאפ — העתק והדבק:\n\n` +
      `━━━━━━━━━━━━━━━━━\n${post}\n━━━━━━━━━━━━━━━━━`
    );
  } catch (err) {
    console.error('❌ הצעת ווצאפ:', err.message);
  }
}

async function sendVideoReminder() {
  if (videoState.reminderSentDate === todayString()) return;

  try {
    const topic = await generateVideoTopic();
    videoState.reminderSentDate = todayString();
    saveVideoState();

    await sendEmailToOwner(
      '🎬 מחר יום הסרטון — הנה נושא מוצע!',
      `שלום אלחי!\n\nמחר הוא יום הסרטון 🎬\n\n` +
      `תכין סרטון קצר (30-60 שניות) והעלה לגוגל דרייב — אני אפרסם אוטומטית לכל הפלטפורמות.\n\n` +
      `━━━━━━━━━━━━━━━━━\n${topic}\n━━━━━━━━━━━━━━━━━`
    );
    console.log('📧 תזכורת סרטון נשלחה');
  } catch (err) {
    console.error('❌ תזכורת סרטון:', err.message);
  }
}

async function uploadVideoToAllPlatforms(video, videoUrl) {
  console.log(`📤 מעלה: ${video.name}`);
  const caption = await generateVideoCaption(video.name);
  const results = {};

  try { await postVideoToFacebook(videoUrl, caption, 'בית סרוק'); results.fbReels = '✅'; }
  catch (err) { results.fbReels = `❌`; }

  await new Promise(r => setTimeout(r, 10000));

  try { await postVideoStoryToFacebook(videoUrl); results.fbStory = '✅'; }
  catch (err) { results.fbStory = `❌`; }

  await new Promise(r => setTimeout(r, 10000));

  try { await postReelToInstagram(videoUrl, caption); results.igReels = '✅'; }
  catch (err) { results.igReels = `❌`; }

  await new Promise(r => setTimeout(r, 10000));

  try { await postVideoStoryToInstagram(videoUrl); results.igStory = '✅'; }
  catch (err) { results.igStory = `❌`; }

  videoState.lastVideoPostedDate = new Date().toISOString();
  videoState.publishedVideoIds.push(video.id);
  if (videoState.publishedVideoIds.length > 50) videoState.publishedVideoIds = videoState.publishedVideoIds.slice(-50);
  saveVideoState();

  await sendEmailToOwner(
    '✅ הסרטון פורסם בהצלחה!',
    `הסרטון "${video.name}" פורסם:\n\n` +
    `פייסבוק רילס: ${results.fbReels}\n` +
    `פייסבוק סטורי: ${results.fbStory}\n` +
    `אינסטגרם רילס: ${results.igReels}\n` +
    `אינסטגרם סטורי: ${results.igStory}\n\n` +
    `━━━━━━━━━━━━━━━━━\n` +
    `🎵 תזכורת ידנית:\n` +
    `• TikTok — העלה ידנית\n` +
    `• YouTube Shorts — העלה ידנית`
  );
}

async function runCommentReplies() {
  let totalReplied = 0;
  const MAX = 20;

  try {
    const posts = await getRecentPosts();
    for (const post of posts) {
      if (totalReplied >= MAX) break;
      const comments = await getPostComments(post.id);
      for (const comment of comments) {
        if (totalReplied >= MAX) break;
        if (!comment.message) continue;
        const reply = await generateCommentReply(comment.from?.name || 'משתמש', comment.message, post.message || '');
        await replyToComment(comment.id, reply);
        totalReplied++;
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    const groupIds = getFacebookGroupIds();
    for (const groupId of groupIds) {
      if (totalReplied >= MAX) break;
      const comments = await getGroupPostComments(groupId);
      for (const comment of comments) {
        if (totalReplied >= MAX) break;
        if (!comment.message) continue;
        const reply = await generateCommentReply(comment.from?.name || 'משתמש', comment.message, comment.postMessage || '');
        await replyToComment(comment.id, reply);
        totalReplied++;
        await new Promise(r => setTimeout(r, 5000));
      }
    }
  } catch (err) {
    console.error('❌ תגובות:', err.message);
  }

  console.log(`✅ נענו ${totalReplied} תגובות`);
}

// ==========================================
// startScheduler
// ==========================================
function startScheduler() {
  loadVideoState();

  // 9:00 — פוסט FB + IG
  cron.schedule('0 9 * * 0-5', async () => {
    if (isShabbat()) return;
    await runDailyPost();
  }, { timezone: 'Asia/Jerusalem' });

  // 9:30 — 5 קבוצות פייסבוק
  cron.schedule('30 9 * * 0-5', async () => {
    if (isShabbat()) return;
    await runGroupPosts();
  }, { timezone: 'Asia/Jerusalem' });

  // 10:00 — הצעת פוסט ווצאפ
  cron.schedule('0 10 * * 0-5', async () => {
    if (isShabbat()) return;
    await sendWhatsAppSuggestion();
  }, { timezone: 'Asia/Jerusalem' });

  // שני + רביעי 10:30 — תזכורת סרטון
  cron.schedule('30 10 * * 1,3', async () => {
    await sendVideoReminder();
  }, { timezone: 'Asia/Jerusalem' });

  // כל שעה — בדיקת דרייב
  cron.schedule('0 * * * 0-5', async () => {
    if (isShabbat()) return;
    try {
      const newVideos = await checkForNewVideos(lastVideoCheck);
      if (newVideos.length > 0) {
        lastVideoCheck = new Date().toISOString();
        for (const video of newVideos) {
          if (videoState.publishedVideoIds.includes(video.id)) continue;
          const videoUrl = await getVideoDownloadUrl(video.id);
          if (videoUrl) await uploadVideoToAllPlatforms(video, videoUrl);
        }
      }
    } catch (err) {
      console.error('❌ דרייב:', err.message);
    }
  }, { timezone: 'Asia/Jerusalem' });

  // כל 2 שעות — עד 20 תגובות
  cron.schedule('0 */2 * * 0-5', async () => {
    if (isShabbat()) return;
    await runCommentReplies();
  }, { timezone: 'Asia/Jerusalem' });

  // ראשון 8:00 — ניתוח + בקשת אישור קידום
  cron.schedule('0 8 * * 0', async () => {
    try {
      const baseUrl = process.env.RAILWAY_PUBLIC_DOMAIN
        ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
        : `http://localhost:${process.env.PORT || 3001}`;

      const { facebook: topFb, instagram: topIg } = await findTopPerformers();
      let body = `שלום אלחי!\n\nסיכום ביצועי השבוע — הפוסטים המנצחים:\n\n`;

      if (topFb) {
        body += `📘 פייסבוק — הפוסט הטוב ביותר:\n"${topFb.message}..."\n` +
          `חשיפות: ${topFb.impressions.toLocaleString()} | הגעה: ${topFb.reach.toLocaleString()} | מעורבות: ${topFb.engagement.toLocaleString()}\n\n` +
          `👉 לאישור קידום (50₪/יום, 3 ימים):\n${baseUrl}/boost/approve?type=facebook&postId=${encodeURIComponent(topFb.id)}&budget=50&days=3\n\n`;
      }

      if (topIg) {
        body += `📸 אינסטגרם — הפוסט הטוב ביותר:\n"${topIg.caption}..."\n` +
          `חשיפות: ${topIg.impressions.toLocaleString()} | הגעה: ${topIg.reach.toLocaleString()}\n` +
          `קישור: ${topIg.permalink}\n\n` +
          `👉 לאישור קידום (50₪/יום, 3 ימים):\n${baseUrl}/boost/approve?type=instagram&postId=${encodeURIComponent(topIg.id)}&budget=50&days=3\n\n`;
      }

      body += `לחץ על הקישור הרצוי — הקמפיין יעלה מיד 🚀`;
      await sendEmailToOwner('📊 אישור קידום שבועי — בית סרוק', body);
    } catch (err) {
      console.error('❌ ניתוח שבועי:', err.message);
    }
  }, { timezone: 'Asia/Jerusalem' });

  // ראשון 8:30 — תוכנית שבועית
  cron.schedule('30 8 * * 0', async () => {
    try {
      const plan = await generateWeeklyPlan();
      await sendEmailToOwner('📋 תוכנית התוכן לשבוע הקרוב', `תוכנית התוכן:\n\n${plan}`);
    } catch (err) {
      console.error('❌ תוכנית שבועית:', err.message);
    }
  }, { timezone: 'Asia/Jerusalem' });

  // 20:00 — סיכום יומי
  cron.schedule('0 20 * * 0-5', async () => {
    if (isShabbat()) return;
    try {
      const posts = await getRecentPosts();
      const todayPosts = posts.filter(p => new Date(p.created_time).toDateString() === new Date().toDateString());
      const dayOfWeek = new Date().getDay();
      const tomorrow = WEEKLY_TOPICS[(dayOfWeek + 1) % 6]?.topic || 'תוכן שגרתי';
      const lastVideo = videoState.lastVideoPostedDate
        ? `${Math.floor((Date.now() - new Date(videoState.lastVideoPostedDate)) / 86400000)} ימים`
        : 'לא הועלה עדיין';

      await sendEmailToOwner('📊 סיכום יום — בית סרוק',
        `סיכום יום:\n\n` +
        `✅ פוסטים היום: ${todayPosts.length}\n` +
        `📅 מחר: ${tomorrow}\n` +
        `🎬 סרטון אחרון: ${lastVideo}\n\n` +
        `הכל עובד בסדר 🙂`
      );
    } catch (err) {
      console.error('❌ סיכום יומי:', err.message);
    }
  }, { timezone: 'Asia/Jerusalem' });

  console.log('⏰ Scheduler פעיל!');
  console.log('   9:00  — FB + IG');
  console.log('   9:30  — 5 קבוצות פייסבוק');
  console.log('   10:00 — הצעת פוסט ווצאפ');
  console.log('   10:30 — תזכורת סרטון (שני+רביעי)');
  console.log('   כל שעה — דרייב + סרטון');
  console.log('   כל 2שע — 20 תגובות');
  console.log('   ראשון 8:00 — ניתוח + קידום');
  console.log('   20:00 — סיכום יומי');
}

module.exports = { startScheduler };
