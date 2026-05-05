const axios = require('axios');

const GRAPH_URL = 'https://graph.facebook.com/v25.0';

function getConfig() {
  return {
    pageId: process.env.META_PAGE_ID || '',
    pageToken: process.env.META_PAGE_ACCESS_TOKEN || '',
    igAccountId: process.env.META_INSTAGRAM_ACCOUNT_ID || '',
    adAccountId: process.env.META_AD_ACCOUNT_ID || ''
  };
}

// ── ניתוח ביצועים ──────────────────────────────────

async function getFacebookPostInsights(postId) {
  try {
    const { pageToken } = getConfig();
    const response = await axios.get(`${GRAPH_URL}/${postId}/insights`, {
      params: { metric: 'post_impressions,post_reach,post_engaged_users', access_token: pageToken }
    });
    const metrics = {};
    for (const item of response.data.data || []) {
      metrics[item.name] = item.values?.[0]?.value || 0;
    }
    return metrics;
  } catch (err) {
    return { post_impressions: 0, post_reach: 0, post_engaged_users: 0 };
  }
}

async function getInstagramMediaInsights(mediaId) {
  try {
    const { pageToken } = getConfig();
    const response = await axios.get(`${GRAPH_URL}/${mediaId}/insights`, {
      params: { metric: 'impressions,reach,engagement', access_token: pageToken }
    });
    const metrics = {};
    for (const item of response.data.data || []) {
      metrics[item.name] = item.values?.[0]?.value || item.value || 0;
    }
    return metrics;
  } catch (err) {
    return { impressions: 0, reach: 0, engagement: 0 };
  }
}

async function findTopPerformers() {
  const { pageId, pageToken, igAccountId } = getConfig();
  const result = { facebook: null, instagram: null };

  // פייסבוק
  try {
    const postsRes = await axios.get(`${GRAPH_URL}/${pageId}/feed`, {
      params: { fields: 'id,message,created_time', limit: 10, access_token: pageToken }
    });
    const posts = postsRes.data.data || [];
    let topFb = null, topScore = -1;

    for (const post of posts) {
      const insights = await getFacebookPostInsights(post.id);
      const score = insights.post_impressions || 0;
      if (score > topScore) {
        topScore = score;
        topFb = {
          id: post.id,
          message: (post.message || '').substring(0, 120),
          impressions: insights.post_impressions || 0,
          reach: insights.post_reach || 0,
          engagement: insights.post_engaged_users || 0
        };
      }
    }
    result.facebook = topFb;
  } catch (err) {
    console.error('❌ ניתוח פייסבוק:', err.message);
  }

  // אינסטגרם
  try {
    const igRes = await axios.get(`${GRAPH_URL}/${igAccountId}/media`, {
      params: { fields: 'id,caption,permalink', limit: 10, access_token: pageToken }
    });
    const posts = igRes.data.data || [];
    let topIg = null, topScore = -1;

    for (const post of posts) {
      const insights = await getInstagramMediaInsights(post.id);
      const score = insights.impressions || 0;
      if (score > topScore) {
        topScore = score;
        topIg = {
          id: post.id,
          caption: (post.caption || '').substring(0, 120),
          permalink: post.permalink,
          impressions: insights.impressions || 0,
          reach: insights.reach || 0,
          engagement: insights.engagement || 0
        };
      }
    }
    result.instagram = topIg;
  } catch (err) {
    console.error('❌ ניתוח אינסטגרם:', err.message);
  }

  return result;
}

// ── קידום פוסט ─────────────────────────────────────

async function boostFacebookPost(postId, budgetNIS, durationDays = 3) {
  const { pageId, pageToken, adAccountId } = getConfig();
  if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID לא מוגדר');

  const budgetAgorot = budgetNIS * 100;
  const endTime = Math.floor(Date.now() / 1000) + durationDays * 86400;

  const campaignRes = await axios.post(`${GRAPH_URL}/${adAccountId}/campaigns`, {
    name: `בית סרוק — קידום ${new Date().toLocaleDateString('he-IL')}`,
    objective: 'POST_ENGAGEMENT',
    status: 'ACTIVE',
    special_ad_categories: [],
    access_token: pageToken
  });
  const campaignId = campaignRes.data.id;

  const adSetRes = await axios.post(`${GRAPH_URL}/${adAccountId}/adsets`, {
    campaign_id: campaignId,
    name: `Ad Set — ${postId}`,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: budgetAgorot,
    end_time: endTime,
    targeting: JSON.stringify({ geo_locations: { countries: ['IL'] }, age_min: 25, age_max: 65 }),
    status: 'ACTIVE',
    access_token: pageToken
  });
  const adSetId = adSetRes.data.id;

  const creativeRes = await axios.post(`${GRAPH_URL}/${adAccountId}/adcreatives`, {
    name: `Creative — ${postId}`,
    object_story_id: `${pageId}_${postId.split('_')[1] || postId}`,
    access_token: pageToken
  });
  const creativeId = creativeRes.data.id;

  const adRes = await axios.post(`${GRAPH_URL}/${adAccountId}/ads`, {
    name: `Ad — ${postId}`,
    adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'ACTIVE',
    access_token: pageToken
  });

  console.log('✅ קמפיין פייסבוק הופעל:', campaignId);
  return { campaignId, adSetId, creativeId, adId: adRes.data.id };
}

async function boostInstagramPost(igMediaId, budgetNIS, durationDays = 3) {
  const { igAccountId, pageToken, adAccountId } = getConfig();
  if (!adAccountId) throw new Error('META_AD_ACCOUNT_ID לא מוגדר');

  const budgetAgorot = budgetNIS * 100;
  const endTime = Math.floor(Date.now() / 1000) + durationDays * 86400;

  const campaignRes = await axios.post(`${GRAPH_URL}/${adAccountId}/campaigns`, {
    name: `בית סרוק — קידום IG ${new Date().toLocaleDateString('he-IL')}`,
    objective: 'POST_ENGAGEMENT',
    status: 'ACTIVE',
    special_ad_categories: [],
    access_token: pageToken
  });
  const campaignId = campaignRes.data.id;

  const adSetRes = await axios.post(`${GRAPH_URL}/${adAccountId}/adsets`, {
    campaign_id: campaignId,
    name: `IG Ad Set — ${igMediaId}`,
    billing_event: 'IMPRESSIONS',
    optimization_goal: 'POST_ENGAGEMENT',
    bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
    daily_budget: budgetAgorot,
    end_time: endTime,
    targeting: JSON.stringify({ geo_locations: { countries: ['IL'] }, age_min: 25, age_max: 65, publisher_platforms: ['instagram'] }),
    status: 'ACTIVE',
    access_token: pageToken
  });
  const adSetId = adSetRes.data.id;

  const creativeRes = await axios.post(`${GRAPH_URL}/${adAccountId}/adcreatives`, {
    name: `IG Creative — ${igMediaId}`,
    instagram_actor_id: igAccountId,
    object_story_id: igMediaId,
    access_token: pageToken
  });
  const creativeId = creativeRes.data.id;

  const adRes = await axios.post(`${GRAPH_URL}/${adAccountId}/ads`, {
    name: `IG Ad — ${igMediaId}`,
    adset_id: adSetId,
    creative: JSON.stringify({ creative_id: creativeId }),
    status: 'ACTIVE',
    access_token: pageToken
  });

  console.log('✅ קמפיין אינסטגרם הופעל:', campaignId);
  return { campaignId, adSetId, creativeId, adId: adRes.data.id };
}

module.exports = { findTopPerformers, boostFacebookPost, boostInstagramPost };
