const PDFDocument = require('pdfkit');
const { Client } = require('asana');

exports.handler = async function(event, context) {
  const PERSONAL_ACCESS_TOKEN = process.env.ASANA_PAT;       // ⚠️ Set in Netlify Environment Variables
  const PORTFOLIO_ID = process.env.PORTFOLIO_ID;            // ⚠️ Set in Netlify Environment Variables

  if (!PERSONAL_ACCESS_TOKEN || !PORTFOLIO_ID) {
    return {
      statusCode: 500,
      body: "Missing environment variables: ASANA_PAT or PORTFOLIO_ID"
    };
  }

  const client = Client.create().useAccessToken(PERSONAL_ACCESS_TOKEN);

  // Color mapping for segments
  const SEGMENT_COLORS = {
    'A': '#b6d7a8',
    'B': '#9fc5e8',
    'C': '#fff2cc',
    'D': '#f9cb9c',
    'Red Flag': '#ea9999'
  };

  let missingContacts = [];
  try {
    const portfolio = await client.portfolios.findById(PORTFOLIO_ID, { opt_fields: 'name,members' });
    const members = portfolio.members || [];

    for (const member of members) {
      const tasks = await client.tasks.findByAssignee(member.gid, { opt_fields: 'name,custom_fields' });
      for await (const task of tasks.data || []) {
        let segmentation = 'Unknown';
        let email = '';
        let phone = '';

        (task.custom_fields || []).forEach(field => {
          if (field.name === 'Lead Client Segmentation') segmentation = field.display_value || 'Unknown';
          if (field.name === 'HOH Email') email = field.display_value || '';
          if (field.name === 'Phone Number') phone = field.display_value || '';
        });

        if (!email || !phone) {
          missingContacts.push({
            name: task.name,
            segmentation,
            missing: `${!phone ? 'Phone ' : ''}${!email ? 'Email' : ''}`.trim()
          });
        }
      }
    }

    const order = ['A','B','C','D','Red Flag','Unknown'];
    missingContacts.sort((a,b) => order.indexOf(a.segmentation) - order.indexOf(b.segmentation));

  } catch (err) {
    return {
      statusCode: 500,
      body: "Error fetching clients: " + err.message
    };
  }

  // Generate PDF
  const doc = new PDFDocument({ margin: 30, size: 'A4' });
  let buffers = [];
  doc.on('data', buffers.push.bind(buffers));
  
  doc.fontSize(20).text('Clients Missing Contact Info', { align: 'center' });
  doc.moveDown();
  const tableTop = 100;
  const rowHeight = 25;
  let y = tableTop;

  doc.fontSize(12).fillColor('black');
  doc.text('Name', 50, y);
  doc.text('Segmentation', 250, y);
  doc.text('Missing', 400, y);
  y += rowHeight;

  missingContacts.forEach(client => {
    const color = SEGMENT_COLORS[client.segmentation] || '#cccccc';
    doc.rect(50, y - 5, 500, rowHeight).fillOpacity(0.2).fill(color).fillColor('black');

    doc.text(client.name, 50, y);
    doc.text(client.segmentation, 250, y);
    doc.text(client.missing, 400, y);
    y += rowHeight;
  });

  doc.end();

  const pdfBuffer = await new Promise((resolve, reject) => {
    const buf = [];
    doc.on('data', data => buf.push(data));
    doc.on('end', () => resolve(Buffer.concat(buf)));
    doc.on('error', err => reject(err));
  });

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=missing_clients.pdf'
    },
    body: pdfBuffer.toString('base64'),
    isBase64Encoded: true
  };
};
