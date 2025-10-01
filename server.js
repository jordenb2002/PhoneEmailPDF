const express = require('express');
const PDFDocument = require('pdfkit');
const { Client } = require('asana'); // Correct for Asana v3.x

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ Replace these in Render environment variables
const PERSONAL_ACCESS_TOKEN = process.env.ASANA_PAT;  // Your Asana Personal Access Token
const PORTFOLIO_ID = process.env.PORTFOLIO_ID;       // Your Asana Portfolio ID

if (!PERSONAL_ACCESS_TOKEN || !PORTFOLIO_ID) {
    console.error("Missing environment variables: ASANA_PAT or PORTFOLIO_ID");
    process.exit(1);
}

// Initialize Asana client
const client = Client.create().useAccessToken(PERSONAL_ACCESS_TOKEN);

// Colors for segments
const SEGMENT_COLORS = {
    'A': '#b6d7a8',
    'B': '#9fc5e8',
    'C': '#fff2cc',
    'D': '#f9cb9c',
    'Red Flag': '#ea9999'
};

// Fetch clients missing phone/email
async function fetchClientsMissingContacts() {
    try {
        const portfolio = await client.portfolios.findById(PORTFOLIO_ID, { opt_fields: 'name,members' });
        const members = portfolio.members || [];
        if (!members.length) return [];

        let missingContacts = [];

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

        return missingContacts;
    } catch (err) {
        console.error('Error fetching clients:', err);
        return [];
    }
}

// Generate PDF
function generatePDF(clients, res) {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=missing_clients.pdf');
    doc.pipe(res);

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

    clients.forEach(client => {
        const color = SEGMENT_COLORS[client.segmentation] || '#cccccc';
        doc.rect(50, y - 5, 500, rowHeight).fillOpacity(0.2).fill(color).fillColor('black');

        doc.text(client.name, 50, y);
        doc.text(client.segmentation, 25
