const express = require('express');
const PDFDocument = require('pdfkit');
const asana = require('asana');

const app = express();
const PORT = process.env.PORT || 3000;

const PERSONAL_ACCESS_TOKEN = process.env.ASANA_PAT;
const PORTFOLIO_ID = process.env.PORTFOLIO_ID;

if (!PERSONAL_ACCESS_TOKEN || !PORTFOLIO_ID) {
    console.error("Missing environment variables: ASANA_PAT or PORTFOLIO_ID");
    process.exit(1);
}

// Initialize Asana client
const client = asana.Client.create().useAccessToken(PERSONAL_ACCESS_TOKEN);

// Fetch tasks for portfolio members
async function fetchClientsMissingContacts() {
    try {
        const portfolio = await client.portfolios.findById(PORTFOLIO_ID);
        const members = portfolio.data.members || [];
        if (!members.length) return [];

        let missingContacts = [];

        for (const member of members) {
            const tasks = await client.tasks.findByAssignee(member.gid);
            for (const task of tasks.data) {
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
        doc.text(client.segmentation, 250, y);
        doc.text(client.missing, 400, y);
        y += rowHeight;
    });

    doc.end();
}

// Endpoint
app.get('/generatePDF', async (req, res) => {
    const clients = await fetchClientsMissingContacts();
    if (!clients.length) return res.send('No clients missing phone or email found.');
    generatePDF(clients, res);
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
