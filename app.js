require('@dotenvx/dotenvx').config()
const config = require('./config')
const { Telegraf, Markup } = require('telegraf')
const express = require('express')
const { message } = require('telegraf/filters')
const { db, loadSessionFromDatabase, saveSessionToDatabase, Event, User } = require('./db')
const { formatDate } = require('./utils')
const mustache = require('mustache')
const sequelize = require('sequelize')
const Op = sequelize.Op
const Calendar = require('telegram-inline-calendar')

const bot = new Telegraf(process.env.TG_TOKEN)
const calendar = new Calendar(bot, {
    date_format: 'YYYY-MM-DD',
    language: 'ru',
    bot_api: 'telegraf',
    start_week_day: 1
})

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
        defaults: { telegram_id: userId, username: ctx.from.first_name, nickname: ctx.from.username }
    })
    ctx.reply(config.messages.start)
})

// Help command
bot.command('help', (ctx) => {
    ctx.reply(config.messages.start)
})

// Commands to interact with the bot
// - Create a new run
bot.command('create', async (ctx) => {
    ctx.session.state = 'choose_date'
    ctx.session.new_event = { author_id: ctx.user.id }
    //ctx.reply(config.messages.choose_date)
    calendar.startNavCalendar(ctx.message)
})

// - Find runs for today, this week, this month
bot.command('find', async (ctx) => {
    const events_full = await Event.findAll({
        include: { model: User, as: 'author' },
        where: {
            author_id: { [Op.ne]: ctx.user.id },
            date: {
                [Op.gte]: new Date
            }
        }
    })
    const events = []
    for (let event of events_full) {
        if (await event.hasParticipant(ctx.user.id)) {
            continue
        }
        else {
            events.push(event)
        }
    }
    if (events.length === 0) {
        ctx.reply(config.messages.no_new_events)
    }
    else {
        for (const event of events) {
            const keyboard = Markup.inlineKeyboard(
                [Markup.button.callback('✅ Присоединиться', `join-${event.id}`)]
            )
            const message = await eventInfo(event)
            ctx.replyWithHTML(message, keyboard)
        }
    }
})


bot.command('my_events', async (ctx) => {
    ctx.replyWithHTML(config.messages.choose_category, Markup.inlineKeyboard(
        [
            [Markup.button.callback(config.messages.i_m_author, 'imauthor')],
            [Markup.button.callback(config.messages.i_m_participant, 'imparticipant')]
        ]))
})

// - List all runs created by me 
bot.action('imauthor', async (ctx) => {
    const events = await Event.findAll({
        include: { model: User, as: 'author' },
        where: { author_id: ctx.user.id, date: { [Op.gte]: new Date() } },
        order: [['date', 'ASC']]
    })
    await ctx.deleteMessage()
    if (events.length === 0) {
        ctx.reply(config.messages.no_events)
    }
    else {
        for (let event of events) {
            const buttons = [
                [Markup.button.callback('Редактировать', `edit-${event.id}`)],
                [Markup.button.callback('Удалить', `delete-${event.id}`)],
                [Markup.button.callback('Опубликовать', `publish-${event.id}`)],
            ]
            const keyboard = Markup.inlineKeyboard(buttons).oneTime().resize() 
            const message = await eventInfo(event)
            ctx.replyWithHTML(message, keyboard)
        }
    }
})


// - List all runs I have joined to
bot.action('imparticipant', async (ctx) => {
    const userId = ctx.from.id
    const user = await User.findOne({
        include: [{
            model: Event,
            as: 'events_as_participant',
            required: false
        }],
        where: { telegram_id: userId }
    })
    const events = user.events_as_participant
    await ctx.deleteMessage()
    if (events.length === 0) {
        ctx.reply(config.messages.no_events)
    }
    else {
        for (const e of events) {
            const event = await Event.findByPk(e.id, {
                include: { model: User, as: 'author' }
            })
            const buttons = [Markup.button.callback('Отказаться', `unjoin-${event.id}`)]
            const keyboard = Markup.inlineKeyboard(buttons)
            const message = await eventInfo(event)
            ctx.replyWithHTML(message, keyboard)
        }
    }
})


