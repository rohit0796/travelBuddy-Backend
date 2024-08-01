const mongoose = require('mongoose');

const messageModel = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    content: {
        type: String,
        trim: true
    },
    Chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat'
    },
    read: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
});

const message = mongoose.model('Message', messageModel);
module.exports = message;
