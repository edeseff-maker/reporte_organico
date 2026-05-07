const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const BASE = 'https://graph.facebook.com/v25.0';
const TOKEN = process.env.PAGE_TOKEN;
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
  try {
    const [igInfo, igReach, igInteractions, fbInfo, fbImpressions, fbEngagement, fbFollows] = await Promise.all([
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}?fields=followers_count,media_count,name&access_token=${TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=likes,comments,saves,shares&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}?fields=fan_count,name,followers_count&access_token=${TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_impressions_unique&period=day&since=${since}&until=${until}&access_token=${TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_post_engagements&period=day&since=${since}&until=${until}&access_token=${TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_daily_follows_unique&period=day&since=${since}&until=${until}&access_token=${TOKEN}`)
    ]);
    res.json({
      ig: {
        info: igInfo,
        insights: igReach.data || [],
        interactions: igInteractions.data || []
      },
      fb: {
        info: fbInfo,
        insights: [
          ...(fbImpressions.data || []),
          ...(fbEngagement.data || []),
          ...(fbFollows.data || [])
        ]
      }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/posts', async (req, res) => {
  const platform = req.query.platform || 'both';
  const limit = parseInt(req.query.limit) || 6;
  try {
    let igPosts = [], fbPosts = [];

    if (platform !== 'fb') {
      try {
        const media = await apiFetch(`${BASE}/${IG_ACCOUNT_ID}/media?fields=id,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,caption&limit=${limit}&access_token=${TOKEN}`);
        for (const m of (media.data || []).slice(0, limit)) {
          try {
            const insights = await apiFetch(`${BASE}/${m.id}/insights?metric=reach,saved&access_token=${TOKEN}`);
            igPosts.push({ ...m, platform: 'ig', insights: insights.data });
          } catch (e) {
            igPosts.push({ ...m, platform: 'ig', insights: [] });
          }
        }
      } catch(e) { console.warn('IG posts error:', e.message); }
    }

    if (platform !== 'ig') {
      try {
        const posts = await apiFetch(`${BASE}/${FB_PAGE_ID}/posts?fields=id,message,created_time,full_picture,reactions.summary(true),comments.summary(true),shares&limit=${limit}&access_token=${TOKEN}`);
        fbPosts = (posts.data || []).map(p => ({ ...p, platform: 'fb' }));
      } catch(e) { console.warn('FB posts error:', e.message); }
    }

    res.json({ ig: igPosts, fb: fbPosts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta API proxy corriendo en puerto ${PORT}`));
