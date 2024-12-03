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
            type: mongoose.Schema.Types.ObjectId,
            ref: "expenses"
        }
    ],
    polls: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'poll'
        }
    ],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
})

const Trip = mongoose.model('Trip', tripSchema);
module.exports = Trip