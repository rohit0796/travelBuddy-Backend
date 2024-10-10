const mongoose = require('mongoose')

const userSchema = mongoose.Schema({
    username: {
        type: String,
        require: true
    },
    email: {
        type: String,
        require: true,
    },
    picUrl: {
        type: String,
    },
    phoneNumber: {
        type: String,
    },
    password: {
        type: String,

        require: true
    },
    rightSwipes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    trips: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Trip'
        }
    ],
    bio: {
        type: String
    },
    gender: {
        type: String
    },
    socialMedia: {},
    location: {
        type: String
    },
    fcmToken: {
        type: String
    },
})

const user = mongoose.model('User', userSchema);
module.exports = user;