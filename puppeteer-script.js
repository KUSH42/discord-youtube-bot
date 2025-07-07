const puppeteer = require('puppeteer');
const express = require('express');

const app = express();
const port = 3013; // Or any other port you want your API to listen on

let browser; // Declare browser globally or in a scope accessible by API routes
let page;    // Declare page globally for reuse, or create new pages per request

app.use(express.json()); // For parsing JSON request bodies

// Initialize browser once when the server starts
async function initializeBrowser() {
    try {
        browser = await puppeteer.launch({
            headless: true, // or 'new'
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--no-first-run',
                '--no-default-browser-check'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
        });
        console.log('Puppeteer browser launched.');
        // You might create an initial page here or on demand per request
        // page = await browser.newPage();
        // console.log('Initial page created.');

        // Log the WS endpoint if you still want it for debugging (though your scraper won't connect directly)
        console.log(`Puppeteer browser WebSocket endpoint (for internal debugging): ${browser.wsEndpoint()}`);

    } catch (error) {
        console.error('Failed to launch Puppeteer browser:', error);
        process.exit(1); // Exit if browser fails to launch
    }
}

// Example API endpoint to perform a screenshot
app.post('/screenshot', async (req, res) => {
    const { url, path } = req.body;
    if (!url || !path) {
        return res.status(400).send('URL and path are required.');
    }

    try {
        if (!browser) {
            return res.status(503).send('Browser not initialized.');
        }
        const newPage = await browser.newPage(); // Create a new page for each request
        await newPage.goto(url);
        await newPage.screenshot({ path });
        await newPage.close(); // Close the page after use
        res.status(200).send(`Screenshot of ${url} saved to ${path}`);
    } catch (error) {
        console.error('Error taking screenshot:', error);
        res.status(500).send(`Error taking screenshot: ${error.message}`);
    }
});

// Example API endpoint to get page content
app.post('/get-content', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).send('URL is required.');
    }

    try {
        if (!browser) {
            return res.status(503).send('Browser not initialized.');
        }
        const newPage = await browser.newPage();
        await newPage.goto(url, { waitUntil: 'domcontentloaded' });
        const content = await newPage.content();
        await newPage.close();
        res.status(200).json({ url, content });
    } catch (error) {
        console.error('Error getting content:', error);
        res.status(500).send(`Error getting content: ${error.message}`);
    }
});

// Start the server and initialize Puppeteer
app.listen(port, async () => {
    console.log(`Puppeteer API server listening on port ${port}`);
    await initializeBrowser();
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Closing browser...');
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});