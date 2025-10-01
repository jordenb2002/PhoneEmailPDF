// server.js
const express = require('express');
const PDFDocument = require('pdfkit');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
const PERSONAL_ACCESS_TOKEN = '2/1211321500866440/1211524227973276:8259aa176edd98252c097aac13198dd9';
const PORTFOLIO_ID = '1211037518855167';

// Helper to fetch all projects in portfolio
async function fetchProjects() {
  const response = await axios.get(`https://app.asana.com/api/1.0/portfolios/${PORTFOLIO_ID}/projects`, {
    headers: { Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}` }
  });
  return response.data.data; // array of projects
}

// Helper to fetch tasks in a project
async function fetchTasks(projectId) {
  const response = await axios.get(`https://app.asana.com/api/1.0/projects/${projectId}/tasks`, {
    headers: { Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}` },
    params: { opt_fields: 'name,custom_fields' }
  });
  return response.data.data; // array of tasks
}

// Helper to get client info from a task
function extractClientInfo(task) {
  const cf = task.custom_fields || [];
  const segmentation = cf.find(f => f.name === 'Lead Client Segmentation')?.text_value || 'Unknown';
  const phone = cf.find(f => f.name === 'Phone Number')?.text_value || '';
  const email = cf.find(f => f.name === 'HOH Email')?.text_value || '';
  return {
    name: task.name,
    segmentation,
    phone,
    email
  };
}

// === Endpoint to generate PDF ===
app.get('/generatePDF', async (req, res) => {
  try {
    const projects = await fetchProjects();
    let clients = [];

    for (const project of projects) {
      const tasks = await fetchTasks(project.gid);
      const clientData = tasks.map(extractClientInfo);
      clients = clients.concat(clientData);
    }

    // Filter missing phone/email and sort by segmentation
    const missingClients = clients
      .filter(c => !c.phone || !c.email)
      .sort((a, b) => a.segmentation.localeCompare(b.segmentation));

    // === Generate PDF ===
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    let buffers = [];
    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => {
      const pdfData = Buffer.concat(buffers);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=MissingClients.pdf',
        'Content-Length': pdfData.length
      });
      res.end(pdfData);
    });

    // Title
    doc.fontSize(22).fillColor('#333').text('Missing Clients Report', { align: 'center' });
    doc.moveDown();

    // Table headers
    const tableTop = 100;
    const rowHeight = 25;
    let y = tableTop;

    const headers = ['Name', 'Segmentation', 'Missing'];
    const columnWidths = [250, 100, 150];
    const colors = { header: '#4b8bf5', row1: '#e6f0ff', row2: '#ffffff' };

    // Draw header background
    doc.rect(50, y, columnWidths.reduce((a,b)=>a+b,0), rowHeight).fill(colors.header);
    doc.fillColor('#ffffff').fontSize(12);
    let x = 50;
    headers.forEach((header, i) => {
      doc.text(header, x + 5, y + 7, { width: columnWidths[i] - 10, align: 'left' });
      x += columnWidths[i];
    });
    y += rowHeight;

    // Draw rows
    missingClients.forEach((client, idx) => {
      const fillColor = idx % 2 === 0 ? colors.row1 : colors.row2;
      doc.rect(50, y, columnWidths.reduce((a,b)=>a+b,0), rowHeight).fill(fillColor);
      doc.fillColor('#000000');

      const missing = [];
      if (!client.phone) missing.push('Phone');
      if (!client.email) missing.push('Email');

      x = 50;
      [client.name, client.segmentation, missing.join(', ')].forEach((text, i) => {
        doc.text(text, x + 5, y + 7, { width: columnWidths[i] - 10, align: 'left' });
        x += columnWidths[i];
      });
      y += rowHeight;

      // Add page if necessary
      if (y + rowHeight > doc.page.height - 50) {
        doc.addPage();
        y = 50;
      }
    });

    doc.end();

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error generating PDF');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
