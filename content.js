const Groq = require('groq-sdk');
const Anthropic = require('@anthropic-ai/sdk');

const isGroq = !!process.env.GROQ_API_KEY;

const groqClient = isGroq ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const anthropicClient = !isGroq ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

const AI_MODEL = isGroq ? 'llama-3.3-70b-versatile' : 'claude-opus-4-5';

console.log(`🤖 AI: ${isGroq ? 'Groq (חינמי)' : 'Anthropic Claude'}`);

const BRAND_VOICE = `אתה כותב תוכן עבור "בית סרוק" - שירות דוחות נדל"ן לפני רכישה.

קול המותג:
- אנושי, חם, לא מכירתי
- אותנטי - כמו חבר שמבין נדל"ן
- קצר וקולע - אנשים גוללים מהר
- עברית טבעית, לא פורמלית
- אמוגי - רק 1-2 לפוסט, לא יותר

המוצר:
- דוח בדיקה מקיף על נכס לפני רכישה - 749 שח
- PDF 15-25 עמודים, תוך 72 שעות
- ללא ביקור פיזי, מבוסס על מסמכים ומאגרים
- עובד בכל הארץ כולל יו"ש
- ערבות 100% שביעות רצון

תוכנית שגרירים:
- קוד קופון אישי, 10% הנחה ללקוח
- עמלה: 200/250/300 שח לסליקה (לפי כמות)
- ללא התחייבות

אתר: https://beit-sarok.co.il`;

// פונקציה מרכזית ליצירת טקסט
async function generateText(userPrompt, maxTokens = 500, systemPrompt = null) {
  if (isGroq) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    else messages.push({ role: 'system', content: BRAND_VOICE });
    messages.push({ role: 'user', content: userPrompt });

    const response = await groqClient.chat.completions.create({
      model: AI_MODEL,
      messages,
      max_tokens: maxTokens
    });
    return response.choices[0].message.content.trim();
  } else {
    const params = {
      model: AI_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: userPrompt }]
    };
    if (systemPrompt) params.system = systemPrompt;
    else params.system = BRAND_VOICE;

    const response = await anthropicClient.messages.create(params);
    return response.content[0].text.trim();
  }
}

// פוסט לפייסבוק
async function generateFacebookPost(topic, goal = 'engagement') {
  const goalText = goal === 'ambassador' ? 'לגייס שגרירים לתוכנית השותפים' :
                   goal === 'sale' ? 'למכור דוח בית סרוק' : 'לייצר מעורבות ועניין';

  return generateText(`כתוב פוסט לפייסבוק על הנושא: "${topic}"
המטרה: ${goalText}

כללים:
- לא יותר מ-4 שורות טקסט
- אל תכתוב "בית סרוק" בכל פוסט
- שאל שאלה בסוף שתגרום לאנשים להגיב
- אל תשתמש בהאשטגים בפייסבוק
- כתוב כמו בן אדם, לא כמו פרסומת

כתוב רק את הפוסט, ללא הסברים.`, 500);
}

// פוסט לאינסטגרם
async function generateInstagramPost(topic, goal = 'engagement') {
  const goalText = goal === 'ambassador' ? 'לגייס שגרירים' :
                   goal === 'sale' ? 'למכור דוח' : 'לייצר מעורבות';

  return generateText(`כתוב פוסט לאינסטגרם על הנושא: "${topic}"
המטרה: ${goalText}

כללים:
- כיתוב: 3-5 שורות
- בסוף: שאלה לתגובות
- אחרי הטקסט: שורה ריקה + 15 האשטגים רלוונטיים בעברית ואנגלית
- האשטגים: #נדלן #דירה #השקעות #בית #ישראל #realestate #israel #property #investment #home

כתוב רק את הפוסט עם ההאשטגים, ללא הסברים.`, 600);
}

