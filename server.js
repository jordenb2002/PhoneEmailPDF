const express = require('express');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const asana = require('asana');

const app = express();
const PORT = process.env.PORT || 3000;

// Use environment variables
const PERSONAL_ACCESS_TOKEN = process.env.ASANA_PAT;
const PORTFOLIO_ID = process.env.PORTFOLIO_ID;

const client = asana.Client.create().useAccessToken(PERSONAL_ACCESS_TOKEN);

// Segmentation colors
const SEGMENT_COLORS = {
    'A': '#b6d7a8',         // light green
    'B': '#9fc5e8',         // light blue
    'C': '#fff2cc',         // light yellow
    'D': '#f9cb9c',         // light orange
    'Red Flag': '#ea9999'   // light red
};

async function fetchClientsMissingContacts() {
    try {
        // Get all tasks in the portfolio
        const portfolio = await client.portfolios.getPortfolio(PORTFOLIO_ID, { opt_fields: 'name,members' });
        
        const members = portfolio.members || [];
        if (!members.length) return [];

        // Fetch tasks/clients for each member
        let missingContacts = [];

        for (const member of members) {
            const tasks = await client.tasks.findAll({ assignee: member.gid, opt_fields: 'name,custom_fields' });
            
            for await (const task of tasks) {
                let segmentation = 'Unknown';
                let email = '';
                let phone = '';

                task.custom_fields.forEach(field => {
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

        // Sort by segmentation
        const order = ['A','B','C','D','Red Flag','Unknown'];
        missingContacts.sort((a,b) => order.indexOf(a.segmentation) - order.indexOf(b.segmentation));

        return missingContacts;
    } catch (err) {
        console.error('Error fetching clients:', err);
        return [];
    }
}

function generatePDF(clients, res) {
    const doc = new PDFDocument({ margin: 30, size: 'A4' });
    
    // Pipe PDF to response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=missing_clients.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Clients Missing Contact Info', { align: 'center' });
    doc.moveDown();

    const tableTop = 100;
    const rowHeight = 25;
    let y = tableTop;

    // Table headers
    doc.fontSize(12).fillColor('black');
    doc.text('Name', 50, y);
    doc.text('Segmentation', 250, y);
    doc.text('Missing', 400, y);
    y += rowHeight;

    clients.forEach(client => {
        // Background color for segmentation
        const color = SEGMENT_COLORS[client.segmentation] || '#cccccc';
        doc.rect(50, y - 5, 500, rowHeight).fillOpacity(0.2).fill(color).fillColor('black');

        doc.text(client.name, 50, y);
        doc.text(client.segmentation, 250, y);
        doc.text(client.missing, 400, y);
        y += rowHeight;
    });

    doc.end();
}

app.get('/generatePDF', async (req, res) => {
    const clients = await fetchClientsMissingContacts();
    if (!clients.length) {
        return res.send('No clients missing phone or email found.');
    }
    generatePDF(clients, res);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
