const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const port = process.env.PORT || 4000;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    // "http://localhost:5173",
    // "https://building-management-39823.web.app",
    // "https://luxtower.netlify.app",
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
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
    await client.connect(); // Ensure MongoDB client connects

    const apartmentCollection = client.db("AppermentDB").collection("appermentCollection"); // Corrected collection name
    const coponCollection = client.db("cuponDB").collection("couponCollection");
    const bookedApartments = client.db("bookDB").collection("bookedApartments");
    const userCollection = client.db("AppartmentUser").collection("users"); // Define the users collection

    //jwt token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    })

    // middlewares
    // Middleware to verify token
    const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }

      const token = req.headers.authorization.split(' ')[1]; // Corrected from 'res.headers' to 'req.headers'

      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    //use verify admin after verify token
    const verifyAdmin = async(req, res, next) => {
      const email = req.params.email;
      const query = {email: email};
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if(!isAdmin){
        return res.status(403).send({message: 'forbidden access'})
      }
      next();
    }


      //users related api
      app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
        const result = await userCollection.find().toArray();
        res.send(result)
      });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin })
    })

    app.post('/users', async (req, res) => {
      const user = req.body;
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query);

      if (existingUser) {
        return res.send({ message: 'user already exist', insertedId: null })
      }

      const result = await userCollection.insertOne(user);
      res.send(result)
    })

    app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) }
      const updateDoc = {
        $set: {
          role: "admin"
        }
      }
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result)
    })
    //delete users
    app.delete('/users/:id',verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result)
    })

    // Apartments endpoint
    app.get('/apartment', async (req, res) => {
      try {
        const result = await apartmentCollection.find().toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch apartments." });
      }
    });

    // Coupons endpoint
    app.get('/coupon', async (req, res) => {
      try {
        const result = (await coponCollection.find().toArray()).reverse();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch coupons." });
      }
    });


 
    // Booked apartments endpoint
    app.get('/bookedApartments', async (req, res) => {
      try {
        const query = { status: "pending" };
        const pendingApartments = await bookedApartments.find(query).toArray();

        if (pendingApartments.length > 0) {
          const apartmentIds = pendingApartments.map(p => new ObjectId(p.apartment_id));
          const apartments = await bookedApartments.find({ _id: { $in: apartmentIds } }).toArray();
          const apartmentMap = new Map(apartments.map(a => [a._id.toString(), a]));

          const apartmentDetails = pendingApartments.map(pendingApartment => {
            const apartment = apartmentMap.get(pendingApartment.apartment_id.toString());
            if (apartment) {
              return {
                _id: pendingApartment._id,
                floorNo: apartment.floorNo,
                blockName: apartment.blockName,
                apartmentNo: apartment.apartmentNo,
                request_date: pendingApartment.request_date,
                rent: apartment.rent,
              };
            }
            return null;
          }).filter(detail => detail !== null);

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
          const apartmentInfo = await apartmentCollection.findOne(apartmentQuery);

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

    app.patch("/bookedApartments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const body = req.body;
        const userRole = body?.role === "member" ? "member" : "";

        const filter = { _id: new ObjectId(id) };
        const apartment = await bookedApartments.findOne(filter);

        const userEmail = apartment.userInfo.email;
        const filter2 = { email: userEmail };

        const today = new Date();
        const day = String(today.getDate()).padStart(2, "0");
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const year = today.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;

        const updateDoc = {
          $set: {
            status: "checked",
            accept_date: userRole === "member" ? formattedDate : "rejected",
          },
        };
        const updateDoc2 = {
          $set: {
            role: userRole,
          },
        };

        await bookedApartments.updateMany(filter, updateDoc);
        await users.updateOne(filter2, updateDoc2);

        res.send({ status: 200, message: "Agreement Accept Success" });
      } catch (error) {
        res.send({ status: 400, message: "Something went wrong! try later." });
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

// Routes
app.get('/', (req, res) => {
  res.send('luxtower is running');
});

app.listen(port, () => {
  console.log(`luxtower is running on port ${port}`);
});
