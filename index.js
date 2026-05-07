const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const BASE = 'https://graph.facebook.com/v19.0';
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID || '1128680877177299';

async function apiFetch(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message + ' (code ' + data.error.code + ')');
  return data;
}

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Meta Organic Dashboard API - Facebook' }));

app.get('/metrics', async (req, res) => {
  const period = parseInt(req.query.period) || 30;
  const since = Math.floor(Date.now() / 1000) - period * 86400;
  const until = Math.floor(Date.now() / 1000);
  try {
    const [fbInfo, fbInsights] = await Promise.all([
      apiFetch(`${BASE}/${FB_PAGE_ID}?fields=fan_count,name,followers_count&access_token=${PAGE_TOKEN}`),
      apiFetch(`${BASE}/${FB_PAGE_ID}/insights?metric=page_impressions_organic,page_reach,page_engaged_users&period=day&since=${since}&until=${until}&access_token=${PAGE_TOKEN}`)
    ]);
    res.json({
      ig: { info: { followers_count: 0, media_count: 0, name: 'Instagram (pendiente)' }, insights: [] },
      fb: { info: fbInfo, insights: fbInsights.data }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/posts', async (req, res) => {
  const limit = parseInt(req.query.limit) || 6;
  try {
    const posts = await apiFetch(`${BASE}/${FB_PAGE_ID}/posts?fields=id,message,created_time,full_picture,reactions.summary(true),comments.summary(true),shares&limit=${limit}&access_token=${PAGE_TOKEN}`);
    const fbPosts = (posts.data || []).map(p => ({ ...p, platform: 'fb' }));
    res.json({ ig: [], fb: fbPosts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta API proxy corriendo en puerto ${PORT}`));
