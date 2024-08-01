const express = require('express')
const User = require('./models/UserSchema');
const app = express.Router();
const jwt = require('jsonwebtoken');
const moment = require('moment')
const Match = require('./models/MatchListSchema');
const bcrypt = require('bcryptjs');
const Notification = require('./models/Notifications');
const { getIo } = require('./socket');
const createAndEmitNotification = async (userId, title, message, source, extra = null) => {
    const io = getIo()
    const notification = await Notification({ userId, title, message, source });
    await notification.save();
    io.to(userId).emit('notification', { notification, extra });
};
app.post('/signup', async (req, res) => {
    const { username, email, password, bio, location, profilePic, gender, socialMedia } = req.body;
    try {
        const avail = await User.findOne({ email: email });
        if (!avail) {
            // const num = Math.ceil(Math.random() * 10);
            const hashedPassword = await bcrypt.hash(password, 10);
            const picUrl = profilePic ? profilePic : `https://avatar.iran.liara.run/public/${gender == 'male' ? 'boy' : 'girl'}`
            const user = new User({
                username,
                email,
                password: hashedPassword,
                gender,
                location,
                bio,
                socialMedia,
                picUrl
            });
            await user.save();
            res.json({ status: 'ok', msg: 'User created' });
        } else {
            res.json({ status: 'error', msg: 'Email already exists.' });
        }
    } catch (err) {
        console.log(err);
        res.json({ status: 'error', data: err });
    }
});

app.post('/login', async (req, res) => {
    var { email, password } = req.body;
    email = email.trim()
    try {
        const user = await User.findOne({ email: email }).populate({
            path: 'trips',
            populate: {
                path: 'travellers',
                select: 'picUrl username'
            }
        });
        if (!user) {
            return res.json({ status: 'error', error: 'Email does not exist' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (isPasswordValid) {
            const token = jwt.sign(
                {
                    name: user.name,
                    email: user.email,
                },
                'secret123'
            );
            const userData = {
                _id: user._id,
                username: user.username,
                email: user.email,
                picUrl: user.picUrl,
                trips: user.trips,
                location: user.location,
                gender: user.gender,
                socialMedia: user.socialMedia,
                bio: user.bio,
                rightSwipes: user.rightSwipes
            };
            return res.json({ status: 'ok', token: token, user: userData, message: 'Welcome Back!' });
        } else {
            return res.json({ status: 'error', user: false, error: 'Invalid Password' });
        }
    } catch (err) {
        console.log(err);
        res.json({ status: 'error', data: err });
    }
});

app.get('/submit', async (req, res) => {
    const token = req.headers['x-access-token']
    try {
        const decode = jwt.verify(token, 'secret123')
        const email = decode.email
        const user = await User.findOne({ email: email }).populate({
            path: 'trips',
            populate: {
                path: 'travellers',
                select: 'picUrl username'
            }
        });
        res.json({ status: 'ok', user: user })
    } catch (error) {
        console.log(error)
        res.json({ status: 'error', error: 'Invalid Token' })
    }
})

app.post('/rightswipe/:userid', async (req, res) => {
    const io = getIo()
    const { userid } = req.params;
    const currentUserId = req.body.userId;
    const user = await User.findOne({ _id: userid })
    if (user.rightSwipes.find((id) => id == currentUserId)) {
        const user2 = await User.findByIdAndUpdate(currentUserId, { $push: { rightSwipes: userid } })
        createAndEmitNotification(userid, 'Match Found', `You have a new match with ${user2.username} for your upcoming trip.`, 'match', { username: user.username, picUrl: user.picUrl })
        res.json({ status: 'ok', msg: 'match found', data: user })
    }
    else {
        try {
            const user = await User.findByIdAndUpdate(currentUserId, { $push: { rightSwipes: userid } })
            res.json({ status: 'ok', msg: 'pushed to rightswipe list' })
        } catch (error) {
            console.log(error)
            res.json({ status: 'error', msg: error })
        }

    }

})

app.post('/addMatchList', async (req, res) => {
    try {
        const { userId, destination, startDate, endDate, budget } = req.body;
        const newTravelPlan = new Match({
            userId,
            destination,
            startDate,
            endDate,
            budget
        });
        await newTravelPlan.save();

        const matches = await Match.find({
            destination: destination,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            budget: { $gte: budget - 1500, $lte: budget + 1500 }
        }).populate('userId');

        res.status(200).json({
            message: 'Matching travel plans found!',
            matches: matches
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error finding matching travel plans',
            error: error.message
        });
    }
})
app.get('/get-user', async (req, res) => {
    try {
        const user2 = await User.find();
        const users = user2.map((element) => {
            const { password, ...userWithoutPassword } = element.toObject();
            return userWithoutPassword;
        });
        res.json({ status: 'ok', users: users });
    } catch (error) {
        console.log(error)
        res.json({ status: 'error', error: 'Something went wrong !!' })
    }
})
app.get('/notification/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const notifications = await Notification.find({ userId }).sort({ timestamp: -1 });
        res.status(200).json({ notifications });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch notifications', error });
    }
});

// Mark all notifications as read for a specific user
app.put('/mark-read/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        await Notification.updateMany({ userId, read: false }, { read: true });
        res.status(200).json({ message: 'Notifications marked as read' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to mark notifications as read', error });
    }
});

app.post('/getMatch', async (req, res) => {
    try {
        const { destination, startDate, endDate, budget } = req.body;
        const start = new Date(startDate);
        const end = new Date(endDate);
        const matches = await Match.find({
            destination: destination,
            startDate: { $lte: end },
            endDate: { $gte: start },
            budget: { $gte: budget - 1500, $lte: budget + 1500 }
        }).populate('userId', 'username picUrl email');

        res.status(200).json({
            message: 'Matching travel plans found!',
            matches: matches
        });
    } catch (error) {
        res.status(500).json({
            message: 'Error finding matching travel plans',
            error: error.message
        });
    }
})
app.post('/update-profile', async (req, res) => {
    const { username, email, bio, gender, location, socialMedia, picUrl, id } = req.body
    try {
        console.log(req.body)
        const user = await User.findOne({ _id: id }, { password: 0 }).populate({
            path: 'trips',
            populate: {
                path: 'travellers',
                select: 'picUrl username'
            }
        });
        if (user === null)
            res.status(404).json({ msg: 'No User Found' })
        else {
            user.username = username
            user.email = email
            user.bio = bio
            user.gender = gender
            user.location = location
            user.socialMedia = socialMedia
            user.picUrl = picUrl
            await user.save()
            console.log(user)
            res.status(200).json({ user: user })
        }
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error })
    }
})
module.exports = app;  