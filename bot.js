require('dotenv').config();
const {Client, GatewayIntentBits} = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

// setup bot
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Configuration
const PRODUCT_URL = 'https://ippodotea.com/products/sayaka-no-mukashi';
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHECK_INTERVAL = '*/5 * * * *'; // Every 5 minutes

// track previous stock status
let wasInStock = false;
let lastCheckTime = null;

// function to check if product is in stock
async function checkStock() {
    try {
        console.log(`[${new Date().toISOString()}] checking stock...`);

        const response = await axios.get(PRODUCT_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // look for common out-of-stock indicators
        const soldOutSelectors = [
            '.sold-out',
            '.out-of-stock',
            '[disabled]',
            'button:contains("Sold Out")',
            'button:contains("Out of Stock")',
            '.btn:contains("Sold Out")',
            '.product-form__cart-submit[disabled]'
        ];

        let isOutOfStock = false;

        //check each selector
        soldOutSelectors.forEach(selector => {
            if ($(selector).length > 0) {
                isOutOfStock = true;
            }
        });

        // also check button text context
        const addToCartButton = $('button[type="submit"]').first();
        const buttonText = addToCartButton.text().toLowerCase();

        if (buttonText.includes('sold out') || buttonText.includes('out of stock') || buttonText.includes('unavailable')) {
            isOutOfStock = true;
        }

        const isInStock = !isOutOfStock;
        lastCheckTime = new Date();

        console.log(`Stock status: ${isInStock ? 'IN STOCK' : 'OUT OF STOCK'}`);

        // send notification if status changes to in stock
        if (isInStock && !wasInStock) {
            await sendRestockNotification();
        }

        wasInStock = isInStock;
        return isInStock;
    } catch (error) {
        console.error('error checking stock: ', error.message);

        // send error notification to Discord
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (channel) {
            await channel.send(`⚠️ Error checking Sayaka Matcha stock: ${error.message}`);
        }

        return null;
    }
}

// function to send restock notification