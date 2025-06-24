require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const Database = require('./database');
const RankingSystem = require('./rankingSystem');

if (!process.env.DISCORD_TOKEN) {
    console.error('Brak tokenu');
    process.exit(1);
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const database = new Database();
const rankingSystem = new RankingSystem(client, database);

client.once('ready', async () => {
    console.log(`🤖 Bot ${client.user.tag} jest online!`);
    console.log(`📊 Serwery: ${client.guilds.cache.size}`);

    client.user.setActivity('wiadomości użytkowników', { 
        type: ActivityType.Watching 
    });

    if (process.env.GUILD_ID) {
        try {
            const guild = await client.guilds.fetch(process.env.GUILD_ID);
            console.log(`Połączono z serwerem: ${guild.name}`);

            setTimeout(async () => {
                console.log('Wykonuję początkową aktualizację rang...');
                await rankingSystem.updateRankings(guild);
            }, 3000);
            
        } catch (error) {
            console.error('Błąd podczas łączenia z serwerem:', error.message);
        }
    }
});

client.on('messageCreate', async (message) => {
    try {
        await rankingSystem.handleMessage(message);
    } catch (error) {
        console.error('Błąd podczas obsługi wiadomości:', error);
    }
});

client.on('guildCreate', async (guild) => {
    console.log(`Dołączyłem do nowego serwera: ${guild.name} (${guild.memberCount} członków)`);

    setTimeout(async () => {
        await rankingSystem.updateRankings(guild);
    }, 5000);
});

client.on('error', (error) => {
    console.error('Discord.js błąd:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Nieobsłużony błąd:', error);
});

process.on('SIGINT', () => {
    console.log('\nZamykam bota...');
    database.close();
    client.destroy();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\nOtrzymano SIGTERM, zamykam bota...');
    database.close();
    client.destroy();
    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Nie udało się zalogować bota:', error.message);
    process.exit(1);
});