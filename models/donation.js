const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  donorName: { type: String, required:true },
  donorEmail: { type: String, required:true },
  amount: { type: Number, required:true },
  reference: { type: String, required:true, unique:true },
  status: { type: String, enum:['pending','successful'], default:'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Donation', donationSchema);
