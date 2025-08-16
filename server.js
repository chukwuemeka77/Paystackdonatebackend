// server.js
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const Donation = require('./models/Donation');

const app = express();
app.use(cors());
app.use(express.json({
  verify: (req,res,buf) => { req.rawBody = buf; }
}));

const PORT = process.env.PORT || 3000;

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser:true,
  useUnifiedTopology:true
})
.then(()=>console.log('✅ MongoDB connected'))
.catch(err=>console.error('❌ MongoDB connection failed:', err));

// Endpoint: create payment reference
app.post('/donate/paystack', async (req,res) => {
  const { donorName, donorEmail, amount } = req.body;
  if(!donorName || !donorEmail || !amount) return res.status(400).json({error:'All fields required'});

  try {
    const reference = 'PS_'+Date.now(); // unique reference
    await Donation.create({ donorName, donorEmail, amount, reference });
    res.json({
      reference,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY
    });
  } catch(err){
    console.error(err);
    res.status(500).json({error:'Server error'});
  }
});

// Endpoint: total donations
app.get('/donations/total', async (req,res)=>{
  try {
    const result = await Donation.aggregate([{ $group: { _id:null, total:{ $sum:"$amount" }}}]);
    const total = result[0]?.total || 0;
    res.json({ total });
  } catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to fetch total'});
  }
});

// Endpoint: Paystack webhook
app.post('/donations/webhook', async (req,res)=>{
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
                     .update(req.rawBody)
                     .digest('hex');

  if(hash !== req.headers['x-paystack-signature']){
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;
  if(event.event === 'charge.success'){
    const reference = event.data.reference;
    const donation = await Donation.findOne({reference});
    if(donation) donation.status = 'successful';
    await donation.save();
    console.log(`✅ Donation confirmed: ${reference}`);
  }

  res.sendStatus(200);
});

// Endpoint: fetch all donations (for admin)
app.get('/dashboard', async (req,res)=>{
  try {
    const donations = await Donation.find().sort({createdAt:-1});
    res.json(donations);
  } catch(err){
    console.error(err);
    res.status(500).json({error:'Failed to fetch donations'});
  }
});

app.listen(PORT, ()=>console.log(`🚀 Server running on port ${PORT}`));
