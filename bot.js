require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const axios = require('axios');
const cheerio = require('cheerio');
const cron = require('node-cron');
const fs = require('fs');

// Bot setup
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// Configuration
const productsJsonFile = 'products.json';
const BASE_URL = 'https://ippodotea.com/collections/matcha/products/';
const PRODUCTS = {
    "Ummon - 20g": "ummon-no-mukashi-20g",
    "Ummon - 40g": "ummon-no-mukashi-40g",
    "Sayaka - 40g": "sayaka-no-mukashi",
    "Sayaka - 100g": "sayaka-100g",
    "Horai - 20g": "horai-no-mukashi",
    "Kan - 30g": "kan",
    "Ikuyo - 30g": "ikuyo",
    "Ikuyo - 100g": "ikuyo-100",
    "Wakaki - 40g": "wakaki-shiro",
    "Matcha To-Go Packets - 10 x 2g": "matcha-to-go-packets",
    "Uji-Shimizu - 12 Sticks": "uji-shimizu-sticks",
    "Uji-Shimizu - 400g Bag": "uji-shimizu",
}
const CHANNEL_ID = process.env.CHANNEL_ID;
const CHECK_INTERVAL = '*/10 * * * *'; // Every 10 minutes
let lastCheckTime = null;


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function checkStock() {
  console.log(`[${new Date().toISOString()}] Checking stock...`);

  // Read and parse JSON properly
  const productsJson = JSON.parse(fs.readFileSync(productsJsonFile, 'utf-8'));

  for (const key of Object.keys(productsJson)) {
    // Only check products that are active
    if (!productsJson[key].active) {
      continue;
    }

    try {
      console.log("Checking ", key);

      const response = await axios.get(BASE_URL + productsJson[key]["url"], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);

      const previouslyInStock = productsJson[key]["inStock"];
      let currentlyInStock;

      const element = $('.product-addbtn');

      if (element.length > 0 && element.text().toLowerCase().includes('sold out')) {
        currentlyInStock = false;
      } else {
        currentlyInStock = true;
      }

      productsJson[key]["inStock"] = currentlyInStock;

      lastCheckTime = new Date();
      console.log(`Stock status: ${currentlyInStock ? 'IN STOCK' : 'OUT OF STOCK'}`);

      if (previouslyInStock !== currentlyInStock) {
        await sendStatusChangeNotification(key, productsJson[key]['url'], currentlyInStock);
      }
      
      // Wait 30 seconds before next request
      await sleep(30000);

    } catch (error) {
      console.error('Error checking stock:', error.message);

      const channel = client.channels.cache.get(CHANNEL_ID);
      if (channel) {
        channel.send(`⚠️ Error checking ${key} Matcha stock: ${error.message}`);
      }
    }
  }

  // Save updated JSON
  fs.writeFileSync(productsJsonFile, JSON.stringify(productsJson, null, 2));
}


