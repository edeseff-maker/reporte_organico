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

  // Período actual
  const now = new Date();
  const untilDate = new Date(now); untilDate.setHours(0, 0, 0, 0);
  const sinceDate = new Date(untilDate); sinceDate.setDate(sinceDate.getDate() - period);

  // Período anterior (mismo rango, desplazado hacia atrás)
  const prevUntilDate = new Date(sinceDate);
  const prevSinceDate = new Date(prevUntilDate); prevSinceDate.setDate(prevSinceDate.getDate() - period);

  const sinceStr = sinceDate.toISOString().slice(0, 10);
  const untilStr = untilDate.toISOString().slice(0, 10);
  const prevSinceStr = prevSinceDate.toISOString().slice(0, 10);
  const prevUntilStr = prevUntilDate.toISOString().slice(0, 10);
  const sinceTs = Math.floor(sinceDate.getTime() / 1000);
  const untilTs = Math.floor(untilDate.getTime() / 1000);
  const prevSinceTs = Math.floor(prevSinceDate.getTime() / 1000);
  const prevUntilTs = Math.floor(prevUntilDate.getTime() / 1000);

  const fmtDate = d => d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' });
  const dateLabel = `${fmtDate(sinceDate)} – ${fmtDate(new Date(untilDate.getTime() - 86400000))}`;
  const prevDateLabel = `${fmtDate(prevSinceDate)} – ${fmtDate(new Date(prevUntilDate.getTime() - 86400000))}`;

  const results = { ig: {}, fb: {}, dateLabel, prevDateLabel, sinceStr, untilStr };
  const errors = [];

  try {
    const [
      igInfo, igReach, igInteractions, igViews, igFollows, igTotalInt,
      igReachPrev, igInteractionsPrev, igViewsPrev, igTotalIntPrev,
      igDemoAge, igDemoGender, igDemoCity, igDemoCountry
    ] = await Promise.all([
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}?fields=followers_count,media_count,name&access_token=${SYSTEM_TOKEN}`),
      // Período actual
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=reach&period=days_28&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=likes,comments,saves,shares&period=day&metric_type=total_value&breakdown=media_product_type&since=${sinceTs}&until=${untilTs}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=views&period=day&metric_type=total_value&since=${sinceStr}&until=${untilStr}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=follows_and_unfollows&period=day&metric_type=total_value&breakdown=follow_type&since=${sinceStr}&until=${untilStr}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=total_interactions&period=day&metric_type=total_value&since=${sinceStr}&until=${untilStr}&access_token=${SYSTEM_TOKEN}`),
      // Período anterior
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=reach&period=days_28&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=likes,comments,saves,shares&period=day&metric_type=total_value&since=${prevSinceTs}&until=${prevUntilTs}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=views&period=day&metric_type=total_value&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=total_interactions&period=day&metric_type=total_value&since=${prevSinceStr}&until=${prevUntilStr}&access_token=${SYSTEM_TOKEN}`),
      // Demografía (lifetime, no cambia con el período)
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=gender&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=city&access_token=${SYSTEM_TOKEN}`),
      apiFetch(`${BASE}/${IG_ACCOUNT_ID}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=country&access_token=${SYSTEM_TOKEN}`)
    ]);

    const followBreakdown = igFollows.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    const newFollowers = followBreakdown.find(r => r.dimension_values?.[0] === 'FOLLOWER')?.value || 0;
    const unfollowers = followBreakdown.find(r => r.dimension_values?.[0] === 'NON_FOLLOWER')?.value || 0;

    function parseBreakdown(data, metricName) {
      const m = data.find(i => i.name === metricName);
      if (!m) return { total: 0, post: 0, reel: 0, ad: 0 };
      const results = m.total_value?.breakdowns?.[0]?.results || [];
      return {
        total: m.total_value?.value || 0,
        post: results.find(r => r.dimension_values?.[0] === 'POST')?.value || 0,
        reel: results.find(r => r.dimension_values?.[0] === 'REEL')?.value || 0,
        ad: results.find(r => r.dimension_values?.[0] === 'AD')?.value || 0,
      };
    }

    function getTotalVal(data, name) {
      return data.find(i => i.name === name)?.total_value?.value || 0;
    }

    function pct(curr, prev) {
      if (!prev) return null;
      return parseFloat(((curr - prev) / prev * 100).toFixed(1));
    }

    const intData = igInteractions.data || [];
    const prevIntData = igInteractionsPrev.data || [];

    const currReach = igReach.data?.[0]?.values?.slice(-1)?.[0]?.value || 0;
    const prevReach = igReachPrev.data?.[0]?.values?.slice(-1)?.[0]?.value || 0;
    const currViews = igViews.data?.[0]?.total_value?.value || 0;
    const prevViews = igViewsPrev.data?.[0]?.total_value?.value || 0;
    const currTotalInt = igTotalInt.data?.[0]?.total_value?.value || 0;
    const prevTotalInt = igTotalIntPrev.data?.[0]?.total_value?.value || 0;

    const currLikes = getTotalVal(intData, 'likes');
    const prevLikes = getTotalVal(prevIntData, 'likes');
    const currComments = getTotalVal(intData, 'comments');
    const prevComments = getTotalVal(prevIntData, 'comments');
    const currSaves = getTotalVal(intData, 'saves');
    const prevSaves = getTotalVal(prevIntData, 'saves');
    const currShares = getTotalVal(intData, 'shares');
    const prevShares = getTotalVal(prevIntData, 'shares');

    // Parsear demografía
    function parseDemographic(apiData) {
      return (apiData.data?.[0]?.total_value?.breakdowns?.[0]?.results || [])
        .map(r => ({ label: r.dimension_values?.[0], value: r.value }))
        .sort((a, b) => b.value - a.value);
    }

    results.ig = {
      info: igInfo,
      insights: igReach.data || [],
      interactions: intData,
      views: currViews,
      totalInteractions: currTotalInt,
      newFollowers,
      unfollowers,
      breakdown: {
        likes: parseBreakdown(intData, 'likes'),
        comments: parseBreakdown(intData, 'comments'),
        saves: parseBreakdown(intData, 'saves'),
        shares: parseBreakdown(intData, 'shares'),
      },
      prev: {
        reach: prevReach,
        views: prevViews,
        totalInteractions: prevTotalInt,
        likes: prevLikes,
        comments: prevComments,
        saves: prevSaves,
        shares: prevShares,
      },
      growth: {
        reach: pct(currReach, prevReach),
        views: pct(currViews, prevViews),
        totalInteractions: pct(currTotalInt, prevTotalInt),
        likes: pct(currLikes, prevLikes),
        comments: pct(currComments, prevComments),
        saves: pct(currSaves, prevSaves),
        shares: pct(currShares, prevShares),
      },
      demographics: {
        age: parseDemographic(igDemoAge),
        gender: parseDemographic(igDemoGender),
        city: parseDemographic(igDemoCity).slice(0, 10),
        country: parseDemographic(igDemoCountry).slice(0, 10),
      }
    };
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
// HEATMAP - mejores horarios basado en posts reales
// ============================================================
app.get('/heatmap', async (req, res) => {
  try {
    // Traer los últimos 50 posts con timestamp y métricas
    const media = await apiFetch(
      `${BASE}/${IG_ACCOUNT_ID}/media?fields=id,timestamp,like_count,comments_count,media_type&limit=50&access_token=${SYSTEM_TOKEN}`
    );

    // Para cada post, traer reach y saves
    const posts = await Promise.all(
      (media.data || []).map(async (m) => {
        let reach = 0, saves = 0;
        try {
          const ins = await apiFetch(`${BASE}/${m.id}/insights?metric=reach,saved&access_token=${SYSTEM_TOKEN}`);
          reach = ins.data?.find(i => i.name === 'reach')?.values?.[0]?.value || 0;
          saves = ins.data?.find(i => i.name === 'saved')?.values?.[0]?.value || 0;
        } catch(e) {}
        const engagement = (m.like_count||0) + (m.comments_count||0) + saves;
        const er = reach > 0 ? (engagement / reach * 100) : 0;

        // Convertir timestamp a hora y día local (Argentina UTC-3)
        const date = new Date(m.timestamp);
        const localHour = (date.getUTCHours() - 3 + 24) % 24;
        const localDay = (date.getUTCDay() + (localHour < 0 ? -1 : 0) + 7) % 7; // 0=Sun

        return { hour: localHour, day: localDay, er, engagement, reach };
      })
    );

    // Construir grilla hora x día (24 horas x 7 días)
    // Días: 0=Dom, 1=Lun, ..., 6=Sáb
    const grid = {};
    const counts = {};
    for (const p of posts) {
      const key = `${p.day}-${p.hour}`;
      if (!grid[key]) { grid[key] = 0; counts[key] = 0; }
      grid[key] += p.er;
      counts[key]++;
    }

    // Calcular promedios y armar estructura
    const heatmap = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const key = `${day}-${hour}`;
        heatmap.push({
          day, hour,
          avgEr: counts[key] ? parseFloat((grid[key] / counts[key]).toFixed(2)) : 0,
          posts: counts[key] || 0
        });
      }
    }

    // Top 5 mejores slots
    const topSlots = [...heatmap]
      .filter(s => s.posts > 0)
      .sort((a, b) => b.avgEr - a.avgEr)
      .slice(0, 5);

    res.json({ heatmap, topSlots, totalPosts: posts.length });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// ADS - JERARQUÍA CAMPAÑA > CONJUNTO > ANUNCIO
// ============================================================
app.get('/ads', async (req, res) => {
  const period = req.query.period || 'last_28d';
  const since = req.query.since;
  const until = req.query.until;
  const timeParams = (since && until) ? `time_range={"since":"${since}","until":"${until}"}` : `date_preset=${period}`;

  try {
    // Traer todo en paralelo: campañas, conjuntos y anuncios
    const [campaigns, adsets, allAds] = await Promise.all([
      apiFetch(`${BASE}/${AD_ACCOUNT_ID}/insights?fields=campaign_id,campaign_name,impressions,reach,clicks,ctr,spend,cpm,cpc,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p100_watched_actions,actions&level=campaign&${timeParams}&access_token=${ADS_TOKEN}`),
      apiFetch(`${BASE}/${AD_ACCOUNT_ID}/insights?fields=campaign_id,campaign_name,adset_id,adset_name,impressions,reach,clicks,ctr,spend,cpm,cpc,actions&level=adset&${timeParams}&access_token=${ADS_TOKEN}`),
      apiFetch(`${BASE}/${AD_ACCOUNT_ID}/insights?fields=campaign_id,adset_id,ad_id,ad_name,adset_name,campaign_name,impressions,reach,clicks,ctr,spend,actions&level=ad&${timeParams}&sort=impressions_descending&limit=50&access_token=${ADS_TOKEN}`)
    ]);

    // Traer creativos para los top 6 ads por impresiones
    const topSixAds = (allAds.data || []).slice(0, 6);
    const adsWithCreatives = await Promise.all(
      topSixAds.map(async (ad) => {
        try {
          const adDetails = await apiFetch(`${BASE}/${ad.ad_id}?fields=creative{id,name,image_url,video_id,body,title,effective_instagram_media_id,object_story_spec{video_data{image_url}}}&access_token=${ADS_TOKEN}`);
          const creative = adDetails.creative || null;
          if (creative?.effective_instagram_media_id) {
            try {
              const igMedia = await apiFetch(`${BASE}/${creative.effective_instagram_media_id}?fields=media_url,thumbnail_url&access_token=${SYSTEM_TOKEN}`);
              creative.thumbnail_url = igMedia.media_url || igMedia.thumbnail_url || creative.image_url;
            } catch(e) {
              creative.thumbnail_url = creative.image_url || creative.object_story_spec?.video_data?.image_url || '';
            }
          } else {
            creative.thumbnail_url = creative.image_url || creative.object_story_spec?.video_data?.image_url || '';
          }
          return { ...ad, creative };
        } catch(e) { return { ...ad, creative: null }; }
      })
    );

    // Construir jerarquía: campaign > adsets > ads
    const creativeMap = {};
    adsWithCreatives.forEach(a => { creativeMap[a.ad_id] = a.creative; });

    const hierarchy = (campaigns.data || []).map(camp => {
      const campAdsets = (adsets.data || [])
        .filter(as => as.campaign_id === camp.campaign_id)
        .map(adset => {
          const adsetAds = (allAds.data || [])
            .filter(ad => ad.adset_id === adset.adset_id)
            .map(ad => ({ ...ad, creative: creativeMap[ad.ad_id] || null }));
          return { ...adset, ads: adsetAds };
        });
      return { ...camp, adsets: campAdsets };
    });

    res.json({
      hierarchy,
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

// ============================================================
// CONTENIDO UNIFICADO - join orgánico + pago por post
// ============================================================
app.get('/unified', async (req, res) => {
  const period = req.query.period || 'last_28d';
  const since = req.query.since;
  const until = req.query.until;
  const timeParams = (since && until) ? `time_range={"since":"${since}","until":"${until}"}` : `date_preset=${period}`;

  try {
    // Traer todos los ads con su effective_instagram_media_id
    const allAds = await apiFetch(
      `${BASE}/${AD_ACCOUNT_ID}/insights?` +
      `fields=ad_id,ad_name,campaign_name,impressions,reach,clicks,ctr,spend,actions&` +
      `level=ad&${timeParams}&limit=50&access_token=${ADS_TOKEN}`
    );

    // Para cada ad, traer el creative con el ig media id
    const adsWithMedia = await Promise.all(
      (allAds.data || []).map(async (ad) => {
        try {
          const adDetails = await apiFetch(
            `${BASE}/${ad.ad_id}?fields=creative{effective_instagram_media_id,image_url,body,title,video_id,object_story_spec{video_data{image_url}}}&access_token=${ADS_TOKEN}`
          );
          return { ...ad, igMediaId: adDetails.creative?.effective_instagram_media_id || null, creative: adDetails.creative || null };
        } catch(e) { return { ...ad, igMediaId: null, creative: null }; }
      })
    );

    // Agrupar métricas pagas por igMediaId
    const paidByMediaId = {};
    for (const ad of adsWithMedia) {
      if (!ad.igMediaId) continue;
      if (!paidByMediaId[ad.igMediaId]) {
        paidByMediaId[ad.igMediaId] = {
          spend: 0, impressions: 0, reach: 0, clicks: 0,
          video_views: 0, reactions: 0, comments: 0, saves: 0,
          campaigns: new Set(), creative: ad.creative
        };
      }
      const p = paidByMediaId[ad.igMediaId];
      p.spend += parseFloat(ad.spend || 0);
      p.impressions += parseInt(ad.impressions || 0);
      p.reach += parseInt(ad.reach || 0);
      p.clicks += parseInt(ad.clicks || 0);
      p.campaigns.add(ad.campaign_name);
      const getA = (type) => parseInt((ad.actions||[]).find(a=>a.action_type===type)?.value||0);
      p.video_views += getA('video_view');
      p.reactions += getA('post_reaction');
      p.comments += getA('comment');
      p.saves += getA('onsite_conversion.post_save');
    }

    // Traer posts orgánicos de IG con sus métricas
    const media = await apiFetch(
      `${BASE}/${IG_ACCOUNT_ID}/media?fields=id,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,caption&limit=50&access_token=${SYSTEM_TOKEN}`
    );

    const unifiedPosts = [];
    for (const m of (media.data || [])) {
      let orgReach = 0, orgSaves = 0;
      try {
        const insights = await apiFetch(`${BASE}/${m.id}/insights?metric=reach,saved&access_token=${SYSTEM_TOKEN}`);
        orgReach = insights.data?.find(i=>i.name==='reach')?.values?.[0]?.value || 0;
        orgSaves = insights.data?.find(i=>i.name==='saved')?.values?.[0]?.value || 0;
      } catch(e) {}

      const paid = paidByMediaId[m.id] || null;

      // Si tiene métricas pagas, get high-res image
      let img = m.media_url || m.thumbnail_url;
      if (paid?.creative?.effective_instagram_media_id) {
        try {
          const igM = await apiFetch(`${BASE}/${m.id}?fields=media_url,thumbnail_url&access_token=${SYSTEM_TOKEN}`);
          img = igM.media_url || igM.thumbnail_url || img;
        } catch(e) {}
      }

      unifiedPosts.push({
        id: m.id,
        media_type: m.media_type,
        img,
        caption: m.caption || '',
        timestamp: m.timestamp,
        organic: {
          reach: orgReach,
          likes: m.like_count || 0,
          comments: m.comments_count || 0,
          saves: orgSaves,
        },
        paid: paid ? {
          spend: paid.spend,
          impressions: paid.impressions,
          reach: paid.reach,
          clicks: paid.clicks,
          video_views: paid.video_views,
          reactions: paid.reactions,
          comments: paid.comments,
          saves: paid.saves,
          campaigns: Array.from(paid.campaigns),
        } : null,
        total: {
          reach: orgReach + (paid?.reach || 0),
          interactions: (m.like_count||0) + (m.comments_count||0) + orgSaves + (paid?.reactions||0) + (paid?.comments||0) + (paid?.saves||0),
          spend: paid?.spend || 0,
        }
      });
    }

    // Ordenar por alcance total
    unifiedPosts.sort((a, b) => b.total.reach - a.total.reach);

    res.json({ posts: unifiedPosts });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Meta API proxy corriendo en puerto ${PORT}`));
