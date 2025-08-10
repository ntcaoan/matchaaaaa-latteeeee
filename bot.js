require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');

// Bot setup
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Configuration
const PRODUCT_URL = 'https://ippodotea.com/products/sayaka-no-mukashi';
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHECK_INTERVAL = '*/5 * * * *'; // Every 5 minutes

// Track previous stock status
let wasInStock = false;
let lastCheckTime = null;

// Function to check if product is in stock
async function checkStock() {
    try {
        console.log(`[${new Date().toISOString()}] Checking stock...`);

        const response = await axios.get(PRODUCT_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Look for out-of-stock indicators specific to Ippodo
        let isOutOfStock = false;

        // Check for email notification form (indicates out of stock)
        const emailNotifyText = $('body').text();
        if (emailNotifyText.includes('Enter your email address below to be notified when we have this item in stock') ||
            emailNotifyText.includes('You will receive an email as soon as') ||
            emailNotifyText.includes('back in stock')) {
            isOutOfStock = true;
            console.log('Detected: Email notification form present');
        }

        // Check for common sold out indicators
        const soldOutSelectors = [
            '.sold-out',
            '.out-of-stock',
            '[disabled]',
            'button:contains("Sold Out")',
            'button:contains("Out of Stock")',
            '.btn:contains("Sold Out")',
            '.product-form__cart-submit[disabled]'
        ];

        soldOutSelectors.forEach(selector => {
            if ($(selector).length > 0) {
                isOutOfStock = true;
                console.log(`Detected sold out via selector: ${selector}`);
            }
        });

        // Check button text content
        const addToCartButton = $('button[type="submit"]').first();
        const buttonText = addToCartButton.text().toLowerCase();

        if (buttonText.includes('sold out') || buttonText.includes('out of stock') || buttonText.includes('unavailable')) {
            isOutOfStock = true;
            console.log(`Detected sold out via button text: ${buttonText}`);
        }

        // Additional check for "Sold out" text anywhere on page
        if (emailNotifyText.toLowerCase().includes('sold out')) {
            isOutOfStock = true;
            console.log('Detected: "Sold out" text found on page');
        }

        const isInStock = !isOutOfStock;
        lastCheckTime = new Date();

        console.log(`Stock status: ${isInStock ? 'IN STOCK' : 'OUT OF STOCK'}`);

        // Send notification if status changed to in stock
        if (isInStock && !wasInStock) {
            await sendRestockNotification();
        }

        wasInStock = isInStock;
        return isInStock;

    } catch (error) {
        console.error('Error checking stock:', error.message);

        // Send error notification to Discord
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (channel) {
            channel.send(`⚠️ Error checking Sayaka Matcha stock: ${error.message}`);
        }

        return null;
    }
}

// Function to send restock notification
async function sendRestockNotification() {
    try {
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (!channel) {
            console.error('Channel not found!');
            return;
        }

        const embed = {
            title: '🍃 MATCHA RESTOCK ALERT! 🍃',
            description: '**Ippodo Tea - Sayaka Matcha (40g) is back in stock!**',
            color: 0x4CAF50, // Green color
            fields: [
                {
                    name: '🛒 Product',
                    value: 'Sayaka Matcha (40g) - For Usucha, Koicha and Lattes',
                    inline: false
                },
                {
                    name: '🔗 Link',
                    value: `[Buy Now!](${PRODUCT_URL})`,
                    inline: true
                },
                {
                    name: '⏰ Detected At',
                    value: new Date().toLocaleString(),
                    inline: true
                }
            ],
            footer: {
                text: 'Act fast - this matcha sells out quickly!'
            },
            timestamp: new Date().toISOString()
        };

        await channel.send({
            content: '@everyone **SAYAKA MATCHA IS BACK IN STOCK!**',
            embeds: [embed]
        });

        console.log('Restock notification sent!');

    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// Bot commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content === '!check') {
        message.reply('🔍 Checking stock status...');
        const stockStatus = await checkStock();

        if (stockStatus === null) {
            message.reply('❌ Unable to check stock (website error)');
        } else if (stockStatus) {
            message.reply('✅ Sayaka Matcha (40g) is currently **IN STOCK**!');
        } else {
            message.reply('❌ Sayaka Matcha (40g) is currently **OUT OF STOCK**');
        }
    }

    if (content === '!status') {
        const embed = {
            title: '🤖 Bot Status',
            color: 0x2196F3,
            fields: [
                {
                    name: '⏰ Last Check',
                    value: lastCheckTime ? lastCheckTime.toLocaleString() : 'Not checked yet',
                    inline: true
                },
                {
                    name: '📊 Current Status',
                    value: wasInStock ? '✅ In Stock' : '❌ Out of Stock',
                    inline: true
                },
                {
                    name: '🔄 Check Frequency',
                    value: 'Every 5 minutes',
                    inline: true
                }
            ]
        };

        message.reply({ embeds: [embed] });
    }

    if (content === '!help') {
        const helpEmbed = {
            title: '🍃 Matcha Restock Bot Commands',
            color: 0x4CAF50,
            fields: [
                {
                    name: '!check',
                    value: 'Manually check current stock status',
                    inline: false
                },
                {
                    name: '!status',
                    value: 'Show bot status and last check time',
                    inline: false
                },
                {
                    name: '!help',
                    value: 'Show this help message',
                    inline: false
                }
            ],
            footer: {
                text: 'The bot automatically checks every 5 minutes and will notify when restocked!'
            }
        };

        message.reply({ embeds: [helpEmbed] });
    }
});

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}!`);
    console.log(`🎯 Monitoring: ${PRODUCT_URL}`);
    console.log(`📢 Notifications channel: ${CHANNEL_ID}`);

    // Send startup message
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (channel) {
        channel.send('🤖 Matcha Restock Bot is now online! Monitoring Sayaka Matcha (40g) every 5 minutes.');
    }

    // Start monitoring
    startMonitoring();
});

// Start the monitoring cron job
function startMonitoring() {
    console.log('🔄 Starting stock monitoring...');

    // Check immediately on startup
    setTimeout(checkStock, 5000);

    // Schedule regular checks
    cron.schedule(CHECK_INTERVAL, () => {
        checkStock();
    });
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Login bot
client.login(process.env.DISCORD_TOKEN);