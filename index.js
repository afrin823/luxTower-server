const express = require('express');
const app = express();
const cors = require('cors');
const SSLCommerzPayment = require('sslcommerz-lts')
const jwt = require('jsonwebtoken')
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 4000;

// Middleware
const corsOptions = {
  origin: [
    "http://localhost:5173",
    "https://luxtower.netlify.app",
    
  ],
  credentials: true,
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.vadwj9m.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const store_id = process.env.STORE_ID
const store_passwd = process.env.SOTRE_PASS
const is_live = false //true for live, false for sandbox

async function run() {
  try {
   

    const apartmentCollection = client.db("AppermentDB").collection("appermentCollection");
    const couponCollection = client.db("cuponDB").collection("couponCollection");
    const bookedApartments = client.db("bookDB").collection("bookedApartments");
    const userCollection = client.db("AppartmentUser").collection("users");
    const announcements = client.db("Announce").collection("announcements");
    const wishlistCollection = client.db("AppermentDB").collection("wishlistCollection");
    const orderCollection = client.db("order").collection("orderCollection");

    // Payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const tran_id = new ObjectId().toString();

      const data = {
        total_amount: paymentInfo.apartmentRent,
        currency: 'BDT',
        tran_id: tran_id, // use unique tran_id for each api call
        success_url: `https://buliding-management-server.vercel.app/payment/success/${tran_id}`,
        fail_url: `https://buliding-management-server.vercel.app/payment/fail-payment/${tran_id}`,
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: 'Computer.',
        product_category: 'Electronic',
        product_profile: 'general',
        cus_name: paymentInfo.userInfo.name,
        cus_email: paymentInfo.userInfo.email,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: '01711111111',
        cus_fax: '01711111111',
        ship_name: paymentInfo.userInfo.name,
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
      };
      console.log(data);
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
      sslcz.init(data).then(apiResponse => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.send({ url: GatewayPageURL })
        console.log('Redirecting to: ', GatewayPageURL)
        const finalPayment = {
          paymentInfo,
          paymentStatus: false,
          tranjectionId: tran_id,
        };
        const result = orderCollection.insertOne(finalPayment)
      });
    })

    app.post('/payment/success/:tranId', async (req, res) => {
      console.log(req.params.tranId);
      const result = await orderCollection.updateOne({ tranjectionId: req.params.tranId }, {
        $set: {
          paymentStatus: true,
        },
      }
      );
      if (result.modifiedCount > 0) {
        res.redirect(`https://luxtower.netlify.app/dashboard/success-payment/${req.params.tranId}`)
      }
    });
    app.post('/payment/fail/:tranId', async (req, res) => {
      const result = await orderCollection.deleteOne({tranjectionId: req.params.tranId
      });
      if (result.deletedCount) {
        res.redirect(`https://luxtower.netlify.app/dashboard/fail-payment/${req.params.tranId}`)
      };
    })

        app.get('/payments/:email', async (req, res) => {
      // const query = { email: req.params.email };
      const result = await orderCollection.find().toArray();
      res.send(result);
  });
  

    // JWT token generation
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    });

        // middlewares 
    const verifyAdmin = async (req, res, next) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };
    
    // Users related API
    app.get('/users',  async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });


    app.post("/users", async (req, res) => {
      const data = req.body;

      // Check if the email already exists
      const existingUser = await userCollection.findOne({ email: data.email });

      if (existingUser) {
        res.send({ message: "Login Success" });
      } else {
        const doc = {
          name: data.name,
          email: data.email,
          role: "",
        };
        await userCollection.insertOne(doc);
        res.send({ message: "Registration Success" });
      }
    });

    app.patch('/users/admin/:id', verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          role: "admin"
        }
      };
      const result = await userCollection.updateOne(filter, updateDoc);
      res.send(result);
    });


    // Delete users
    app.delete('/users/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //members
    app.get("/members", async (req, res) => {
      const query = { role: "member" };
      const result = (await userCollection.find(query).toArray()).reverse();
      res.send(result);
    });

    app.put("/members/:id", async (req, res) => {
      const id = req.params;
      const filter = { _id: new ObjectId(id) };
      const doc = {
        $set: {
          role: "",
        },
      };
      await userCollection.updateOne(filter, doc);
      res.send({ message: "Member successfully removed." });
    });

    // Announcements
    app.get("/announcements", async (req, res) => {
      const result = (await announcements.find().toArray()).reverse();
      res.send(result);
    });

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
      const result = await userCollection.findOne({ email: query.email });
      res.send(result);
    });

    // Apartments endpoint
    app.get('/apartment', async (req, res) => {
      const result = await apartmentCollection.find().toArray();
      res.send(result);

    });

    // Coupons endpoint
    app.get('/coupon', async (req, res) => {
      const result = (await couponCollection.find().toArray()).reverse();
      res.send(result);

    });

    // Booked apartments endpoints
    app.get("/bookedApartments/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const filter = { email: email };
      const result = await wishlistCollection.findOne(filter);
      console.log(result);
      res.send(result);

    });

    // app.get("/bookedApartments/:email", async (req, res) => {
    //   const email = req.params.email;
    //   const query = { "userInfo.email": email };

    //   const booked_apartment = await wishlistCollection.findOne(query);

    //   if (booked_apartment) {
    //     const apartmentId = booked_apartment._id;

    //     const apartmentQuery = { _id: new ObjectId(apartmentId) };

    //     const apartmentInfo = await apartmentCollection.findOne(apartmentQuery);

    //     const result = {
    //       _id: apartmentInfo._id,
    //       image: apartmentInfo.image,
    //       block_name: apartmentInfo.block_name,
    //       apartment_no: apartmentInfo.apartment_no,
    //       floor_no: apartmentInfo.floor_no,
    //       rent: apartmentInfo.rent,
    //       status: booked_apartment.status,
    //       // request_date: booked_apartment.request_date,
    //     };

    //     res.status(200).send(result);
    //   } else {
    //     res.send("You do not agreement to book.");
    //   }
    // });


    app.patch("/bookedApartments/:id", async (req, res) => {
      const id = req.params.id;
      const { status } = req.body;
      const filter = { _id: new ObjectId(id) };
      const apartment = await wishlistCollection.findOne(filter);

      if (!apartment) {
        return res.status(404).send({ status: 404, message: "Apartment not found" });
      }

      const userEmail = apartment.userInfo.email;
      const filter2 = { email: userEmail };

      const today = new Date();
      const day = String(today.getDate()).padStart(2, "0");
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const year = today.getFullYear();
      const formattedDate = `${day}/${month}/${year}`;

      const updateDoc = {
        $set: {
          status: status || "checked",
          accept_date: formattedDate,
        },
      };

      await wishlistCollection.updateOne(filter, updateDoc);
      res.send({ status: 200, message: "Agreement Acceptance Successful" });

    });

    app.get("/bookedApartments", async (req, res) => {
      const bookedApartments = req.body;
      const result = await wishlistCollection.find().toArray();
      res.send(result);
    });

    app.post("/bookedApartments", async (req, res) => {
      const apartmentInfo = req.body;
      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const requestDate = `${day}/${month}/${year}`;

      const doc = {
        ...apartmentInfo,
        status: "pending",
        request_date: requestDate,

      };

      const userEmail = apartmentInfo.email;

      const userRole = await userCollection.findOne({ email: userEmail });

      if (userRole.role === "admin") {
        res.send({ message: "It's not available for you. Sorry!" });
      } else {
        const isExist = await wishlistCollection.findOne({ email: userEmail });

        if (isExist) {
          res.send({ message: "User has already booked an apartment." });
        } else {
          await wishlistCollection.insertOne(doc);
          res.send({ status: 200, message: "Apartment booking success" });
        }
      }
    });

  
  } finally {
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('luxtower is running');
});

app.listen(port, () => {
  console.log(`luxtower is running on port ${port}`);
});