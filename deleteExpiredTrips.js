const cron = require('node-cron');
const mongoose = require('mongoose');
const TravelPlan = require('./models/MatchListSchema');

// Function to delete expired trips
const deleteExpiredTrips = async () => {
    try {
        const currentDate = new Date();
        const result = await TravelPlan.deleteMany({ endDate: { $lt: currentDate } });
        console.log(`Deleted ${result.deletedCount} expired trips`);
    } catch (error) {
        console.error('Error deleting expired trips:', error);
    }
};

// Schedule the task to run at midnight every day
cron.schedule('0 0 * * *', deleteExpiredTrips);
