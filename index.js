const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

const app = express();
app.use(cors());
app.use(express.json());

const BASE = 'https://graph.facebook.com/v25.0';
const SYSTEM_TOKEN = process.env.SYSTEM_TOKEN;
const PAGE_TOKEN = process.env.PAGE_TOKEN;
const ADS_TOKEN = process.env.ADS_TOKEN;
const FB_PAGE_ID = process.env.FB_PAGE_ID || '1128680877177299';
const IG_ACCOUNT_ID = process.env.IG_ACCOUNT_ID || '17841407645624576';
const AD_ACCOUNT_ID = process.env.AD_ACCOUNT_ID || 'act_119148098695256';

async function apiFetch(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message + ' (code ' + data.error.code + ')');
  return data;
}

app.get('/', (req, res) => res.json({ status: 'ok', service: 'Meta Dashboard API v25' }));

// ============================================================
// ORGANIC INSTAGRAM
// ============================================================
app.get('/metrics', async (req, res) => {
  const period = parseInt(req.query.period) || 28;
  const since = Math.floor(Date.now() / 1000) - period * 86400;
  const until = Math.floor(Date.now() / 1000);
  const results = { ig: { info: {}, insights: [], interactions: [] }, fb: { info: {}, insights: [] } };
  const errors = [];

  try {
    const [igInfo, igReach, igInteractions] = await Promise.all([
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}?fields=followers_count,media_count,name&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=reach&period=day&since=${since}&until=${until}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=likes,comments,saves,shares&period=day&metric_type=total_value&since=${since}&until=${until}&access_token=${SYSTEM_TOKEN}`)
    ]);
    results.ig = { info: igInfo, insights: igReach.data || [], interactions: igInteractions.data || [] };
  } catch(e) { errors.push('IG: ' + e.message); }

  try {
    const fbInfo = await apiFetch(`${BASE}/${FB_PAGE_ID}?fields=fan_count,name,followers_count&access_token=${PAGE_TOKEN}`);
    results.fb = { info: fbInfo, insights: [] };
  } catch(e) { errors.push('FB: ' + e.message); }

  if (errors.length) results.errors = errors;
  res.json(results);
});

// ============================================================
// ORGANIC POSTS
// ============================================================
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
        } catch(e) { igPosts.push({ ...m, platform: 'ig', insights: [] }); }
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

// ============================================================
// ADS - CAMPAÑAS
// ============================================================
app.get('/ads', async (req, res) => {
  const period = req.query.period || 'last_28d';
  const since = req.query.since;
  const until = req.query.until;
  const timeParams = (since && until) ? `time_range={"since":"${since}","until":"${until}"}` : `date_preset=${period}`;

  try {
    const [campaigns, topAds] = await Promise.all([
      apiFetch(`${BASE}/${AD_ACCOUNT_ID}/insights?fields=campaign_name,campaign_id,impressions,reach,clicks,ctr,spend,cpm,cpc,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,actions&level=campaign&${timeParams}&access_token=${ADS_TOKEN}`),
      apiFetch(`${BASE}/${AD_ACCOUNT_ID}/insights?fields=ad_id,ad_name,adset_name,campaign_name,impressions,reach,clicks,ctr,spend,actions&level=ad&${timeParams}&sort=impressions_descending&limit=6&access_token=${ADS_TOKEN}`)
    ]);

    const adsWithCreatives = await Promise.all(
      (topAds.data || []).slice(0, 6).map(async (ad) => {
        try {
          const adDetails = await apiFetch(`${BASE}/${ad.ad_id}?fields=creative{id,name,thumbnail_url,image_url,video_id,body,title,effective_instagram_media_id}&access_token=${ADS_TOKEN}`);
          return { ...ad, creative: adDetails.creative || null };
        } catch(e) { return { ...ad, creative: null }; }
      })
    );

    res.json({
      campaigns: campaigns.data || [],
      topAds: adsWithCreatives,
      summary: {
        totalSpend: (campaigns.data || []).reduce((a, c) => a + parseFloat(c.spend || 0), 0),
        totalImpressions: (campaigns.data || []).reduce((a, c) => a + parseInt(c.impressions || 0), 0),
        totalReach: (campaigns.data || []).reduce((a, c) => a + parseInt(c.reach || 0), 0),
        totalClicks: (campaigns.data || []).reduce((a, c) => a + parseInt(c.clicks || 0), 0),
      }
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta API proxy corriendo en puerto ${PORT}`));
