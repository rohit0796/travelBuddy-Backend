const express = require('express')
const app = express();
const urlRouter = require('./routes')
const chatRouter = require('./chatRoutes')
const tripRouter = require('./tripRouter')
const bodyParser = require('body-parser');
const { firebase } = require('./Firebase/firebase')
const cors = require('cors')
const mongoose = require('mongoose');
const { init, getIo } = require('./socket');
require('dotenv').config()
app.use(cors())
app.use(express.json())
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use('/chat', chatRouter)
app.use('/trip', tripRouter)
app.use('/', urlRouter)
mongoose.connect(process.env.DB_URL,
    {
        useNewUrlParser: true,
        connectTimeoutMS: 6000
    }
)
    .then((res) => console.log("connected to db"))
    .catch((er) => console.log(er))
require('./deleteExpiredTrips');
const server = app.listen(process.env.PORT || 5000, () => {
    console.log("server running")
})

init(server)
const io = getIo()
io.on('connection', (socket) => {
    console.log("connected to io");
    socket.on('setup', (user) => {
        console.log(user._id)
        socket.join(user._id)
        socket.emit("connected")
    })
    socket.on("join chat", (room) => {
        socket.join(room.id);
        console.log("User Joined Room: " + room.id);
    });
    socket.on('new message', (userMessage) => {
        const chat = userMessage.Chat;
        if (!chat?.users) {
            console.log('no users in chat');
        } else {
            chat.users.forEach((user) => {
                if (user._id != userMessage.sender._id) {
                    io.to(user._id).emit("message received", userMessage);
                }
                io.to(user._id).emit('reload', userMessage)
            });
        }
    });

    socket.on("start typing", (room) => {
        console.log('start typing', room);
        socket.in(room.id).emit("typing", room);
    });

    socket.on("stop typing", (room) => {
        console.log('stop typing', room);
        socket.to(room).emit("not typing", room);
    });

    socket.off("setup", () => {
        console.log("USER DISCONNECTED");
        socket.leave(userData._id);
    });
})

const sendNotification = (fcmtoken, title, body) => {
    firebase.messaging().send({
        token: fcmtoken,
        notification: {
            title: title,
            body: body
        }
    })
}
// setTimeout(() => {
//     sendNotification()
// }, 2000)
module.exports = { io, sendNotification }