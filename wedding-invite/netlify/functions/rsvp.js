const { getStore } = require('@netlify/blobs');

const STORE_NAME = 'wedding-rsvp';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(body)
  };
}

function countResponses(responses) {
  let attending = 0;
  let notAttending = 0;

  for (const entry of responses) {
    if (entry.attending === 'no') {
      notAttending += 1;
    } else {
      attending += entry.paxCount || 1;
    }
  }

  return { attending, notAttending, total: responses.length };
}

async function getResponses(tier) {
  const store = getStore(STORE_NAME);
  return (await store.get(`responses-${tier}`, { type: 'json' })) || [];
}

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function responsesToCsv(responses) {
  const headers = [
    'Submitted At',
    'Tier',
    'Name',
    'Attending',
    'Side',
    'Event',
    'Pax',
    'Excited For',
    'Song Request',
    'Speech',
    'Dinner Idea',
    'Hashtag Idea',
    'Gift',
    'Gift Other'
  ];

  const rows = responses.map((entry) => {
    const dinner = entry.dinner || {};
    return [
      entry.submittedAt,
      entry.tier,
      entry.name,
      entry.attending,
      entry.side || '',
      entry.event || '',
      entry.paxCount ?? 0,
      dinner.excited || '',
      dinner.song || '',
      dinner.speech || '',
      dinner.dinnerIdea || '',
      dinner.hashtagIdea || '',
      dinner.gift || '',
      dinner.giftOther || ''
    ].map(escapeCsvCell).join(',');
  });

  return `${headers.map(escapeCsvCell).join(',')}\n${rows.join('\n')}`;
}

function getAdminKey(event) {
  const params = event.queryStringParameters || {};
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const bearerKey = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  return params.key || bearerKey || '';
}

function isAuthorizedAdmin(event) {
  const adminKey = process.env.RSVP_ADMIN_KEY;
  if (!adminKey) return false;
  return getAdminKey(event) === adminKey;
}

async function getExportResponses(tierParam) {
  if (tierParam === 'full' || tierParam === 'solemnization') {
    return getResponses(tierParam);
  }

  const [full, solemnization] = await Promise.all([
    getResponses('full'),
    getResponses('solemnization')
  ]);

  return [...full, ...solemnization].sort((a, b) =>
    String(a.submittedAt).localeCompare(String(b.submittedAt))
  );
}

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    const params = event.queryStringParameters || {};

    if (params.export === 'csv') {
      if (!isAuthorizedAdmin(event)) {
        return jsonResponse(401, { error: 'Unauthorized' });
      }

      const tierParam = params.tier === 'full' || params.tier === 'solemnization'
        ? params.tier
        : 'all';
      const responses = await getExportResponses(tierParam);
      const stamp = new Date().toISOString().slice(0, 10);
      const filename = `rsvp-${tierParam}-${stamp}.csv`;

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store'
        },
        body: `\uFEFF${responsesToCsv(responses)}`
      };
    }

    const tier = params.tier === 'full' ? 'full' : 'solemnization';
    const responses = await getResponses(tier);
    return jsonResponse(200, countResponses(responses));
  }

  if (event.httpMethod === 'POST') {
    let payload;

    try {
      payload = JSON.parse(event.body || '{}');
    } catch {
      return jsonResponse(400, { error: 'Invalid JSON' });
    }

    const tier = payload.tier === 'full' ? 'full' : 'solemnization';
    const name = String(payload.name || '').trim();
    const attending = payload.attending;
    const side = payload.side;
    const eventChoice = payload.event;
    const paxCount = Number(payload.paxCount) || 0;

    if (!name) {
      return jsonResponse(400, { error: 'Name is required' });
    }

    if (!['yes', 'yes-food', 'no'].includes(attending)) {
      return jsonResponse(400, { error: 'Invalid attendance choice' });
    }

    if (tier === 'full' && !['groom', 'bride'].includes(side)) {
      return jsonResponse(400, { error: 'Please select groom or bride' });
    }

    const isAttending = attending === 'yes' || attending === 'yes-food';

    if (isAttending) {
      if (tier === 'full' && !['solemnization-only', 'dinner-only', 'both'].includes(eventChoice)) {
        return jsonResponse(400, { error: 'Invalid event choice' });
      }

      if (!Number.isInteger(paxCount) || paxCount < 1 || paxCount > 5) {
        return jsonResponse(400, { error: 'Invalid guest count' });
      }

      const includesDinner = tier === 'full' &&
        (eventChoice === 'dinner-only' || eventChoice === 'both');

      if (includesDinner) {
        if (!payload.dinner) {
          return jsonResponse(400, { error: 'Dinner details required' });
        }
        const { excited, speech, gift, giftOther } = payload.dinner;
        if (!['food', 'couple', 'photos', 'vibes'].includes(excited)) {
          return jsonResponse(400, { error: 'Invalid excited choice' });
        }
        if (!['yes', 'maybe', 'no'].includes(speech)) {
          return jsonResponse(400, { error: 'Invalid speech choice' });
        }
        if (!['yes', 'definitely', 'obviously', 'other'].includes(gift)) {
          return jsonResponse(400, { error: 'Invalid gift choice' });
        }
        if (gift === 'other' && !String(giftOther || '').trim()) {
          return jsonResponse(400, { error: 'Gift detail required' });
        }
      }
    }

    const store = getStore(STORE_NAME);
    const key = `responses-${tier}`;
    const responses = await getResponses(tier);

    responses.push({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      tier,
      name,
      attending,
      side: tier === 'full' ? side : null,
      event: isAttending
        ? (tier === 'full' ? eventChoice : 'solemnization-only')
        : null,
      paxCount: isAttending ? paxCount : 0,
      dinner: isAttending && payload.dinner ? payload.dinner : null,
      submittedAt: new Date().toISOString()
    });

    await store.setJSON(key, responses);

    return jsonResponse(200, { ok: true, ...countResponses(responses) });
  }

  return jsonResponse(405, { error: 'Method not allowed' });
};
