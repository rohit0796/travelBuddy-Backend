const mongoose = require('mongoose');

const TravelPlanSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    destination: String,
    startDate: Date,
    endDate: Date,
    budget: Number,
});

module.exports = mongoose.model('TravelPlan', TravelPlanSchema);
