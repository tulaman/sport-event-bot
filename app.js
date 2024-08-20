require('dotenv').config()
const config = require('./config')
const { Telegraf, Markup } = require('telegraf')
const { message } = require('telegraf/filters')
const { db, loadSessionFromDatabase, saveSessionToDatabase, Event, User } = require('./db')
const { formatDate } = require('./utils')
const mustache = require('mustache')
const sequelize = require('sequelize')
const Op = sequelize.Op

const bot = new Telegraf(process.env.TG_TOKEN)

// Middleware to catch errors
bot.catch((err, ctx) => {
    console.error(`❌ Error occured for ${ctx.updateType}`, err)
    if (err.code === 403 && err.description === 'Forbidden: bot was blocked by the user') {
        console.log(`🚫 bot was blocked by the user: ${ctx.chat.id}`)
        removeUser(ctx.chat.id)
    }
})

bot.use(async (ctx, next) => {
    const userId = ctx.from && ctx.from.id + ''
    let user
    if (userId) {
        ctx.session = await loadSessionFromDatabase(userId)
        user = await User.findOne({ where: { telegram_id: userId } })
        ctx.user = user
    }

    await next()
    // This next line will only run after all other middlewares and handlers are done

    await saveSessionToDatabase(userId, ctx.session);
})

// Start command
bot.start(async (ctx) => {
    const userId = `${ctx.from.id}`
    ctx.user = await User.findOrCreate({
        where: { telegram_id: userId },
        defaults: { telegram_id: userId, name: ctx.from.username }
    })
    ctx.reply(config.messages.start)
})

// Help command
bot.command('help', (ctx) => {
    ctx.reply(config.messages.start)
})

// Commands to interact with the bot
// - Create a new run
bot.command('create', (ctx) => {
    ctx.session.state = 'choose_date'
    ctx.session.new_event = { author_id: ctx.user.id }
    ctx.reply(config.messages.choose_date)
})

// - Find runs for today, this week, this month
bot.command('find', async (ctx) => {
    const events = await Event.findAll({
        include: { model: User, as: 'author' },
        where: {
            author_id: { [Op.ne]: ctx.user.id }
        }
    })
    if (events.length === 0) {
        ctx.reply(config.messages.no_new_events)
    }
    else {
        for (let event of events) {
            const buttons = []
            if (false) {
                buttons.push(
                    [Markup.button.callback('Опубликовать', 'publish')],
                )
            }
            else {
                buttons.push(
                    Markup.button.callback('Присоединиться', 'join'),
                )
            }
            const keyboard = Markup.inlineKeyboard(
                buttons
            )
            const message = mustache.render(config.messages.event_info, {
                title: formatDate(event.date),
                event: event,
                user: ctx.user
            })
            ctx.replyWithHTML(message, keyboard)
        }
    }
})

// - List all runs created by me or runs I have joined
bot.command('my_events', async (ctx) => {
    const events = await Event.findAll({
        include: { model: User, as: 'author' },
        where: { author_id: ctx.user.id }
    })
    if (events.length === 0) {
        ctx.reply(config.messages.no_events)
    }
    else {
        for (let event of events) {
            const buttons = []
            if (event.author.id == ctx.user.id) {
                buttons.push(
                    [Markup.button.callback('Редактировать', 'edit')],
                    [Markup.button.callback('Удалить', 'delete')],
                    [Markup.button.callback('Опубликовать', 'publish')],
                )
            }
            else {
                buttons.push(
                    Markup.button.callback('Отказаться', 'unjoin'),
                )
            }
            const keyboard = Markup.inlineKeyboard(
                buttons
            )
            const message = mustache.render(config.messages.event_info, {
                title: formatDate(event.date),
                event: event,
                user: ctx.user
            })
            ctx.replyWithHTML(message, keyboard)
        }
    }
})

// Handler on any text from user
bot.on(message('text'), async (ctx) => {

    // Validation functions
    const validate_date = (date) => {
        const date_regex = /^\d{4}-\d{2}-\d{2}$/
        return date_regex.test(date)
    }

    const validate_time = (time) => {
        const time_regex = /^\d{2}:\d{2}$/
        return time_regex.test(time)
    }

    const save_event = async (ctx) => {
        // Save the event to the database
        const event = new Event(ctx.session.new_event)
        await event.save()
    }

    // Dispatch object (all logic here)
    const dispatch = {
        'choose_date': {
            next: 'choose_time',
            message: config.messages.choose_time,
            attr: 'date',
            validation: validate_date
        },
        'choose_time': {
            next: 'choose_type',
            message: config.messages.choose_type,
            attr: 'time',
            validation: validate_time
        },
        'choose_type': {
            next: 'choose_location',
            attr: 'type',
            message: config.messages.choose_location
        },
        'choose_location': {
            next: 'choose_distance',
            attr: 'location',
            message: config.messages.choose_distance
        },
        'choose_distance': {
            next: 'choose_pace',
            attr: 'distance',
            message: config.messages.choose_pace
        },
        'choose_pace': {
            next: 'enter_additional_info',
            attr: 'pace',
            message: config.messages.enter_additional_info
        },
        'enter_additional_info': {
            next: '',
            attr: 'additional_info',
            message: config.messages.event_created,
            action: save_event
        },
    }

    const state = ctx.session.state
    if (state in dispatch) {
        const mode = dispatch[state]
        if (mode.validation &&
            !mode.validation(ctx.message.text)) {
            await ctx.reply(config.messages.invalid_input)
            return
        }

        if (mode.action) {
            await mode.action(ctx)
        }

        ctx.session.new_event[mode.attr] = ctx.message.text
        ctx.session.state = mode.next

        await ctx.reply(mode.message)
    }
    else {
        ctx.reply(config.messages.unknown_command)
    }
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))

