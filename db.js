const { Sequelize, DataTypes } = require('sequelize')

const STORAGE = process.env.STORAGE || ':memory:'


const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: STORAGE
})


// define the database
const Session = sequelize.define(
    'session',
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true
        },
        user_id: {
            type: DataTypes.STRING,
            allowNull: false
        },
        json: {
            type: DataTypes.TEXT,
            allowNull: true
        }
    }
)

const connect = async () => {
    try {
        await sequelize.authenticate()
        console.log('Connection has been established successfully.')

        await sequelize.sync({ force: process.env.NODE_ENV === 'development' })
        console.log('All models were synchronized successfully.')
    } catch (error) {
        console.error('Unable to connect to the database:', error)
    }
}

connect()


// Function to load session data from the database
const loadSessionFromDatabase = async (userId) => {
    const [session_obj, created] = await Session.findOrCreate({
        where: { user_id: userId },
        defaults: {
            user_id: userId,
            json: '{}'
        },
    })
    return JSON.parse(session_obj.json)
}

// Function to save session data to the database
const saveSessionToDatabase = async (userId, session) => {
    await Session.update(
        { json: JSON.stringify(session) },
        { where: { user_id: userId } }
    )
}

module.exports = { sequelize, loadSessionFromDatabase, saveSessionToDatabase }