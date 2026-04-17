require('@dotenvx/dotenvx').config()
const { Api, TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const { DateTime } = require('luxon')
const { User, Event, sequelize } = require('./db')
const config = require('./config')

// Configuration
const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH
const stringSession = new StringSession(process.env.TG_STRING_SESSION || '')
const targetChat = process.env.TG_TARGET_CHAT || config.public_channel_id // Group chat ID
const ACTIVITY_WINDOW_DAYS = Number(
    process.env.ACTIVITY_WINDOW_DAYS ||
        config.activity_monitoring?.window_days ||
        30
)

if (!apiId || !apiHash || !stringSession || !targetChat) {
    console.error(
        'Missing required env vars (TG_API_ID, TG_API_HASH, TG_STRING_SESSION, TG_TARGET_CHAT)'
    )
    process.exit(1)
}

// Update user's last message date
async function updateUserLastMessage(telegramId, messageDate) {
    try {
        await User.update(
            { last_message_date: messageDate },
            { where: { telegram_id: telegramId.toString() } }
        )
    } catch (error) {
        console.error(
            `Error updating last message date for user ${telegramId}:`,
            error
        )
    }
}

// Update user's last reaction date
async function updateUserLastReaction(telegramId, reactionDate) {
    try {
        await User.update(
            { last_reaction_date: reactionDate },
            { where: { telegram_id: telegramId.toString() } }
        )
    } catch (error) {
        console.error(
            `Error updating last reaction date for user ${telegramId}:`,
            error
        )
    }
}

// Update user's last bot activity date
async function updateUserLastBotActivity(telegramId, activityDate) {
    try {
        await User.update(
            { last_bot_activity_date: activityDate },
            { where: { telegram_id: telegramId.toString() } }
        )
    } catch (error) {
        console.error(
            `Error updating last bot activity date for user ${telegramId}:`,
            error
        )
    }
}

// Resolve entity helper with numeric-ID support
function normalizeChatIdentifier(chat) {
    // 1. If it's already a number (or numeric string) coming from an env/config,
    //    convert it to telegram's `-100` prefixed BigInt (required by gramJS).
    // 2. Otherwise just pass the original value (@username, invite link, etc.) through.
    if (typeof chat === 'string') {
        const trimmed = chat.trim()
        if (/^\d+$/.test(trimmed)) {
            // Channel/group ID without -100 prefix, add it.
            // The resulting value must be BigInt for gramJS.
            return BigInt(`-100${trimmed}`)
        }
    } else if (typeof chat === 'number') {
        // Numeric literal provided directly
        return BigInt(`-100${chat}`)
    }
    return chat
}

async function resolveEntity(client, chat) {
    const normalized = normalizeChatIdentifier(chat)
    try {
        return await client.getEntity(normalized)
    } catch (err) {
        console.error('Failed to resolve target chat entity:', err)
        throw err
    }
}

// Helper to reliably extract numeric Telegram user ID from a message
function getSenderIdFromMessage(msg) {
    // For standard messages in groups/supergroups "fromId" is present.
    if (msg.fromId) {
        const id = extractUserId(msg.fromId)
        if (id) return id
    }
    // Some API versions expose "senderId" instead of "fromId"
    if (msg.senderId) {
        const id = extractUserId(msg.senderId)
        if (id) return id
    }
    // Fallback: nothing suitable found
    return null
}

// Get recent message senders
async function collectRecentSenders(client, entity, cutoffDate) {
    const userLastMsg = new Map()
    let offsetId = 0
    const limit = 100

    while (true) {
        const history = await client.invoke(
            new Api.messages.GetHistory({
                peer: entity,
                offsetId,
                offsetDate: 0,
                addOffset: 0,
                limit,
                maxId: 0,
                minId: 0,
                hash: BigInt(0),
            })
        )

        const msgs = history.messages
        if (!msgs.length) break

        let foundOldMessage = false
        for (const m of msgs) {
            if (m instanceof Api.Message) {
                const dt = DateTime.fromSeconds(m.date, { zone: 'utc' })
                // Luxon DateTime objects should be compared via their epoch milliseconds
                if (dt.toMillis() < cutoffDate.toMillis()) {
                    foundOldMessage = true
                    continue
                }

                const senderId = getSenderIdFromMessage(m)
                if (senderId) {
                    const existing = userLastMsg.get(senderId)
                    if (!existing || dt.toMillis() > existing.toMillis()) {
                        userLastMsg.set(senderId, dt)
                    }
                }
            }
        }

        if (foundOldMessage) break

        const lastMsg = msgs[msgs.length - 1]
        if (lastMsg && lastMsg.id) {
            offsetId = lastMsg.id
        } else {
            break
        }
    }

    return userLastMsg
}

// Extract user ID from peer
function extractUserId(fromId) {
    if (!fromId) return null
    if (fromId instanceof Api.PeerUser) return Number(fromId.userId)
    return null
}

// Mark users as active/inactive based on all activity types
async function updateUserActivityStatus() {
    const cutoffDate = DateTime.utc().minus({ days: ACTIVITY_WINDOW_DAYS })
    const cutoffMillis = cutoffDate.toMillis()

    // Helper to check if a JS Date lies within the activity window
    const withinWindow = (jsDate) =>
        jsDate && DateTime.fromJSDate(jsDate).toMillis() >= cutoffMillis

    const users = await User.findAll({
        where: { is_exempt_from_activity_check: false },
    })

    for (const user of users) {
        let isActive = false

        // Check any activity type within window
        if (withinWindow(user.last_message_date)) isActive = true
        if (withinWindow(user.last_reaction_date)) isActive = true
        if (withinWindow(user.last_bot_activity_date)) isActive = true

        await user.update({ is_active: isActive })
    }
}

// Main function
async function main() {
    console.log('Starting activity monitor...')

    const client = new TelegramClient(stringSession, apiId, apiHash, {
        connectionRetries: 5,
    })

    try {
        console.log('Connecting to Telegram...')
        await client.start()
        console.log('Telegram connected.')

        const entity = await resolveEntity(client, targetChat)
        console.log('Resolved chat entity:', targetChat)

        const cutoffDate = DateTime.utc().minus({ days: ACTIVITY_WINDOW_DAYS })
        console.log(`Activity cutoff UTC: ${cutoffDate.toISO()}`)

        // Collect recent message senders
        console.log('Collecting recent message senders...')
        const userLastMsgMap = await collectRecentSenders(
            client,
            entity,
            cutoffDate
        )
        console.log(`Found ${userLastMsgMap.size} users with recent messages`)

        // Update message activity in database
        for (const [userId, lastMessageDate] of userLastMsgMap) {
            await updateUserLastMessage(userId, lastMessageDate.toJSDate())
        }

        // Update activity status for all users
        console.log('Updating user activity status...')
        await updateUserActivityStatus()

        // Generate summary
        const activeCount = await User.count({
            where: { is_active: true, is_exempt_from_activity_check: false },
        })
        const inactiveCount = await User.count({
            where: { is_active: false, is_exempt_from_activity_check: false },
        })
        const exemptCount = await User.count({
            where: { is_exempt_from_activity_check: true },
        })

        console.log(`Activity summary:`)
        console.log(`Active users: ${activeCount}`)
        console.log(`Inactive users: ${inactiveCount}`)
        console.log(`Exempt users: ${exemptCount}`)
    } catch (error) {
        console.error('Error in activity monitor:', error)
        process.exit(1)
    } finally {
        await client.disconnect()
        console.log('Activity monitor completed.')
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(console.error)
}

module.exports = { updateUserLastBotActivity }