for (const et of config.event_types) {
    bot.action(et, (ctx) => {
        ctx.session.new_event['type'] = et
        ctx.session.state = 'choose_location'
        ctx.replyWithHTML(config.messages.choose_location)
    })
}

// Catch all callback handler
// TODO: 
// - edit
bot.on('callback_query', async (ctx) => {
    const callbackData = ctx.callbackQuery.data
    const eventId = callbackData.split('-')[1]
    if (callbackData.startsWith('delete')) {
        // Delete the event
        const event = await Event.findByPk(eventId)
        notifyParticipants(event, config.messages.event_deleted_notification)
        await Event.destroy({ where: { id: eventId } })
        await ctx.deleteMessage()
        await ctx.answerCbQuery(config.messages.event_deleted)
    }
    else if (callbackData.startsWith('publish')) {
        // Publish the event
        const messenger_id = config.public_channel_id
        const event = await Event.findByPk(eventId)
        const message = await eventInfo(event)
        await bot.telegram.sendMessage(messenger_id, message, { parse_mode: 'HTML' })
        await ctx.answerCbQuery(config.messages.event_published)
    }
    else if (callbackData.startsWith('join')) {
        // Join the event
        const event = await Event.findByPk(eventId)
        await event.addParticipant(ctx.user)
        await ctx.deleteMessage()
        await ctx.answerCbQuery(config.messages.event_joined)
    }
    else if (callbackData.startsWith('unjoin')) {
        // Unjoin the event
        const event = await Event.findByPk(eventId)
        await event.removeParticipant(ctx.user)
        await ctx.deleteMessage()
        await ctx.answerCbQuery(config.messages.event_unjoined)
    }
    else if (callbackData.startsWith('edit_time')) {
        const event = await Event.findByPk(eventId)

        const message = mustache.render(config.messages.edit_time, { event: event })
        ctx.session.edit_event_id = eventId
        ctx.session.state = 'save_new_time'
        await ctx.replyWithHTML(message)
    }
    else if (callbackData.startsWith('edit_place')) {
        const event = await Event.findByPk(eventId)
        const message = mustache.render(config.messages.edit_location, { event: event })
        ctx.session.edit_event_id = eventId
        ctx.session.state = 'save_new_location'
        await ctx.replyWithHTML(message)
    }
    else if (callbackData.startsWith('edit_info')) {
        const event = await Event.findByPk(eventId)
        const message = mustache.render(config.messages.edit_info, { event: event })
        ctx.session.edit_event_id = eventId
        ctx.session.state = 'save_new_info'
        await ctx.replyWithHTML(message)
    }
    else if (callbackData.startsWith('edit')) {
        // Edit the event
        const buttons = [
            [Markup.button.callback('Время старта 🕑', `edit_time-${eventId}`)],
            [Markup.button.callback('Место проведения 📍', `edit_place-${eventId}`)],
            [Markup.button.callback('Описание 📝', `edit_info-${eventId}`)]
        ]
        await ctx.reply(config.messages.edit_message, Markup.inlineKeyboard(buttons))
    }
    else {
        // The date of the upcoming event is selected
        if (ctx.callbackQuery.message.message_id == calendar.chats.get(ctx.callbackQuery.message.chat.id)) {
            res = calendar.clickButtonCalendar(ctx.callbackQuery)
            if (res !== -1) {
                ctx.session.new_event['date'] = res
                ctx.session.state = 'choose_time'
                await ctx.replyWithHTML(config.messages.choose_time)
            }
        }
        else {
            ctx.reply(config.messages.unknown_command)
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
        const time_regex = /^\d{2}:\d{2}(\s?-\s?\d{2}:\d{2})?$/
        return time_regex.test(time)
    }

    const save_event = async (ctx) => {
        // Save the event to the database
        const event = new Event(ctx.session.new_event)
        await event.save()
    }

    // Dispatch object (all logic here)
    const buttons = []
    for (const et of config.event_types) {
        buttons.push([Markup.button.callback(et, et)])
    }
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
            keyboard: Markup.inlineKeyboard(buttons),
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
        'save_new_time': {
            next: '',
            attr: '',
            message: config.messages.time_saved,
            validation: validate_time,
            action: async (ctx) => {
                const event = await Event.findByPk(ctx.session.edit_event_id)
                notifyParticipants(event, config.messages.time_changed_notification, { new_time: ctx.message.text })
                event.time = ctx.message.text
                await event.save()
            }
        },
        'save_new_location': {
            next: '',
            attr: '',
            message: config.messages.location_saved,
            action: async (ctx) => {
                const event = await Event.findByPk(ctx.session.edit_event_id)
                notifyParticipants(event, config.messages.location_changed_notification, { new_location: ctx.message.text })
                event.location = ctx.message.text
                await event.save()
            }
        },
        'save_new_info': {
            next: '',
            attr: '',
            message: config.messages.info_saved,
            action: async (ctx) => {
                const event = await Event.findByPk(ctx.session.edit_event_id)
                notifyParticipants(event, config.messages.info_changed_notification, { new_info: ctx.message.text })
                event.additional_info = ctx.message.text
                await event.save()
            }
        }
    }

    const state = ctx.session.state

    if (state in dispatch) {
        const mode = dispatch[state]
        if (mode.validation &&
            !mode.validation(ctx.message.text)) {
            await ctx.reply(config.messages.invalid_input)
            return
        }

        ctx.session.new_event[mode.attr] = ctx.message.text
        ctx.session.state = mode.next
        let message = mode.message
        if (state === 'choose_location' &&
            config.static_events.includes(ctx.session.new_event['type'])) {
            ctx.session.state = 'enter_additional_info'
            message = config.messages.enter_additional_info
        }

        if (mode.action) {
            await mode.action(ctx)
        }

        await ctx.replyWithHTML(message, mode.keyboard)
    }
    else {
        ctx.reply(config.messages.unknown_command)
    }
})


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))


