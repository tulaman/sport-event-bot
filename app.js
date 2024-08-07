require('dotenv').config()
const config = require('./config')
const { Telegraf, Markup } = require('telegraf')

const bot = new Telegraf(process.env.TG_TOKEN)

// Middleware to catch errors
bot.catch((err, ctx) => {
    console.error(`❌ Error occured for ${ctx.updateType}`, err)
    if (err.code === 403 && err.description === 'Forbidden: bot was blocked by the user') {
        console.log(`🚫 bot was blocked by the user: ${ctx.chat.id}`)
        removeUser(ctx.chat.id)
    }
})

// Start command
bot.start((ctx) => {
    ctx.reply(config.messages.start)
})

// Help command
bot.command('help', (ctx) => {
    ctx.reply('Help message')
})

// Commands to interact with the bot
// - Create a new run
bot.command('create', (ctx) => {
    ctx.reply(config.messages.choose_date)
})

// - Find runs for today, this week, this month
bot.command('find', (ctx) => {
    ctx.reply('Finding runs')
})

// - List all runs created by me or runs I have joined
bot.command('my_runs', (ctx) => {
    ctx.reply('Your runs')
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))