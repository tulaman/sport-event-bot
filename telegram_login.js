require('@dotenvx/dotenvx').config()
const { TelegramClient } = require('telegram')
const { StringSession } = require('telegram/sessions')
const input = require('input')

const apiId = Number(process.env.TG_API_ID)
const apiHash = process.env.TG_API_HASH
const stringSession = new StringSession('') // empty for first login

if (!apiId || !apiHash) {
    console.error('Please set TG_API_ID and TG_API_HASH environment variables')
    process.exit(1)
}

console.log('=== Telegram Login Script ===')
console.log('This script will help you generate a session string for activity monitoring')
console.log('Please make sure you have the following environment variables set:')
console.log('- TG_API_ID: Your Telegram API ID')
console.log('- TG_API_HASH: Your Telegram API Hash')
console.log('')
console.log('You can get these from https://my.telegram.org/apps')
console.log('')

async function main() {
    console.log('Starting interactive login...')
    
    const client = new TelegramClient(stringSession, apiId, apiHash, { 
        connectionRetries: 5 
    })
    
    try {
        await client.start({
            phoneNumber: async () => await input.text('Enter your phone number (with country code, e.g., +1234567890): '),
            password: async () => await input.text('Enter your 2FA password (if you have one): '),
            phoneCode: async () => await input.text('Enter the code you received: '),
            onError: (err) => console.error('Login error:', err),
        })
        
        console.log('\n✅ Login successful!')
        console.log('\n📋 Your session string (save this securely):')
        console.log('==========================================')
        console.log(client.session.save())
        console.log('==========================================')
        console.log('\n💾 Add this to your .env file as:')
        console.log('TG_STRING_SESSION=' + client.session.save())
        console.log('\n⚠️  IMPORTANT: Keep this session string secure!')
        console.log('   - Do not share it with anyone')
        console.log('   - Do not commit it to version control')
        console.log('   - Store it in your .env file')
        
    } catch (error) {
        console.error('Error during login:', error)
        process.exit(1)
    } finally {
        await client.disconnect()
    }
}

main().catch(console.error)