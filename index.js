const express = require('express');
const app = express();
const cors = require('cors');
require('dotenv').config();
const port = process.env.PORT || 4000;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://building-management-39823.web.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));

// app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
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
    // await client.connect();

    const apartmentCollection = client.db("AppermentDB").collection("appermentCollection");
    const coponCollection = client.db("cuponDB").collection("couponCollection");
    const bookedApartments = client.db("bookDB").collection("bookedApartments");

    //apartment
    app.get('/apartment', async (req, res) => {
      try {
        const result = await apartmentCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch apartments." });
      }
    });

    //coupon
    app.get('/coupon', async (req, res) => {
      try {
        const result = (await coponCollection.find().toArray()).reverse();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch coupons." });
      }
    });

    //booked Apartment
    app.get('/bookedApartments', async (req, res) => {
      try {
        const query = { status: "pending" };
        const pendingApartments = await bookedApartments.find(query).toArray();

        if (pendingApartments.length > 0) {
          const apartmentDetails = [];

          for (const pendingApartment of pendingApartments) {
            const apartmentId = pendingApartment.apartment_id;
            const apartmentQuery = { _id: new ObjectId(apartmentId) };
            const result = await apartmentCollection.findOne(apartmentQuery); // Fixed collection name
            if (result) {
              apartmentDetails.push({
                _id: pendingApartment._id,
                name: pendingApartment.userInfo.name,
                email: pendingApartment.userInfo.email,
                floor_no: result.floor_no,
                block_name: result.block_name,
                apartment_no: result.apartment_no,
                request_date: pendingApartment.request_date,
                rent: result.rent,
              });
            }
          }
          res.send(apartmentDetails);
        } else {
          res.send([]);
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch booked apartments." });
      }
    });

    app.get("/bookedApartments/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { "userInfo.email": email };

        const booked_apartment = await bookedApartments.findOne(query);

        if (booked_apartment) {
          const apartmentId = booked_apartment.apartment_id;

          const apartmentQuery = { _id: new ObjectId(apartmentId) };

          const apartmentInfo = await apartmentCollection.findOne(apartmentQuery); // Fixed collection name

          if (apartmentInfo) {
            const result = {
              _id: booked_apartment._id,
              image: apartmentInfo.image,
              block_name: apartmentInfo.block_name,
              apartment_no: apartmentInfo.apartment_no,
              floor_no: apartmentInfo.floor_no,
              rent: apartmentInfo.rent,
              status: booked_apartment.status,
              request_date: booked_apartment.request_date,
            };

            res.status(200).send(result);
          } else {
            res.status(404).send({ error: "Apartment not found." });
          }
        } else {
          res.status(404).send({ error: "No booking found for this email." });
        }
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch booked apartment." });
      }
    });

    app.post('/bookedApartments', async (req, res) => {
      try {
        const bookApartment = req.body;
        const result = await bookedApartments.insertOne(bookApartment);
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to book the apartment." });
      }
    });

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
  res.send('luxtower is running');
});

app.listen(port, () => {
  console.log(`luxtower is running on port ${port}`);
});
