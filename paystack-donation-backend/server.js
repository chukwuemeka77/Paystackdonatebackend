const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const cors = require('cors');
require('dotenv').config();

const Donation = require('./models/Donation');

const app = express();
const PORT = process.env.PORT || 3000;
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

app.use(cors());
app.use(express.json({ verify: (req,res,buf)=> req.rawBody = buf }));

mongoose.connect(process.env.MONGO_URI, { useNewUrlParser:true, useUnifiedTopology:true })
.then(()=> console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection failed:', err));

app.get('/donations/total', async (req,res)=>{
  try {
    const result = await Donation.aggregate([{ $group: { _id:null, total: {$sum:"$amount"} } }]);
    const total = result[0]?.total || 0;
    res.json({ total });
  } catch(err){
    console.error(err);
    res.status(500).json({ error:"Failed to fetch total" });
  }
});

function verifySignature(req){
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET_KEY)
                     .update(req.rawBody)
                     .digest('hex');
  return hash === req.headers['x-paystack-signature'];
}

app.post('/donations/webhook', async (req,res)=>{
  if(!verifySignature(req)) return res.status(401).send('Invalid signature');

  const event = req.body;
  if(event.event === 'charge.success'){
    const reference = event.data.reference;
    const amountNaira = event.data.amount / 100;

    try{
      const exists = await Donation.findOne({ reference });
      if(!exists){
        await Donation.create({ amount: amountNaira, reference, status:"successful" });
        console.log(`✅ Donation confirmed: ${reference}`);
      } else {
        console.log(`ℹ️ Duplicate reference ignored: ${reference}`);
      }
    } catch(err){
      console.error('❌ Error processing donation:', err);
    }
  }
  res.sendStatus(200);
});

app.listen(PORT, ()=> console.log(`🚀 Server running on port ${PORT}`));
