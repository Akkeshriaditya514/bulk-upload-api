require("dotenv").config();
const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { MongoClient } = require("mongodb");
const csvtojsonV2 = require("csvtojson/v2");
const csv = require("csvtojson");
const app = express();
var fs = require("fs");
app.use(cors());
app.use(express.static("public"));
const uri = process.env.DB;
const client = new MongoClient(uri);

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public");
  },
  filename: function (req, file, cb) {
    // const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

app.post("/upload", upload.single("file"), function (req, res) {
  const csvFilePath = "./public/" + req.file.filename;
  // console.log(csvFilePath);
  try {
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
  } finally {
    // await client.close();
  }
}

async function createMultipleListings(client, newListings) {
  const result = await client
    .db("bulk_listing")
    .collection("items_list")
    .insertMany(newListings);
  console.log(`${result.insertedCount} new listings created`);
  // console.log(result.insertedIds);
}

app.get("/count", async (req, res) => {
  let count = await client
    .db("bulk_listing")
    .collection("items_list")
    .countDocuments();
  res.json(count);
});

app.get("/items", paginatedResults(), (req, res) => {
  //   pushMultipleEntry2();
  res.json(res.paginatedResults);
});

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
    } finally {
      //   await client.close();
    }
  };
}

const PORT = process.env.PORT || 8181;

app.listen(PORT, () => {
  console.log("App is running on port 8181");
});
