const mongoose = require('mongoose');

const tripSchema = mongoose.Schema({
    destination: {
        type: String,

    },
    startDate: {
        type: Date,
    },
    endDate: {
        type: Date,
    },
    budget: {
        type: Number,

    },
    admins: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    travellers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    itinerary: [
        {
            date: {
                type: String
            },
            activities: []
        }
    ],
    expenses: [
        {
            description: {
                type: String
            },
            amount: {
                type: Number
            },
            members: [],
            creator: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ],
    polls: [{
        question: {
            type: String
        },
        multipleChoice: {
            type: Boolean
        },
        options: []
    }],
})

const Trip = mongoose.model('Trip', tripSchema);
module.exports = Trip