require("dotenv").config();
const express = require("express");
const multer = require("multer"); // used for file upload
const cors = require("cors");
const { MongoClient } = require("mongodb");
const csvtojsonV2 = require("csvtojson/v2");
const csv = require("csvtojson"); // used for convert csv file to json
const app = express();
var fs = require("fs");
app.use(cors());
app.use(express.static("public"));

// creating mongoDB client
const uri = process.env.DB;
const client = new MongoClient(uri);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

// Middleware for uploading csv file
const upload = multer({ storage: storage });
app.post("/upload", upload.single("file"), function (req, res) {
  const csvFilePath = "./public/" + req.file.filename;
  try {
  // Conversion of CSV file to Json
    csv()
      .fromFile(csvFilePath)
      .then((jsonObj) => {
        const lists = jsonObj.map((el) => {
          return {
            ProductName: el.Name,
            Description: el["Short description"],
            ProductImage: el.Images,
            RegularPrice: el["Regular price"],
            SellingPrice: el["Sale price"],
            Category: el.Categories,
          };
        });

        pushMultipleEntry(lists);
        // Deleting csv file
        fs.unlinkSync(csvFilePath);
        return res.status(200).json("OK");
      });
  } catch (e) {
    res.status(500).json(e);
  }
});

async function pushMultipleEntry(argument) {
  try {
    await client.connect();
    await createMultipleListings(client, [...argument]);
  } catch (e) {
    console.error(e);
  }
}

// Push all new items in the DB
async function createMultipleListings(client, newListings) {
  const result = await client
    .db("bulk_listing")
    .collection("items_list")
    .insertMany(newListings);
  console.log(`${result.insertedCount} new listings created`);
}

// Get count request for total items in DB
app.get("/count", async (req, res) => {
  let count = await client
    .db("bulk_listing")
    .collection("items_list")
    .countDocuments();
  res.json(count);
});

// Get items request
app.get("/items", paginatedResults(), (req, res) => {
  res.json(res.paginatedResults);
});

// Middleware for getting paginated result
function paginatedResults() {
  return async (req, res, next) => {
    const page = parseInt(req.query.page);
    const limit = parseInt(req.query.limit);

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;

    const results = {};
    if (
      endIndex <
      (await client
        .db("bulk_listing")
        .collection("items_list")
        .countDocuments())
    ) {
      results.next = {
        page: page + 1,
        limit: limit,
      };
    }

    if (startIndex > 0) {
      results.previous = {
        page: page - 1,
        limit: limit,
      };
    }
    try {
      await client.connect();
      results.results = await client
        .db("bulk_listing")
        .collection("items_list")
        .find()
        .limit(limit)
        .skip(startIndex)
        .toArray();
      console.log("Fetched " + results.results.length);
      res.paginatedResults = results;
      next();
    } catch (e) {
      res.status(500).json({ message: e.message });
    }
  };
}

const PORT = process.env.PORT || 8181;

app.listen(PORT, () => {
  console.log("App is running on port 8181");
});
