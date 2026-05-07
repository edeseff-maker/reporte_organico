const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const BASE = 'https://graph.facebook.com/v25.0';
const PAGE_TOKEN = process.env.PAGE_TOKEN;   // Page token → Facebook insights
const SYSTEM_TOKEN = process.env.SYSTEM_TOKEN; // System user token → Instagram
const FB_PAGE_ID = process.env.FB_PAGE_ID || '1128680877177299';
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID || '17841407645624576';

async function apiFetch(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message + ' (code ' + data.error.code + ')');
  return data;
}

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Meta Organic Dashboard API v25' }));

app.get('/metrics', async (req, res) => {
  const period = parseInt(req.query.period) || 30;
  const since = Math.floor(Date.now() / 1000) - period * 86400;
  const until = Math.floor(Date.now() / 1000);

  const results = { ig: { info: {}, insights: [], interactions: [] }, fb: { info: {}, insights: [] } };
  const errors = [];

  // Instagram con SYSTEM_TOKEN
  try {
    const [igInfo, igReach, igInteractions] = await Promise.all([
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}?fields=followers_count,media_count,name&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=likes,comments,saves,shares&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${SYSTEM_TOKEN}`)
    ]);
    results.ig = { info: igInfo, insights: igReach.data || [], interactions: igInteractions.data || [] };
  } catch(e) {
    errors.push('IG: ' + e.message);
  }

  // Facebook con PAGE_TOKEN
  try {
    const [fbInfo, fbImpressions, fbEngagement, fbFollows] = await Promise.all([
      apiFetch(`${BASE}/${FB_PAGE_ID}?fields=fan_count,name,followers_count&access_token=${PAGE_TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_impressions_unique&period=day&since=${since}&until=${until}&access_token=${PAGE_TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_post_engagements&period=day&since=${since}&until=${until}&access_token=${PAGE_TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_daily_follows_unique&period=day&since=${since}&until=${until}&access_token=${PAGE_TOKEN}`)
    ]);
    results.fb = {
      info: fbInfo,
      insights: [
        ...(fbImpressions.data || []),
        ...(fbEngagement.data || []),
        ...(fbFollows.data || [])
      ]
    };
  } catch(e) {
    errors.push('FB: ' + e.message);
  }

  if (errors.length) results.errors = errors;
  res.json(results);
});

app.get('/posts', async (req, res) => {
  const platform = req.query.platform || 'both';
  const limit = parseInt(req.query.limit) || 6;
  let igPosts = [], fbPosts = [];
  const errors = [];

  if (platform !== 'fb') {
    try {
      const media = await apiFetch(`${BASE}/${IG_ACCOUNT_ID}/media?fields=id,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,caption&limit=${limit}&access_token=${SYSTEM_TOKEN}`);
      for (const m of (media.data || []).slice(0, limit)) {
        try {
          const insights = await apiFetch(`${BASE}/${m.id}/insights?metric=reach,saved&access_token=${SYSTEM_TOKEN}`);
          igPosts.push({ ...m, platform: 'ig', insights: insights.data });
        } catch(e) {
          igPosts.push({ ...m, platform: 'ig', insights: [] });
        }
      }
    } catch(e) { errors.push('IG posts: ' + e.message); }
  }

  if (platform !== 'ig') {
    try {
      const posts = await apiFetch(`${BASE}/${FB_PAGE_ID}/posts?fields=id,message,created_time,full_picture,reactions.summary(true),comments.summary(true),shares&limit=${limit}&access_token=${PAGE_TOKEN}`);
      fbPosts = (posts.data || []).map(p => ({ ...p, platform: 'fb' }));
    } catch(e) { errors.push('FB posts: ' + e.message); }
  }

  res.json({ ig: igPosts, fb: fbPosts, errors });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta API proxy corriendo en puerto ${PORT}`));
