const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 4000;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    // "http://localhost:5173",
    "https://building-management-39823.web.app",
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
    const couponCollection = client.db("cuponDB").collection("couponCollection");
    const bookedApartments = client.db("bookDB").collection("bookedApartments");
    const userCollection = client.db("AppartmentUser").collection("users");
    const announcements = client.db("Announce").collection("announcements")
    const wishlistCollection = client.db("AppermentDB").collection("wishlistCollection")
    // Define the users collection

    //payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ['card']
      });
      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })
    //jwt token
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token })
    })

    // middlewares
    // Middleware to verify token
    const verifyToken = (req, res, next) => {
      // Check if the authorization header is present
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'Unauthorized access' });
      }
    
      const authHeader = req.headers.authorization;
      const token = authHeader.split(' ')[1]; // Extract the token part
    
      // Check if the token is present after splitting
      if (!token) {
        return res.status(401).send({ message: 'Invalid token format' });
      }
    
      // Verify the token using JWT
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'Unauthorized access' });
        }
        req.decoded = decoded; // Save decoded data for further use
        next(); // Proceed to the next middleware
      });
    };
    

    //use verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
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

    app.post("/users", async (req, res) => {
      const data = req.body;

      // Check if the email already exists
      const existingUser = await userCollection.findOne({ email: data.email }); // Corrected

      if (existingUser) {
        res.send({ message: "Login Success" });
      } else {
        const doc = {
          name: data.name,
          email: data.email,
          role: "",
        };
        await userCollection.insertOne(doc); // Corrected
        res.send({ message: "Registration Success" });
      }
    });


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
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result)
    })

    // announcements
    app.get("/announcements", async (req, res) => {
      const result = (await announcements.find().toArray()).reverse();
      res.send(result)
    })
    app.post("/announcements", async (req, res) => {
      const body = req.body;
      const result = await announcements.insertOne(body);
      res.send(result);
    });
    app.get("/usersRole", async (req, res) => {
      const query = req.query;

      if (!query.email) {
        return res.status(400).send({ message: "Unauthorized" });
      }

      if (req?.query) {
        const result = await userCollection.findOne({ email: query.email });
        res.send(result);
      } else {
        res.status(404).send({ message: "User not found" });
      }
    });

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
        const result = (await couponCollection.find().toArray()).reverse();
        res.send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to fetch coupons." });
      }
    });

    // Booked apartments endpoint

    app.get("/bookedApartments/:email", verifyAdmin, verifyToken,  async (req, res) => {
      try {
        const user = req.params.email;
        const filter = { examineeEmail: user };
        const result = await wishlistCollection.find(filter).toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send("Error fetching user's apartments");
      }
    }); 
    

    

    app.patch("/bookedApartments/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        // Convert string id to ObjectId
        const filter = { _id: new ObjectId(id) };
        const apartment = await wishlistCollection.findOne(filter);

        if (!apartment) {
          return res.status(404).send({ status: 404, message: "Apartment not found" });
        }

        const userEmail = apartment.userInfo.email;
        const filter2 = { email: userEmail };

        // Get today's date
        const today = new Date();
        const day = String(today.getDate()).padStart(2, "0");
        const month = String(today.getMonth() + 1).padStart(2, "0");
        const year = today.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;

        // Prepare the update document
        const updateDoc = {
          $set: {
            status: status || "checked", // Set status to "checked" or use provided status
            accept_date: formattedDate,
          },
        };

        // Update the apartment document
        await wishlistCollection.updateOne(filter, updateDoc);

        res.send({ status: 200, message: "Agreement Acceptance Successful" });
      } catch (error) {
        console.error("Error updating the apartment:", error);
        res.status(500).send({ status: 500, message: "Something went wrong! Please try later." });
      }
    });
    app.get("/bookedApartments", async (req, res) => {
      const bookedApartments = req.body;
      const result = await wishlistCollection.find().toArray();
      res.send(result);
    })


    app.post("/bookedApartments", async (req, res) => {
      const apartmentInfo = req.body;
    
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const requestDate = `${day}/${month}/${year}`;
    
      const doc = {
        apartment_id: apartmentInfo.apartment_id,
        userInfo: apartmentInfo.userInfo,
        status: "pending",
        request_date: requestDate,
      };
    
      const userEmail = apartmentInfo.userInfo.email;
    
      const query = { "userInfo.email": userEmail };
    
      // Corrected to use userCollection
      const userRole = await userCollection.findOne({ email: userEmail });
    
      if (userRole.role === "admin") {
        res.send({ message: "It's not available for you. Sorry!" });
      } else {
        const isExist = await wishlistCollection.findOne(query);
    
        if (isExist) {
          res.send({ message: "User has already booked an apartment." });
        } else {
          await wishlistCollection.insertOne(doc);
          res.send({ status: 200, message: "Apartment booking success" });
        }
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
