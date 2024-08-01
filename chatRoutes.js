const express = require('express')
const jwt = require('jsonwebtoken')
const app = express.Router()
const Schema = require('./models/UserSchema')
const Chat = require('./models/chatSchema')
const Message = require('./models/messageSchema')
const { getIo } = require('./socket')

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
        .populate("users", "-password")
        .populate("latestMessage");

    isChat = await Schema.populate(isChat, {
        path: "latestMessage.sender",
        select: "username picUrl",
    });

    if (isChat.length > 0) {
        res.send(isChat[0]);
    } else {
        var chatData = {
            chatName: "sender",
            isGroupChat: false,
            users: [searchid, userid],
        };

        try {
            const createdChat = await Chat.create(chatData);
            const FullChat = await Chat.findOne({ _id: createdChat._id }).populate(
                "users",
                "-password"
            );
            res.status(200).json(FullChat);
        } catch (error) {
            res.status(400);
            throw new Error(error.message);
        }
    }
})

app.get('/fetch-chats/:id', async (req, res) => {
    const { id } = req.params;
    try {
        let results = await Chat.find({ users: { $elemMatch: { $eq: id } } })
            .populate("users", "-password")
            .populate("groupAdmin", "-password")
            .populate("latestMessage")
            .sort({ updatedAt: -1 })
            .exec();

        results = await Schema.populate(results, {
            path: "latestMessage.sender",
            select: "username picUrl",
        });

        const updatedResults = await Promise.all(results.map(async (chat) => {
            const unreadMessagesCount = await Message.countDocuments({
                Chat: chat._id,
                read: false,
                sender: { $ne: id }
            });
            return { ...chat._doc, unreadCount: unreadMessagesCount };
        }));

        res.status(200).send(updatedResults);
    } catch (error) {
        res.status(400).send({ message: error.message });
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

    var newMessage = {
        sender: userId,
        content: content,
        Chat: chatId,
    };
    try {

        var messages = new Message(newMessage);
        var message = await messages.save()
        message = await message.populate("sender", "username picUrl");
        message = await message.populate("Chat")
        message = await Schema.populate(message, {
            path: "Chat.users",
            select: "username picUrl email",
        });
        console.log(message)
        await Chat.findByIdAndUpdate(req.body.chatId, { latestMessage: message }, { new: true });
        res.json(message);

    } catch (error) {
        res.status(400);
        throw new Error(error.message);
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

        const updatedGroup = await Chat.findByIdAndUpdate(obj._id, obj, { new: true })
            .populate("users", "-password")
            .populate("groupAdmin", "-password");

        if (!updatedGroup) {
            return res.status(404).json({ error: 'Group not found' });
        }

        res.json({ status: 'ok', updatedGroup });
    }
    catch (error) {
        res.status(400);
        throw new Error(error.message);
    }
})
module.exports = app;