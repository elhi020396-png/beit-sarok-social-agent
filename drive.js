const { google } = require('googleapis');

function getAuth() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

async function checkForNewVideos(lastChecked) {
  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

    if (!folderId) {
      console.log('⚠️ GOOGLE_DRIVE_FOLDER_ID לא מוגדר');
      return [];
    }

    const query = `'${folderId}' in parents and mimeType contains 'video/' and trashed = false and createdTime > '${lastChecked}'`;
    const response = await drive.files.list({
      q: query,
      fields: 'files(id, name, createdTime, webContentLink, webViewLink)',
      orderBy: 'createdTime desc'
    });

    const files = response.data.files || [];
    console.log(`📁 ${files.length} סרטונים חדשים בדרייב`);
    return files;
  } catch (err) {
    console.error('❌ שגיאה בדרייב:', err.message);
    return [];
  }
}

async function getVideoDownloadUrl(fileId) {
  try {
    const auth = getAuth();
    const drive = google.drive({ version: 'v3', auth });

    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' }
    });

    return `https://drive.google.com/uc?export=download&id=${fileId}`;
  } catch (err) {
    console.error('❌ שגיאה בקבלת URL:', err.message);
    return null;
  }
}

module.exports = { checkForNewVideos, getVideoDownloadUrl };