// TODO:
// - edit event + notifications to participants
// - notifications about event (1 hour before)



const eventInfo = async (event) => {
    const participants = []
    for (const x of await event.getParticipants()) {
        if (x.nickname) {
            participants.push(`@${x.nickname}`)
        }
        else {
            participants.push(x.username)
        }
    }
    const message = mustache.render(config.messages.event_info, {
        title: formatDate(event.date),
        event: event,
        participants: participants.join(', ')
    })
    return message
}

const notifyParticipants = async (event, msg, params) => {
    const participants = await event.getParticipants()
    const vars = params || {}
    vars['event'] = event
    const notification = mustache.render(msg, vars)
    for (const p of participants) {
        await bot.telegram.sendMessage(p.telegram_id, notification, { parse_mode: 'HTML' })
    }
}

if (process.env.NODE_ENV === "production") {
    // Creating the web server with webhooks
    const PORT = config.PORT || 3000
    const app = express()

    async function setupWebhook() {
        // Set the bot API endpoint
        const webhook = await bot.createWebhook({
            domain: config.WEBHOOK_DOMAIN,
        })
        app.use(webhook)
    }
    setupWebhook().catch(console.error)

    // The signature
    app.get('/about', (req, res) => {
        res.send(`
        <h1>Sport Event Bot</h1>
        <b>© Ilya Lityuga, 2024</b>`)
    })

    app.listen(PORT, () => {
        console.log(`* Listening on ${config.WEBHOOK_DOMAIN}:${config.PORT}`)
    })
}
else {
    bot.launch()
}