const express = require('express');
const https = require('https');

const router = express.Router();

/**
 * Make an authenticated request to the HubSpot API
 */
function hubspotPost(path, body) {
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    return Promise.reject(new Error('HUBSPOT_ACCESS_TOKEN is not configured in server/.env'));
  }

  const bodyStr = JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.hubapi.com',
      path,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error('Invalid JSON response from HubSpot'));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

/**
 * GET /api/hubspot/search?q=company+name
 * Search HubSpot companies by name and return fields
 * mapped to the Create Communities template structure.
 */
router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({ error: 'Query parameter "q" is required' });
    }

    if (!process.env.HUBSPOT_ACCESS_TOKEN) {
      return res.status(503).json({
        error: 'HubSpot is not configured. Add HUBSPOT_ACCESS_TOKEN to server/.env'
      });
    }

    const searchBody = {
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'name',
              operator: 'CONTAINS_TOKEN',
              value: q.trim()
            }
          ]
        }
      ],
      properties: ['name', 'address', 'city', 'state', 'zip', 'website', 'total_capacity'],
      limit: 8,
      sorts: [{ propertyName: 'name', direction: 'ASCENDING' }]
    };

    const { status, body } = await hubspotPost(
      '/crm/v3/objects/companies/search',
      searchBody
    );

    if (status !== 200) {
      console.error('[HubSpot] Search failed:', status, body);
      return res.status(status).json({
        error: body.message || `HubSpot returned status ${status}`
      });
    }

    // Map HubSpot company properties → Create Communities template fields
    const companies = (body.results || []).map((record) => {
      const p = record.properties || {};
      return {
        hubspotId: record.id,
        name: p.name || '',
        street: p.address || '',
        city: p.city || '',
        state: p.state || '',
        zip: p.zip || '',
        companyUrl: p.website || '',
        capacity: p.total_capacity || ''
      };
    });

    res.json({ companies, total: body.total || companies.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
