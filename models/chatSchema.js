const mongoose = require('mongoose')

const ChatModel = new mongoose.Schema(
    {
        chatName: {
            type: String,
            trim: true
        },
        isGroupChat: {
            type: Boolean,
            default: false
        },
        groupPic: {
            type: String,
            default: ''
        },
        users: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }],
        latestMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Message'
        },
        groupAdmin:
            [{
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }]
    },
    { timestamps: true }
)

const chat = mongoose.model('Chat', ChatModel);
module.exports = chat;