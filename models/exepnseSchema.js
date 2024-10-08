const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ExpenseSchema = new Schema({
    description: String,
    trip: { type: Schema.Types.ObjectId, ref: 'Trip' },
    amount: Number,
    members: [{
        member: { type: Schema.Types.ObjectId, ref: 'User' },
        expense: Number,
        paid: {
            type: Boolean,
            default: false
        },
    }],
    creator: { type: Schema.Types.ObjectId, ref: 'User' },
    activities: [{
        payer: { type: Schema.Types.ObjectId, ref: 'User' },
        payee: { type: Schema.Types.ObjectId, ref: 'User' },
        amount: Number,
        date: { type: Date, default: Date.now }
    }],
    createdAt: { type: Date, default: Date.now }
});

const Expense = mongoose.model('expenses', ExpenseSchema);
module.exports = Expense