const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEmailToOwner(subject, body) {
  try {
    const ownerEmail = process.env.OWNER_EMAIL;
    if (!ownerEmail) {
      console.warn('⚠️ OWNER_EMAIL לא מוגדר — המייל לא נשלח');
      return;
    }

    const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: ownerEmail,
      subject: subject,
      text: body,
      html: `<div dir="rtl" style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.8; white-space: pre-wrap; max-width: 600px; margin: 0 auto; padding: 20px;">${body.replace(/\n/g, '<br>')}</div>`
    });

    if (error) {
      console.error('❌ שגיאה בשליחת מייל:', error.message);
    } else {
      console.log(`✅ מייל נשלח (${ownerEmail}) | ID: ${data?.id}`);
    }
  } catch (error) {
    console.error('❌ שגיאה בשליחת מייל:', error.message);
  }
}

module.exports = { sendEmailToOwner };
