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

