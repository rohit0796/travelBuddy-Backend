const express = require('express')
const jwt = require('jsonwebtoken')
const app = express.Router()
const Schema = require('./models/UserSchema')
const Chat = require('./models/chatSchema')
const Message = require('./models/messageSchema')
const { getIo } = require('./socket')
const { firebase } = require('./Firebase/firebase')
const user = require('./models/UserSchema')
const Notifications = require('./models/Notifications')
const sendNotification = async (fcmtoken, title, body) => {
    if (!fcmtoken) return;
    firebase.messaging().send({
        token: fcmtoken,
        notification: {
            title: title,
            body: body
        }
    }).then().catch(async (error) => {
        if (error.code === 'messaging/registration-token-not-registered') {
            console.log(`Token ${fcmtoken} is invalid, removing from database.`);
            // Remove the token from the User document
            await Schema.updateOne(
                { fcmToken: fcmtoken },
                { $unset: { fcmToken: "" } }
            );
            console.log(`Token ${fcmtoken} removed from the database.`);
        } else {
            console.error('Error sending message:', error);
        }
    })
}
const createAndEmitNotification = async (userId, title, message, source, extra) => {
    const io = getIo()
    const notification = await Notifications({ userId, title, message, source, extra });
    await notification.save();
    io.to(userId.toString()).emit('notification', notification);
};
app.post('/accessChat', async (req, res) => {
    const { userid, searchid } = req.body;
    if (!userid) {
        console.log("UserId param not sent with request");
        return res.sendStatus(400);
    }

    var isChat = await Chat.find({
        isGroupChat: false,
        $and: [
            { users: { $elemMatch: { $eq: searchid } } },
            { users: { $elemMatch: { $eq: userid } } },
        ],
    })
        .populate("users", "username email bio picUrl gender location socialMedia _id")
        .populate("latestMessage");

    isChat = await Schema.populate(isChat, {
        path: "latestMessage.sender",
        select: "username picUrl",
    });

    if (isChat.length > 0) {
        res.send(isChat[0]);
    } else {
        const user1 = await user.findOne({ _id: searchid })
        const user2 = await user.findOne({ _id: userid })
        var chatData = {
            chatName: "sender",
            isGroupChat: false,
            users: [user1, user2],
            _id: searchid
        };
        res.status(200).json(chatData);
    }
})

app.get('/fetch-chats/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let results = await Chat.find({ users: { $elemMatch: { $eq: id } } })
            .populate({
                path: "users",
                select: "username email bio picUrl gender location socialMedia _id", // Include only specific fields, excluding sensitive data
            })
            .populate({
                path: "groupAdmin",
                select: "username picUrl gender location socialMedia email bio  _id", // Include only necessary fields
            })
            .populate("latestMessage")
            .sort({ updatedAt: -1 })
            .exec();

        // Populate latestMessage sender details
        results = await Schema.populate(results, {
            path: "latestMessage.sender",
            select: "username picUrl",
        });

        // Add unread messages count to each chat
        const updatedResults = await Promise.all(
            results.map(async (chat) => {
                const unreadMessagesCount = await Message.countDocuments({
                    Chat: chat._id,
                    read: false,
                    sender: { $ne: id }
                });

                return { ...chat._doc, unreadCount: unreadMessagesCount };
            })
        );

        res.status(200).send(updatedResults);

    } catch (error) {
        console.error(error);
        res.status(500).send({ message: "Failed to fetch chats" });
    }
});


app.post('/mark-as-read', async (req, res) => {
    const { chatId, userId } = req.body;
    try {
        await Message.updateMany(
            { Chat: chatId, sender: { $ne: userId }, read: false },
            { $set: { read: true } }
        );

        res.status(200).send({ message: 'Messages marked as read' });
    } catch (error) {
        res.status(400).send({ message: error.message });
    }
});


app.get('/get-messages/:id', async (req, res) => {
    try {
        const messages = await Message.find({ Chat: req.params.id })
            .populate("sender", "username picUrl")
            .populate("Chat");
        res.json(messages);
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});


app.post('/send-messages', async (req, res) => {
    const { content, chatId, userId } = req.body;
    if (!content || !chatId) {
        console.log("Invalid data passed into request");
        return res.sendStatus(400);
    }
    const chat = await Chat.findById(chatId)
    var createdChat;
    if (!chat) {
        try {
            var chatData = {
                chatName: "sender",
                isGroupChat: false,
                users: [userId, chatId],
            };
            createdChat = await Chat.create(chatData);
        } catch (error) {
            res.status(400);
            throw new Error(error.message);
        }
    }
    var newMessage = {
        sender: userId,
        content: content,
        Chat: createdChat ? createdChat._id : chatId,
    };
    try {

        var messages = new Message(newMessage);
        var message = await messages.save()
        message = await message.populate("sender", "username picUrl");
        message = await message.populate("Chat")
        message = await Schema.populate(message, {
            path: "Chat.users",
            select: "username picUrl email fcmToken",
        });
        // console.log(message)
        var receiver = [];
        message.Chat.users.forEach(user => {
            if (user._id != userId)
                receiver.push(user.fcmToken)
        });
        await Chat.findByIdAndUpdate(createdChat ? createdChat._id : chatId, { latestMessage: message }, { new: true });
        res.json(message);
        receiver.forEach((rec) => {
            try {
                sendNotification(rec, message.sender.username, content)

            } catch (error) {
                console.log(error)
            }
        })

    } catch (error) {
        res.status(400);
        console.log(error.message);
    }
});
app.post('/create-groupChat', async (req, res) => {
    if (!req.body.users || !req.body.name) {
        return res.status(400).send({ message: "Please Fill all the feilds" });
    }

    var users = req.body.users.map((user) => user._id)
    users.push(req.body.creator)
    if (users.length < 2) {
        return res
            .status(400)
            .json("More than 2 users are required to form a group chat");
    }

    try {
        const groupChat = await Chat.create({
            chatName: req.body.name,
            users: users,
            isGroupChat: true,
            groupAdmin: req.body.admins,
        });

        const fullGroupChat = await Chat.findOne({ _id: groupChat._id })
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        res.status(200).json(fullGroupChat);
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});
app.post('/update-group', async (req, res) => {
    try {
        const obj = req.body;

        // Fetch the current group data
        const existingGroup = await Chat.findById(obj._id).populate("users", "-password");

        if (!existingGroup) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Determine removed users
        const currentUsers = existingGroup.users.map(user => user._id.toString());
        const updatedUsers = obj.users.map(user => user._id.toString());
        const removedUsers = currentUsers.filter(userId => !updatedUsers.includes(userId));

        // Update the group
        const updatedGroup = await Chat.findByIdAndUpdate(obj._id, obj, { new: true })
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        if (!updatedGroup) {
            return res.status(404).json({ error: 'Group not found' });
        }

        // Placeholder: Handle notifications for removed users
        if (removedUsers.length > 0) {
            removedUsers.forEach(user => {
                createAndEmitNotification(user, `Removed from ${obj.chatName}`, `Admins removed you from the chat - ${obj.chatName}`)
            })
            console.log("Removed Users: ", removedUsers);
            // You can send notifications here to the `removedUsers` via your notification service.
        }

        res.json({ status: 'ok', updatedGroup });
    } catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
});

module.exports = app;