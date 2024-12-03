const express = require('express');
const app = express.Router();
const User = require('./models/UserSchema');
const Trip = require('./models/TripSchema');
const Notifications = require('./models/Notifications');
const Match = require('./models/MatchListSchema');

const { getIo } = require('./socket');
const Expense = require('./models/exepnseSchema');
const polls = require('./models/pollSchema');
const { firebase } = require('./Firebase/firebase');
const user = require('./models/UserSchema');
const sendNotification = async (fcmtoken, title, body) => {
    firebase.messaging().send({
        token: fcmtoken,
        notification: {
            title: title,
            body: body
        }
    }).then(res => console.log(res)
    ).catch(async (error) => {
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
app.post('/create-trip', async (req, res) => {
    // console.log(req.body);
    const { destination, startDate, endDate, travellers, budget, currentUser, itinerary, admins } = req.body;
    try {
        travellers.push(currentUser);
        const trip = new Trip({
            destination,
            startDate,
            endDate,
            travellers,
            budget,
            itinerary,
            admins,
            createdBy: currentUser._id
        });
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id).populate('travellers', 'picUrl username').populate('createdBy', 'picUrl username');

        for (const user of travellers) {
            await User.findByIdAndUpdate(user._id, { $push: { trips: trip._id } });
        }
        const userIds = trip.travellers.map(user => user._id);  // Extract the IDs from the users array

        User.find({ _id: { $in: userIds } })
            .then(users => {
                users.forEach(user => {
                    if (user._id !== currentUser._id) {
                        // Create and emit an in-app notification
                        createAndEmitNotification(user._id, 'New Trip', `${trip.destination} has been created`, 'trip', populatedTrip);
                        // Send FCM notification
                        if (user.fcmToken) {  // Ensure fcmToken exists before sending
                            sendNotification(user.fcmToken, 'New Trip', `${trip.destination} has been created`);
                        } else {
                            console.log(`FCM token not available for user: ${user._id}`);
                        }
                    }
                });
            })
            .catch(err => {
                console.error('Error fetching users:', err);
            });
        res.json({ status: 'ok', trip: populatedTrip });
    } catch (error) {
        console.log(error);
        res.json({ status: 'error', msg: error });
    }
});
app.get('/get-trips/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const trips = await Trip.find({ travellers: { $elemMatch: { $eq: id } } }).populate('travellers', 'picUrl username')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });
        res.json({ trips: trips })
    } catch (error) {
        console.log(error)
        res.json({ error })
    }

})
app.get('/:tripId', async (req, res) => {
    const { tripId } = req.params;

    try {
        const trip = await Trip.findById(tripId)
            .populate('travellers', 'picUrl username')
            .populate('createdBy', 'picUrl username')
            .populate({
                path: 'polls',
                populate: [
                    { path: 'creator', select: 'picUrl username' },
                ]
            })
            .populate({
                path: 'expenses',
                populate: [
                    { path: 'creator', select: 'picUrl username' },
                    { path: 'members.member', select: 'picUrl username' }
                ]
            });

        if (!trip) {
            return res.status(404).json({ status: 'error', message: 'Trip not found' });
        }

        res.status(200).json({ status: 'ok', data: trip });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

app.post('/add-expense', async (req, res) => {
    try {
        const { amount, description, creator, tripId, members } = req.body;
        var newMembers = members.map((mem) => {
            if (mem.member == creator)
                return {
                    ...mem,
                    paid: true
                }
            else return mem
        })
        const newExpense = {
            amount,
            trip: tripId,
            description,
            creator,
            members: newMembers
        }
        const expense = new Expense(newExpense)
        await expense.save()
        const trip = await Trip.findById(tripId)
        trip.expenses.push(expense._id)
        await trip.save()
        const users = members;
        users.forEach(user => {
            if (user.member != creator) {
                createAndEmitNotification(user.member, 'New Expense', `A new expense - ${description} has been added to ${trip.destination}`, 'expense', trip);
            }
        });
        res.json({ status: 'ok', data: expense })
    } catch (error) {
        res.json({ status: 'error', data: error })
        console.log(error)
    }
})

app.post('/:tripId/itinerary', async (req, res) => {
    const { tripId } = req.params;
    const { date, activities, mode, activityIndex, creator } = req.body;

    try {
        const trip = await Trip.findById(tripId);
        if (!trip) {
            return res.status(404).send('Trip not found');
        }
        if (mode == 'add') {
            let dateExists = false;

            trip.itinerary.forEach((item) => {
                const itemDate = new Date(item.date);
                if (itemDate.getTime() === new Date(date).getTime()) {
                    item.activities.push(activities);
                    dateExists = true;
                }
            });

            if (!dateExists) {
                console.log('Date not found');
            }
        }
        else if (mode == 'delete') {
            const itemDate = new Date(date).getTime();
            const initialLength = trip.itinerary.length;

            trip.itinerary = trip.itinerary.map(item => {
                const itineraryDate = new Date(item.date).getTime();
                if (itineraryDate === itemDate) {
                    item.activities.splice(activityIndex, 1)
                }
                return item;
            });

        }
        await trip.save();
        res.status(200).json({ data: trip.itinerary });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/:tripId/add-poll', async (req, res) => {
    const { tripId } = req.params
    try {
        const poll = new polls(req.body)
        await poll.save()
        const trip = await Trip.findById(tripId)
        if (!trip) {
            return res.status(404).send('Trip not found');
        }
        trip.polls.push(poll._id)
        await trip.save()
        const newPoll = await polls.findById(poll._id).populate('creator')
        const users = trip.travellers;
        users.forEach(user => {
            createAndEmitNotification(user.toString(), 'New Poll', `A new poll has been added to ${trip.destination}`, 'poll', trip);
        });

        res.json({ status: 'ok', data: newPoll })
    } catch (error) {
        res.json({ status: 'error', data: error })
    }
})

app.post('/delete-expense', async (req, res) => {
    try {
        const { id, tripid } = req.body;
        const trip = await Trip.findById(tripid).populate('travellers', 'picUrl username').populate('expenses')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });
        if (!trip) {
            res.json({ msg: 'trip not found!' })
        }
        trip.expenses = trip.expenses.filter(ex => (ex._id != id))
        const expense = await Expense.findByIdAndDelete(id)
        await trip.save()
        res.json({ status: 'ok' })
    }
    catch (error) {
        res.json({ status: 'error', error })
    }
})

app.put('/update-polls', async (req, res) => {
    try {
        const { pollId, user, optionIndex } = req.body;
        const updatedPoll = await polls.findById(pollId).populate('creator');

        const updatedOptions = updatedPoll.options.map((option, index) => {
            if (index === optionIndex) {
                if (option.chosenBy.some((us) => us._id === user._id)) {
                    return {
                        ...option,
                        chosenBy: option.chosenBy.filter((us) => us._id !== user._id),
                    };
                } else {
                    return {
                        ...option,
                        chosenBy: [...option.chosenBy, user],
                    };
                }
            } else {
                if (!updatedPoll.multipleChoice) {
                    return {
                        ...option,
                        chosenBy: option.chosenBy.filter((us) => us._id !== user._id),
                    };
                }
                return { ...option };
            }
        });

        updatedPoll.options = updatedOptions;
        await updatedPoll.save();

        res.json({ status: 'ok', data: updatedPoll });
    } catch (error) {
        res.json({ status: 'error', data: error });
        console.log(error);
    }
});


app.delete('/delete-poll', async (req, res) => {
    const { tripId, pollId } = req.body;

    try {
        const trip = await Trip.findById(tripId).populate('travellers', 'picUrl username').populate('polls').populate('expenses')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });
        if (!trip) {
            return res.status(404).json({ status: 'error', message: 'Trip not found' });
        }
        const poll = await polls.findByIdAndDelete(pollId)
        trip.polls = trip.polls.filter(poll => poll._id.toString() !== pollId);
        await trip.save();

        res.status(200).json({ status: 'ok', data: trip });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

app.put('/update-trip', async (req, res) => {
    const { tripId, destination, startDate, endDate, budget, travellers, admins, itinerary } = req.body;
    const newTravellers = travellers.map(user => user._id);
    try {
        const trip = await Trip.findById(tripId).populate('travellers', 'picUrl username')
            .populate('createdBy', 'username')
            .populate('polls')
            .populate({
                path: 'expenses',
                populate: [
                    { path: 'creator', select: 'picUrl username' },
                    { path: 'members.member', select: 'picUrl username' }
                ]
            });
        if (!trip) {
            return res.status(404).send('Trip not found');
        }
        const oldTravelers = trip.travellers.map(traveller => traveller._id.toString()); // Convert ObjectId to string for comparison

        for (const oldTravellerId of oldTravelers) {
            if (!newTravellers.includes(oldTravellerId)) {
                const user = await User.findById(oldTravellerId);
                if (user) {
                    createAndEmitNotification(user._id, 'Removed from trip', `You have been removed from ${trip.destination} by the admins`, 'trip', trip);
                    user.trips = user.trips.filter(trip => trip.toString() !== tripId.toString());
                    await user.save();
                }
            }
        }

        trip.destination = destination || trip.destination;
        trip.startDate = startDate || trip.startDate;
        trip.endDate = endDate || trip.endDate;
        trip.budget = budget || trip.budget;
        trip.travellers = travellers
        trip.admins = admins || trip.admins;
        trip.itinerary = itinerary?.length === 0 ? trip.itinerary : itinerary;
        // console.log(travellers)
        console.log(trip)
        const updatedTrip = await trip.save();

        for (const traveller of travellers) {
            const user = await User.findById(traveller._id);
            if (user && !user.trips.includes(tripId)) {
                createAndEmitNotification(user._id, 'New Trip', `You have been added to ${trip.destination}`, 'trip', trip);
                user.trips.push(tripId);
                await user.save();
            }
        }

        res.status(200).json({ status: 'ok', trip: updatedTrip });
    } catch (error) {
        console.error(error);
        res.status(500).json({ status: 'error', msg: error.message });
    }
});
app.delete('/delete-MatchData', async (req, res) => {
    try {
        const { userId } = req.body;
        const match = await Match.findOneAndDelete({ userId })
        const user = await User.findById(userId)
        user.rightSwipes = []
        user.save();
        res.json({ msg: 'deleted match' })

    } catch (error) {
        res.json({ msg: 'error deleting', error })
    }
})

app.get('/:tripId/balance/:userId', async (req, res) => {
    try {
        const { tripId, userId } = req.params;
        const expenses = await Expense.find({ trip: tripId }).populate('members.member creator');
        const userExpenses = expenses.map(expense => ({
            description: expense.description,
            amount: expense.amount,
            creator: expense.creator._id.toString(),
            members: expense.members.map(member => ({
                ...member._doc,
                member: member.member._id.toString(),
                isCurrentUser: member.member._id.toString() === userId
            }))
        }));

        let totalToReceive = 0;
        let totalToPay = 0;
        const balances = {};

        userExpenses.forEach(expense => {
            if (expense.creator === userId) {
                // If current user is the creator, they paid the total amount
                expense.members.forEach(member => {
                    if (member.member != userId && !member.paid) {
                        if (balances[member.member] < 0) {
                            totalToPay += balances[member.member]
                        }
                        balances[member.member] = (balances[member.member] || 0) + member.expense;
                        totalToReceive += balances[member.member];
                    }
                });
            } else {
                // If current user is not the creator, calculate their share
                expense.members.forEach(member => {
                    if (member.isCurrentUser && !member.paid) {
                        if (balances[expense.creator] > 0) {
                            totalToPay -= balances[expense.creator];
                            totalToReceive -= balances[expense.creator];
                        }
                        balances[expense.creator] = (balances[expense.creator] || 0) - member.expense;
                        totalToPay += member.expense;
                    }
                });
            }
        });

        const balanceDetails = await Promise.all(
            Object.keys(balances).map(async memberId => {
                const user = await User.findById(memberId);
                return {
                    memberId,
                    username: user.username,
                    balance: balances[memberId].toFixed(2)
                };
            })
        );

        res.json({ balanceDetails, totalToReceive, totalToPay });
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while calculating balances.' });
    }
});


app.post('/clear-dues', async (req, res) => {
    const { expenseIds, userId, selectedMemberId, BalanceAmount } = req.body
    try {
        const expenses = await Expense.find({
            _id: { $in: expenseIds },
            $or: [
                { creator: selectedMemberId, 'members.member': userId },
                { creator: userId, 'members.member': selectedMemberId }
            ]
        });

        const updates = expenses.map(expense => {
            let amount = 0;
            expense.members.forEach(member => {
                if ((expense.creator.equals(userId) && member.member.equals(selectedMemberId)) ||
                    (expense.creator.equals(selectedMemberId) && member.member.equals(userId))) {
                    member.paid = true;
                    amount = BalanceAmount;
                }
            });
            expense.activities.push({
                payer: userId,
                payee: selectedMemberId,
                amount: amount
            });
            return expense.save();
        });

        await Promise.all(updates);
        const user = await User.findById(userId)
        const user2 = await User.findById(selectedMemberId)
        res.json({ status: 'ok', message: 'Expenses marked as paid successfully' });
        createAndEmitNotification(selectedMemberId, 'Payment Done', `${user.username} paid you ₹${BalanceAmount}`, 'expense-pay')
        sendNotification(user2?.fcmToken, 'New Payment', `${user.username} paid you ₹${BalanceAmount}`)

    } catch (error) {
        console.error('Error marking expenses as paid:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

app.get('/expense/:expenseId', async (req, res) => {
    try {
        const expense = await Expense.findById(req.params.expenseId)
            .populate('creator', 'username picUrl')
            .populate('members.member', 'username picUrl')
            .populate('activities.payer', 'username')
            .populate('activities.payee', 'username');
        res.status(200).json(expense);
    } catch (error) {
        console.error('Error fetching expense:', error);
        res.status(500).json({ message: 'Server error' });
    }
});


module.exports = app;