// Function to send stock change notification
async function sendStatusChangeNotification(productName, productURL, currentStockStatus) {
    try {
        const channel = client.channels.cache.get(CHANNEL_ID);
        if (!channel) {
            console.error('Channel not found!');
            return;
        }

        const embed = {
            title: '🍃 MATCHA STATUS ALERT! 🍃',
            description: `** ${productName} is now ${currentStockStatus ? 'back in stock!' : 'out of stock!'}**`,
            color: 0x4CAF50, // Green color
            fields: [
                {
                    name: '🛒 Product',
                    value: productName,
                    inline: false
                },
            ],
            footer: {
                text: 'Act fast - this matcha sells out quickly!'
            },
            timestamp: new Date().toISOString()
        };
        if (currentStockStatus) {
            embed.fields.push(
                {
                    name: '🔗 Link',
                    value: `[Buy Now!](${BASE_URL + productURL})`,
                    inline: true
                },
                {
                    name: '⏰ Detected At',
                    value: new Date().toLocaleString(),
                    inline: true
                })
        }


        await channel.send({
            content: '@everyone **OMGOMGOMGOMG OMG OH EM GEEE**',
            embeds: [embed]
        });

        console.log('Restock notification sent!');

    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

function createProductsFile() {
    const fileContents = {};
    Object.keys(PRODUCTS).forEach(key => {
        fileContents[key] = {url: PRODUCTS[key], inStock: false, active: true}
    });
    fs.writeFileSync(productsJsonFile, JSON.stringify(fileContents, null, 2));
}

// Bot commands
client.on('messageCreate', async (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase();

    if (content === '!check') {
        message.reply('🔍 Checking stock status for tracked products...');
        await checkStock();
        message.reply('✅ Stock check complete.');
    }

    if (content === '!status') {
        const productsJson = JSON.parse(fs.readFileSync(productsJsonFile, 'utf-8'));
        const trackedProducts = Object.keys(productsJson).filter(key => productsJson[key].active);

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
                    name: '🔄 Check Frequency',
                    value: 'Every 10 minutes',
                    inline: true
                },
                {
                    name: '🍵 Tracking',
                    value: `${trackedProducts.length} products`,
                    inline: true
                },
                {
                    name: '📋 Currently Tracked Products',
                    value: trackedProducts.length > 0 ? trackedProducts.join('\n') : 'None',
                    inline: false
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
                    value: 'Manually check current stock status for all tracked products.',
                    inline: false
                },
                {
                    name: '!status',
                    value: 'Show bot status, last check time, and a list of currently tracked products.',
                    inline: false
                },
                {
                    name: '!track',
                    value: 'Brings up a menu to choose which products to track for restocks.',
                    inline: false
                },
                {
                    name: '!help',
                    value: 'Show this help message.',
                    inline: false
                }
            ],
            footer: {
                text: 'The bot automatically checks every 5 minutes and will notify when restocked!'
            }
        };

        message.reply({ embeds: [helpEmbed] });
    }
    
    // New command to bring up the tracking interface
    if (content === '!track') {
        const productsJson = JSON.parse(fs.readFileSync(productsJsonFile, 'utf-8'));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('track_selection')
            .setPlaceholder('Select products to track')
            .setMinValues(0)
            .setMaxValues(Object.keys(PRODUCTS).length)
            .addOptions(Object.keys(PRODUCTS).map(productName =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(productName)
                    .setValue(productName)
                    // Set as default if currently active
                    .setDefault(productsJson[productName] ? productsJson[productName].active : false)
            ));

        const actionRow = new ActionRowBuilder().addComponents(selectMenu);

        await message.reply({
            content: 'Select the matcha products you want to track. Any products you unselect will no longer be tracked.',
            components: [actionRow]
        });
    }
});

// Handle interactions (like the select menu)
client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu()) return;

    if (interaction.customId === 'track_selection') {
        const selectedProducts = interaction.values;
        const productsJson = JSON.parse(fs.readFileSync(productsJsonFile, 'utf-8'));

        // Update the active status for all products
        for (const productName in productsJson) {
            if (selectedProducts.includes(productName)) {
                // If the product was previously inactive, reset the inStock status
                if (!productsJson[productName].active) {
                    productsJson[productName].inStock = false;
                }
                productsJson[productName].active = true;
            } else {
                productsJson[productName].active = false;
            }
        }

        fs.writeFileSync(productsJsonFile, JSON.stringify(productsJson, null, 2));

        await interaction.update({
            content: `✅ Tracking settings updated! Now tracking ${selectedProducts.length} products.`,
            components: []
        });
    }
});


// Bot ready event
client.once('ready', () => {
    console.log(`✅ Bot logged in as ${client.user.tag}!`);
    console.log(`📢 Notifications channel: ${CHANNEL_ID}`);


    // check if products.json exists, if not, create it.
    try {
        fs.accessSync(productsJsonFile,fs.constants.R_OK);
        console.log('products file exists');
    } catch {
        console.log('products file does not exist');
        createProductsFile()
    }
 

    // Send startup message
    const channel = client.channels.cache.get(CHANNEL_ID);
    if (channel) {
        channel.send('🤖 Matcha Restock Bot is now online! I will check for stock changes every 5 minutes.');
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