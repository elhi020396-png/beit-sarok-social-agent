const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v25.0';

function getConfig() {
  return {
    pageId: process.env.META_PAGE_ID || '',
    pageToken: process.env.META_PAGE_ACCESS_TOKEN || '',
    igAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID || ''
  };
}

// ── פייסבוק ────────────────────────────────────────

async function postToFacebook(message) {
  const { pageId, pageToken } = getConfig();
  const response = await axios.post(`${GRAPH_URL}/${pageId}/feed`, {
    message,
    access_token: pageToken
  });
  console.log('✅ פוסט פייסבוק:', response.data.id);
  return response.data.id;
}

async function postVideoToFacebook(videoUrl, description, title) {
  const { pageId, pageToken } = getConfig();
  const response = await axios.post(`${GRAPH_URL}/${pageId}/videos`, {
    file_url: videoUrl,
    description,
    title: title || 'בית סרוק',
    access_token: pageToken
  });
  console.log('✅ וידאו פייסבוק:', response.data.id);
  return response.data.id;
}

async function postVideoStoryToFacebook(videoUrl) {
  try {
    const { pageId, pageToken } = getConfig();
    const response = await axios.post(`${GRAPH_URL}/${pageId}/video_stories`, {
      video_url: videoUrl,
      access_token: pageToken
    });
    console.log('✅ סטורי פייסבוק:', response.data.id);
    return response.data.id;
  } catch (err) {
    console.error('❌ סטורי פייסבוק:', err.response?.data || err.message);
    return null;
  }
}

async function postToFacebookGroup(groupId, message) {
  try {
    const { pageToken } = getConfig();
    const response = await axios.post(`${GRAPH_URL}/${groupId}/feed`, {
      message,
      access_token: pageToken
    });
    console.log(`✅ קבוצה ${groupId}:`, response.data.id);
    return response.data.id;
  } catch (err) {
    console.error(`❌ קבוצה ${groupId}:`, err.response?.data || err.message);
    return null;
  }
}

async function getRecentPosts(limit = 10) {
  const { pageId, pageToken } = getConfig();
  const response = await axios.get(`${GRAPH_URL}/${pageId}/feed`, {
    params: { fields: 'id,message,created_time', limit, access_token: pageToken }
  });
  return response.data.data || [];
}

async function getPostComments(postId) {
  try {
    const { pageToken } = getConfig();
    const response = await axios.get(`${GRAPH_URL}/${postId}/comments`, {
      params: { fields: 'message,from,id', access_token: pageToken }
    });
    return response.data.data || [];
  } catch (err) {
    return [];
  }
}

async function replyToComment(commentId, message) {
  try {
    const { pageToken } = getConfig();
    await axios.post(`${GRAPH_URL}/${commentId}/comments`, {
      message,
      access_token: pageToken
    });
    console.log('✅ תגובה נשלחה');
  } catch (err) {
    console.error('❌ שגיאה בתגובה:', err.response?.data || err.message);
  }
}

async function getGroupPostComments(groupId) {
  try {
    const { pageToken } = getConfig();
    const postsRes = await axios.get(`${GRAPH_URL}/${groupId}/feed`, {
      params: { fields: 'id,message', limit: 5, access_token: pageToken }
    });
    const posts = postsRes.data.data || [];
    const allComments = [];
    for (const post of posts) {
      const comments = await getPostComments(post.id);
      allComments.push(...comments.map(c => ({ ...c, postMessage: post.message || '' })));
    }
    return allComments;
  } catch (err) {
    return [];
  }
}

// ── אינסטגרם ───────────────────────────────────────

async function postToInstagram(imageUrl, caption) {
  const { igAccountId, pageToken } = getConfig();

  const containerRes = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: pageToken
  });
  const containerId = containerRes.data.id;

  await new Promise(r => setTimeout(r, 3000));

  const publishRes = await axios.post(`${GRAPH_URL}/${igAccountId}/media_publish`, {
    creation_id: containerId,
    access_token: pageToken
  });
  console.log('✅ פוסט אינסטגרם:', publishRes.data.id);
  return publishRes.data.id;
}

async function postReelToInstagram(videoUrl, caption) {
  const { igAccountId, pageToken } = getConfig();

  const containerRes = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: true,
    access_token: pageToken
  });
  const containerId = containerRes.data.id;

  await waitForVideoProcessing(igAccountId, containerId, pageToken);

  const publishRes = await axios.post(`${GRAPH_URL}/${igAccountId}/media_publish`, {
    creation_id: containerId,
    access_token: pageToken
  });
  console.log('✅ רילס אינסטגרם:', publishRes.data.id);
  return publishRes.data.id;
}

async function postVideoStoryToInstagram(videoUrl) {
  try {
    const { igAccountId, pageToken } = getConfig();

    const containerRes = await axios.post(`${GRAPH_URL}/${igAccountId}/media`, {
      media_type: 'STORIES',
      video_url: videoUrl,
      access_token: pageToken
    });
    const containerId = containerRes.data.id;

    await waitForVideoProcessing(igAccountId, containerId, pageToken);

    const publishRes = await axios.post(`${GRAPH_URL}/${igAccountId}/media_publish`, {
      creation_id: containerId,
      access_token: pageToken
    });
    console.log('✅ סטורי אינסטגרם:', publishRes.data.id);
    return publishRes.data.id;
  } catch (err) {
    console.error('❌ סטורי אינסטגרם:', err.response?.data || err.message);
    return null;
  }
}

async function sendInstagramDM(recipientId, message) {
  try {
    const { igAccountId, pageToken } = getConfig();
    await axios.post(`${GRAPH_URL}/${igAccountId}/messages`, {
      recipient: { id: recipientId },
      message: { text: message },
      access_token: pageToken
    });
    console.log('✅ DM נשלח:', recipientId);
  } catch (err) {
    console.error('❌ DM שגיאה:', err.response?.data || err.message);
  }
}

async function getRecentInstagramPosts(limit = 10) {
  try {
    const { igAccountId, pageToken } = getConfig();
    const response = await axios.get(`${GRAPH_URL}/${igAccountId}/media`, {
      params: { fields: 'id,caption,timestamp,media_type,permalink', limit, access_token: pageToken }
    });
    return response.data.data || [];
  } catch (err) {
    return [];
  }
}

// ── עזרים ──────────────────────────────────────────

async function waitForVideoProcessing(igAccountId, containerId, pageToken, maxAttempts = 12) {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const statusRes = await axios.get(`${GRAPH_URL}/${containerId}`, {
      params: { fields: 'status_code', access_token: pageToken }
    });
    const status = statusRes.data.status_code;
    console.log(`⏳ סטטוס וידאו: ${status} (${i + 1}/${maxAttempts})`);
    if (status === 'FINISHED') return;
    if (status === 'ERROR') throw new Error('שגיאה בעיבוד הוידאו');
  }
  throw new Error('עיבוד הוידאו לקח יותר מדי זמן');
}

module.exports = {
  postToFacebook,
  postVideoToFacebook,
  postVideoStoryToFacebook,
  postToFacebookGroup,
  getRecentPosts,
  getPostComments,
  getGroupPostComments,
  replyToComment,
  postToInstagram,
  postReelToInstagram,
  postVideoStoryToInstagram,
  sendInstagramDM,
  getRecentInstagramPosts
};
