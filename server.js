require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json({ verify: (req, res, buf) => req.rawBody = buf }));

const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection failed:', err));

// Donation model
const donationSchema = new mongoose.Schema({
  donorName: String,
  donorEmail: String,
  amount: { type: Number, required: true },
  reference: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now }
});
const Donation = mongoose.model('Donation', donationSchema);

// Initialize payment
app.post('/donations/init', (req, res) => {
  const { donorName, donorEmail, amount } = req.body;
  if (!amount || !donorEmail) return res.status(400).json({ error: 'Amount and email required' });

  const reference = 'donor_' + Date.now() + '_' + Math.floor(Math.random()*1000);
  res.json({ 
    publicKey: process.env.PAYSTACK_PUBLIC_KEY,
    reference
  });
});

// Webhook to confirm payment
function verifySignature(req) {
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
    .update(req.rawBody)
    .digest('hex');
  return hash === req.headers['x-paystack-signature'];
}

app.post('/donations/webhook', async (req, res) => {
  if (!verifySignature(req)) return res.status(401).send('Invalid signature');

  const event = req.body;
  if (event.event === 'charge.success') {
    const amountNaira = event.data.amount / 100;
    const reference = event.data.reference;

    try {
      const exists = await Donation.findOne({ reference });
      if (!exists) {
        await Donation.create({ 
          donorName: event.data.customer?.first_name || 'Anonymous',
          donorEmail: event.data.customer?.email,
          amount: amountNaira, 
          reference 
        });
        console.log(`✅ Donation received: ₦${amountNaira}`);
      } else {
        console.log(`ℹ️ Duplicate reference ignored: ${reference}`);
      }
    } catch(err) {
      console.error('❌ Error saving donation:', err);
    }
  }
  res.sendStatus(200);
});

// Get total donations
app.get('/donations/total', async (req, res) => {
  try {
    const result = await Donation.aggregate([{ $group: {_id:null, total: { $sum:"$amount"}} }]);
    const total = result[0]?.total || 0;
    res.json({ total });
  } catch(err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch total donations' });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
