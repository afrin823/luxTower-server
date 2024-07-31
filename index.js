const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

//------------------------------

const { MongoClient, ServerApiVersion } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vadwj9m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const apartmentCollection = client.db("AppermentDB").collection("appermentCollection");
    const coponCollection = client.db("cuponDB").collection("couponCollection");

    //apartment
    app.get('/apartment', async(req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);
    })
    //coupon
    app.get('/coupon', async(req, res) => {
      const result = await coponCollection.find().toArray();
      res.send(result);
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//---------------------------------

// Routes
app.get('/', (req, res) => {
    res.send('luxtower is running')
});


app.listen(port, () => {
    console.log(`luxtower is running on port ${port}`)
});
