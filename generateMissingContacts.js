// server.js
const express = require('express');
const fs = require('fs');
const PDFDocument = require('pdfkit');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// === CONFIG ===
const PERSONAL_ACCESS_TOKEN = '2/1211321500866440/1211524227973276:8259aa176edd98252c097aac13198dd9';
const PORTFOLIO_ID = '1211037518855167';

// === Endpoint to generate PDF ===
app.get('/generatePDF', async (req, res) => {
  try {
    // Fetch portfolio members
    const response = await axios.get(`https://app.asana.com/api/1.0/portfolios/${PORTFOLIO_ID}`, {
      headers: { Authorization: `Bearer ${PERSONAL_ACCESS_TOKEN}` },
      params: { opt_fields: 'members.name,members.email,members.custom_fields' }
    });

    const members = response.data.data.members || [];

    const processed = members.map(member => {
      const cf = member.custom_fields || [];
      const segmentation = cf.find(f => f.name === 'Lead Client Segmentation')?.text_value || 'Unknown';
      const phone = cf.find(f => f.name === 'Phone Number')?.text_value || '';
      const email = cf.find(f => f.name === 'HOH Email')?.text_value || member.email || '';
      return { name: member.name, segmentation, phone, email };
    });

    // Filter missing data
    const missingMembers = processed.filter(m => !m.phone || !m.email)
      .sort((a,b) => a.segmentation.localeCompare(b.segmentation));

    // Generate PDF
    const pdfPath = path.join(__dirname, 'MissingContacts.pdf');
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    doc.pipe(fs.createWriteStream(pdfPath));

    doc.fontSize(20).text('Missing Contacts Report', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text('Name', 50, 100);
    doc.text('Segmentation', 250, 100);
    doc.text('Missing', 400, 100);

    missingMembers.forEach((m, i) => {
      const y = 120 + i * 20;
      const missing = [];
      if (!m.phone) missing.push('Phone');
      if (!m.email) missing.push('Email');
      doc.text(m.name, 50, y);
      doc.text(m.segmentation, 250, y);
      doc.text(missing.join(', '), 400, y);
    });

    doc.end();

    // Wait a second for PDF to finish writing
    setTimeout(() => {
      res.download(pdfPath, 'MissingContacts.pdf');
    }, 1000);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).send('Error generating PDF');
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