// פוסט לקבוצת פייסבוק
async function generateGroupPost(topic, goal = 'engagement') {
  return generateText(`כתוב פוסט לקבוצת פייסבוק של נדל"ן על הנושא: "${topic}"

כללים קריטיים:
- כתוב בגוף ראשון ("אני", "ראיתי", "קרה לי")
- נשמע כמו חבר שמשתף ניסיון — לא כמו עסק שמפרסם
- אל תכתוב "בית סרוק" בגוף הפוסט
- 3-4 שורות מקסימום
- תשאל שאלה שמזמינה תגובות
- ללא האשטגים

כתוב רק את הפוסט.`, 400);
}

// הצעת פוסט לווצאפ
async function generateWhatsAppPost(topic) {
  return generateText(`כתוב הודעה קצרה לקבוצת ווצאפ על הנושא: "${topic}"

כללים:
- קצר מאוד — 2-3 שורות
- אנושי וחם, כמו הודעה ממכר
- תזכיר שאפשר לבדוק נכס בסוף: https://beit-sarok.co.il
- לא פרסומי — שיתוף טיפ/ניסיון
- ללא האשטגים

כתוב רק את ההודעה.`, 300);
}

// כיתוב לסרטון
async function generateVideoCaption(videoName) {
  return generateText(`כתוב כיתוב לסרטון רילס/סטורי עבור בית סרוק.
שם הקובץ (רמז): "${videoName}"

כללים:
- 2-3 שורות עם הוק חזק בפתיחה
- שאלה בסוף
- שורה ריקה + 15-20 האשטגים בעברית ואנגלית:
  #נדלן #דירה #ישראל #בית #נכס #השקעה #רכישה #בדיקה #realestate #israel #property #investment #home #reels #shorts

כתוב רק את הכיתוב עם ההאשטגים.`, 400);
}

// נושא מוצע לסרטון
async function generateVideoTopic() {
  return generateText(`הצע נושא לסרטון קצר (30-60 שניות) עבור בית סרוק.

כתוב:
1. כותרת הסרטון
2. משפט פתיחה (הוק — 5 שניות ראשונות)
3. 3 נקודות לכסות

כתוב בצורה קצרה וברורה.`, 250);
}

// תוכנית שבועית
async function generateWeeklyPlan() {
  return generateText(`צור תוכנית תוכן שבועית לבית סרוק ל-6 ימים (ראשון עד שישי).

לכל יום:
1. נושא הפוסט
2. מטרה (מכירה / שגרירים / מעורבות)
3. פורמט (פוסט טקסט / תמונה / רילס)
4. רעיון לסרטון קצר אם מתאים

כתוב בצורה ברורה ומסודרת.`, 1500);
}

// מענה ל-DM
async function generateDMReply(senderName, message) {
  const systemPrompt = `${BRAND_VOICE}

אתה עונה ל-DM בשם אלחי מבית סרוק.
שם המשתמש: ${senderName}

כללים:
- קצר — לא יותר מ-3 שורות
- חם ואנושי
- המטרה: להוביל לרכישה או הצטרפות לשגרירים
- אם מתעניין ברכישה: https://beit-sarok.co.il
- אם מתעניין בשגרירים: https://beit-sarok.co.il/AffiliateProgram
- אם רוצה לדבר: "שלח לי מספר ואחזור אליך"

אם זה ליד חם — כתוב [HOT_LEAD] בתחילת התשובה.`;

  return generateText(message, 300, systemPrompt);
}

// מענה לתגובה
async function generateCommentReply(commenterName, comment, postContent) {
  return generateText(`כתוב תגובה קצרה ואנושית ל:
${commenterName} כתב: "${comment}"
על הפוסט: "${postContent}"

כללים:
- לא יותר מ-2 שורות
- חם ואישי
- אם מתעניין — הוסף לינק רלוונטי
- כתוב רק את התגובה`, 150);
}

module.exports = {
  generateFacebookPost,
  generateInstagramPost,
  generateGroupPost,
  generateWhatsAppPost,
  generateVideoCaption,
  generateVideoTopic,
  generateWeeklyPlan,
  generateDMReply,
  generateCommentReply
};
