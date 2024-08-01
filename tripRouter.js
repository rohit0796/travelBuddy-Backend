const express = require('express');
const app = express.Router();
const User = require('./models/UserSchema');
const Trip = require('./models/TripSchema');
const Notifications = require('./models/Notifications');
const { getIo } = require('./socket');
const createAndEmitNotification = async (userId, title, message, source) => {
    const io = getIo()
    const notification = await Notifications({ userId, title, message, source });
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
            admins
        });
        await trip.save();

        const populatedTrip = await Trip.findById(trip._id).populate('travellers', 'picUrl username');

        for (const user of travellers) {
            await User.findByIdAndUpdate(user._id, { $push: { trips: trip._id } });
        }
        const users = trip.travellers;
        users.forEach(user => {
            if (user._id !== currentUser._id) {
                createAndEmitNotification(user._id, 'New Trip', `${trip.destination} has been created`, 'trip');
            }
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
            .populate('travellers', 'picUrl username') // Populate travellers
            .populate('expenses.creator', 'picUrl username'); // Populate creator if needed

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
        const newExpense = {
            amount,
            description,
            creator,
            members
        }
        const trip = await Trip.findByIdAndUpdate(tripId, { $push: { expenses: newExpense } }, { new: true }).populate('travellers', 'picUrl username')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });
        const users = trip.travellers;
        users.forEach(user => {
            if (user._id !== creator._id) {
                createAndEmitNotification(user._id, 'New Expense', `A new expense has been added to ${trip.destination}`, 'expense');
            }
        });
        res.json({ status: 'ok', data: trip })
    } catch (error) {
        res.json({ status: 'error', data: error })
        console.log(error)
    }
})

app.post('/:tripId/itinerary', async (req, res) => {
    const { tripId } = req.params;
    const { date, activities, mode, activityIndex } = req.body;

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
        const trip = await Trip.findById(tripId).populate('travellers', 'picUrl username')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });
        if (!trip) {
            return res.status(404).send('Trip not found');
        }
        trip.polls.push(req.body)
        await trip.save()

        const users = trip.travellers;
        users.forEach(user => {
            createAndEmitNotification(user._id.toString(), 'New Poll', `A new poll has been added to ${trip.destination}`, 'poll');
        });

        res.json({ status: 'ok', data: trip.polls })
    } catch (error) {
        console.log(error)
    }
})

app.post('/delete-expense', async (req, res) => {
    const { id, tripid } = req.body;
    const trip = await Trip.findById(tripid).populate('travellers', 'picUrl username')
        .populate({
            path: 'expenses.creator',
            select: 'picUrl username'
        });
    if (!trip) {
        res.json({ msg: 'trip not found!' })
    }
    trip.expenses = trip.expenses.filter(ex => (ex._id != id))
    await trip.save()
    res.json({ trip })
})
// Add this route in your backend server file

app.put('/update-polls', async (req, res) => {
    try {
        const { tripId, polls } = req.body;

        // Find the trip by ID and update the polls
        const updatedTrip = await Trip.findByIdAndUpdate(
            tripId,
            { polls: polls },
            { new: true }
        ).populate('travellers', 'picUrl username')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });

        res.json({ status: 'ok', data: updatedTrip });
    } catch (error) {
        res.json({ status: 'error', data: error });
        console.log(error);
    }
});

app.delete('/delete-poll', async (req, res) => {
    const { tripId, pollId } = req.body;

    try {
        const trip = await Trip.findById(tripId).populate('travellers', 'picUrl username')
            .populate({
                path: 'expenses.creator',
                select: 'picUrl username'
            });
        if (!trip) {
            return res.status(404).json({ status: 'error', message: 'Trip not found' });
        }

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
        const trip = await Trip.findById(tripId);
        if (!trip) {
            return res.status(404).send('Trip not found');
        }
        const oldTravelers = trip.travellers.map(traveller => traveller.toString()); // Convert ObjectId to string for comparison

        for (const oldTravellerId of oldTravelers) {
            if (!newTravellers.includes(oldTravellerId)) {
                const user = await User.findById(oldTravellerId);
                if (user) {
                    createAndEmitNotification(user._id, 'Removed from trip', `You have been removed from ${trip.destination} by the admins`, 'trip');
                    user.trips = user.trips.filter(trip => trip.toString() !== tripId.toString());
                    await user.save();
                }
            }
        }

        trip.destination = destination || trip.destination;
        trip.startDate = startDate || trip.startDate;
        trip.endDate = endDate || trip.endDate;
        trip.budget = budget || trip.budget;
        trip.travellers = travellers || trip.travellers;
        trip.admins = admins || trip.admins;
        trip.itinerary = itinerary?.length === 0 ? trip.itinerary : itinerary;

        const updatedTrip = await trip.save();

        for (const traveller of travellers) {
            const user = await User.findById(traveller._id);
            if (user && !user.trips.includes(tripId)) {
                createAndEmitNotification(user._id, 'New Trip', `You have been added to ${trip.destination}`, 'trip');
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


module.exports = app;
