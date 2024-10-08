const mongoose = require('mongoose')

const PollSchema = new mongoose.Schema({

    question: {
        type: String
    },
    multipleChoice: {
        type: Boolean
    },
    options: [
        {
            text: {
                type: String,
            },
            chosenBy: [],
        }
    ],
    creator: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
})

const polls = mongoose.model('poll', PollSchema);
module.exports = polls