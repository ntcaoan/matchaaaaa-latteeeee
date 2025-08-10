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
async function sendRestockNotification() {
    try {
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (!channel) {
            console.error('No channel found.');
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

        console.log('restock notification sent!');
    } catch (error) {
        console.error('error sending notification:', error);
    }
}

// bot commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content === '!check') {
        await message.reply('🔍 checking stock status...');
        const stockStatus = await checkStock();

        if (stockStatus === null) {
            await message.reply('❌ unable to check stock (website error)');
        } else if (stockStatus) {
            await message.reply('✅ Sayaka Matcha (40g) is currently **IN STOCK**!');
        } else {
            await message.reply('❌ Sayaka Matcha (40g) is currently **OUT OF STOCK**');
        }
    }

    if (content === '!status') {
        const embed = {
            title: '🤖 Bot Status',
            color: 0x2196F3,
            fields: [
                {
                    name: '⏰ Last Check',
                    value: lastCheckTime ? lastCheckTime.toLocaleString() : 'not checked yet',
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

        await message.reply({embeds: [embed]});
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

        await message.reply({embeds: [helpEmbed]});
    }
});

// bot ready event