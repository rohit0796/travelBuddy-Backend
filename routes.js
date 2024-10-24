const express = require('express')
const User = require('./models/UserSchema');
const app = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const moment = require('moment')
require('dotenv').config()
const Match = require('./models/MatchListSchema');
const bcrypt = require('bcryptjs');
const Notification = require('./models/Notifications');
const { getIo } = require('./socket');
const { firebase } = require('./Firebase/firebase');
const sendNotification = (fcmtoken, title, body) => {
    firebase.messaging().send({
        token: fcmtoken,
        notification: {
            title: title,
            body: body
        }
    })
}

const generateOTP = () => {
    return crypto.randomInt(100000, 999999).toString();
};

// Function to send OTP
const sendOTP = async (email, otp) => {
    // Configure Nodemailer for sending emails
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'service.travel.buddy@gmail.com',
            pass: 'koph hwzg wutn mdtq'
        }
    });

    // Email message
    let mailOptions = {
        from: 'service.travel.buddy@gmail.com',
        to: email,
        subject: 'TravelBuddy - Your OTP Code',
        html: `
        <p>Dear User,</p>
        <p>Welcome to <strong>TravelBuddy</strong>! We're excited to have you onboard.</p>
        <p>To complete your registration, please use the following One-Time Password (OTP) to verify your email:</p>
        <p><strong style="font-size: 20px;">${otp}</strong></p>
        <p>This OTP is valid for 10 minutes.</p>
        <p>If you didn't request this, feel free to ignore this email.</p>
        <p>Thank you,<br />The TravelBuddy Team</p>
    `
    };

    await transporter.sendMail(mailOptions);
};


app.use(express.json()); // Ensure this middleware is used
const cloudinary = require('cloudinary').v2; // Ensure you have cloudinary installed

const createAndEmitNotification = async (userId, title, message, source, extra = null) => {
    const io = getIo()
    const notification = await Notification({ userId, title, message, source, extra });
    await notification.save();
    io.to(userId).emit('notification', notification);
};

app.post('/otpgeneration', async (req, res) => {
    const { email, forget } = req.body;
    var user;
    if (forget) {
        user = await User.findOne({ email: email })
    }
    if (forget && !user) return res.json({ message: 'Email not Registered !!' });
    const otp = generateOTP();
    const token = jwt.sign(
        { otp, exp: Math.floor(Date.now() / 1000) + (10 * 60) }, // expires in 10 mins
        'your_jwt_secret'
    );

    // Send OTP to the user
    await sendOTP(email, otp);

    res.status(201).json({ status: 'ok', token, message: 'OTP sent to your email!' });

})

app.post('/signup', async (req, res) => {
    const { username, email, password, bio, phone, location, profilePic, gender, socialMedia } = req.body;
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
                phoneNumber: phone,
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
app.post('/verifyOtp', async (req, res) => {
    const { token, otp } = req.body;

    try {
        // Decode the token
        const decoded = jwt.verify(token, 'your_jwt_secret');

        // Check if OTP matches
        if (decoded.otp !== otp) {
            return res.status(400).json({ message: 'Invalid OTP!' });
        }

        // OTP is valid
        return res.json({ status: 200, message: 'OTP verified successfully!' });
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(400).json({ message: 'OTP expired!' });
        }
        return res.status(400).json({ message: 'Invalid OTP!' });
    }
})
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
                phoneNumber: user.phoneNumber,
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
app.post('/change-password', async (req, res) => {
    const { email, Oldpassword, newPassword } = req.body;
    const user = await User.findOne({ email: email })
    if (!user)
        return res.json({ status: 'error', error: 'Email does not exist' });

    const isPasswordValid = await bcrypt.compare(Oldpassword, user.password);
    if (!isPasswordValid) {
        return res.json({ message: "Old Password is Invalid !!" })
    }
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({ status: 'ok', message: 'Password Changed!' })

})
app.post('/forget-password', async (req, res) => {
    const { email, newPassword } = req.body;
    const user = await User.findOne({ email: email })
    if (!user)
        return res.json({ status: 'error', error: 'Email does not exist' });
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();
    res.json({ status: 'ok', message: 'Password Changed!' })

})
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
        createAndEmitNotification(userid, 'Match Found', `You have a new match with ${user2.username} for your upcoming trip.`, 'match', { username: user2.username, picUrl: user2.picUrl, id: currentUserId })
        sendNotification(user.fcmToken, 'Match Found', `You have a new match with ${user2.username} for your upcoming trip.`)
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
        const io = getIo()
        const { userId, destination, startDate, endDate, budget } = req.body;
        const newTravelPlan = new Match({
            userId,
            destination: destination.toLowerCase(),
            startDate,
            endDate,
            budget
        });
        await newTravelPlan.save();

        const matches = await Match.find({
            destination: destination.toLowerCase(),
            $or: [
                { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
                { startDate: startDate, endDate: endDate }  // Exact match case
            ],
        }).populate('userId', 'username email picUrl trips location bio gender socialMedia');

        var newMatch;

        matches.forEach((match) => {
            if (match.userId._id == userId)
                newMatch = match
        })
        matches.forEach((match) => {
            if (match.userId._id != userId)
                io.to(match.userId._id.toString()).emit('matched', newMatch)
        })
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
        // const start = new Date(startDate);
        // const end = new Date(endDate);

        const matches = await Match.find({
            destination: destination.toLowerCase(),
            $or: [
                { startDate: { $lte: endDate }, endDate: { $gte: startDate } },
                { startDate: startDate, endDate: endDate }  // Exact match case
            ],
        }).populate('userId', 'username email picUrl trips location bio gender socialMedia');

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
    const { username, email, bio, gender, location, socialMedia, picUrl, id, fcmToken, phoneNumber } = req.body
    try {
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
            user.phoneNumber = phoneNumber
            user.email = email
            user.bio = bio
            user.gender = gender
            user.location = location
            user.socialMedia = socialMedia
            user.picUrl = picUrl
            user.fcmToken = fcmToken
            await user.save()
            res.status(200).json({ user })
        }
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: error })
    }
})

cloudinary.config({
    cloud_name: process.env.CLOUD_NAME,
    api_key: process.env.API_KEY,
    api_secret: process.env.API_SECRET,
    secure: true
});

app.post('/delete-image', async (req, res) => {
    const { public_id } = req.body;
    try {
        const result = await cloudinary.uploader.destroy(public_id);
        console.log('Delete result:', result);
        if (result.result === 'ok') {
            res.status(200).json({ message: 'Image deleted successfully' });
        } else {
            res.status(400).json({ message: 'Failed to delete image' });
        }
    } catch (error) {
        console.error('Error deleting image:', error);
        res.status(500).json({ message: error.message });
    }
});

app.get('/getdata/:id', async (req, res) => {
    const { id } = req.params;
    const matchData = await Match.findOne({ userId: id })
    res.json(matchData)
})

app.post('/checkContacts', async (req, res) => {
    const { phoneNumbers } = req.body;

    try {
        const registeredUsers = await User.find({
            phoneNumber: { $in: phoneNumbers }
        });

        res.status(200).json({ registeredUsers });
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: 'An error occurred while fetching users.' });
    }
});

module.exports = app;  