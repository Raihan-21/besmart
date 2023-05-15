const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcrypt");
const cors = require("cors");
const slugify = require("slugify");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, "/uploads"));
  },
  filename: function (req, file, cb) {
    const slug = slugify(req.body.nama_kategori, { lower: true });
    cb(null, `${slug}-${file.originalname}`);
  },
});
const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    const slug = slugify(req.body.nama_kategori, { lower: true });
    let files = fs.readdirSync(path.join(__dirname, "/uploads"));
    const match = files.some((file) => file.includes(slug));
    if (match) {
      fs.unlinkSync(path.join(__dirname, "/uploads/") + files[0]);
    }
    cb(null, true);
  },
});

const uri =
  "mongodb+srv://raihan:iKeEZyWrdCzvu8UY@cluster0.dyuhm.mongodb.net/?retryWrites=true&w=majority";
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "build")));

const port = 5000;
app.listen(port, () => {
  console.log(`server running on port ${port}`);
});

const run = async () => {
  try {
    await client.connect();
    const db = client.db("be_smart");
    const murid = db.collection("murid");
    const admin = db.collection("admin");
    const guru = db.collection("guru");
    const berita = db.collection("berita");
    const kategori = db.collection("kategori");
    const kelas = db.collection("kelas");

    //----------------UNIQUE INDEX-----------------
    // const unique = await berita.createIndex({ slug: 1 }, { unique: true });

    //----------------TEST HASH-----------------
    // const saltAdmin = await bcrypt.genSalt();
    // const pwAdmin = await bcrypt.hash("test123", saltAdmin);
    // console.log(pwAdmin);

    app.use("/images", express.static(path.join(__dirname, "uploads")));

    // -------------- ENDPOINT USER -----------------
    app.post("/api/login", async (req, res) => {
      const error = { username: "", password: "" };
      const { username, password } = req.body;
      try {
        const checkUser = await murid.findOne({ username });
        if (!checkUser) {
          error.username = "Username tidak ditemukan";
          throw error;
        }
        const match = await bcrypt.compare(password, checkUser.password);
        if (!match) {
          error.password = "Password salah";
          throw error;
        }
        res.json({
          data: {
            username: checkUser.username,
            name: checkUser.nama,
            status: checkUser.status,
          },
        });
      } catch (error) {
        console.log(error);
        res.status(401).json(error);
      }
    });
    app.get("/api/kategori", async (req, res) => {
      try {
        const hasilKategori = await kategori.find().toArray();
        res.json({ data: hasilKategori });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/api/register", async (req, res) => {
      const {
        nama,
        username,
        alamat,
        password,
        no_hp,
        kategori,
        kelas,
        status,
      } = req.body;
      const salt = await bcrypt.genSalt();
      const hashed = await bcrypt.hash(password, salt);
      try {
        const addMurid = await murid.insertOne({
          nama,
          username,
          alamat,
          password: hashed,
          no_hp,
          kategori,
          kelas,
          status,
          tanggal_buat: new Date(),
        });
        res.json({ message: "sukses" });
      } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
      }
      // console.log(req.body);
    });
    app.get("/api/berita", async (req, res) => {
      try {
        const hasilBerita = await berita.find().toArray();
        res.json({ data: hasilBerita });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/profile/:id", async (req, res) => {
      try {
        const hasilBerita = await murid.findOne({ username: req.params.id });
        res.json({ data: hasilBerita });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.put("/api/profile/:username", async (req, res) => {
      const { username } = req.params;
      const { nama, alamat, no_hp } = req.body;
      try {
        const hasilUpdate = await murid.updateOne(
          { username },
          { $set: { nama, alamat, no_hp } }
        );
        res.json({ data: "", message: "Data berhasil diperbarui" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/kelas/:username", async (req, res) => {
      const { username } = req.params;
      const localeFormatter = new Intl.DateTimeFormat("id", {
        month: "long",
      });
      const month = localeFormatter.format(new Date());
      let statistics = [];
      let absenData = {};
      const { filter } = req.query;
      try {
        const hasilKelas = await kelas.find({ murid: username }).toArray();
        const hasilMurid = await murid.findOne({ username });
        let isLogged = false;
        const { absen } = hasilMurid;
        const currentAbsen = absen.find((item) =>
          filter
            ? filter.year
              ? item.year === filter.year
              : item.year === new Date().getFullYear().toString()
            : item.year === new Date().getFullYear().toString()
        );
        if (currentAbsen) {
          absenData = currentAbsen.month.find((bulan) => bulan.nama === month);
          if (absenData) {
            isLogged = absenData.data.includes(
              new Date().toISOString().slice(0, 10)
            );
          }
          statistics = currentAbsen.month.map((data) => {
            return { bulan: data.nama, total: data.data.length };
          });
        }

        const jadwal = [];
        hasilKelas.forEach((kelas) =>
          kelas.jadwal.forEach((item) => jadwal.push(item))
        );
        res.json({
          data: { isLogged, jadwal, statistics, kategori: hasilMurid.kategori },
        });
      } catch (error) {
        console.log(error);
        res.status(500).json({ error: error.message });
      }
    });
    app.put("/api/absen/:username", async (req, res) => {
      const { username } = req.params;
      let notExist = {};
      let updateMonth = {};
      let updateAbsen = {};
      try {
        const localeFormatter = new Intl.DateTimeFormat("id", {
          month: "long",
        });
        const year = new Date().getFullYear();
        const month = localeFormatter.format(new Date());
        notExist = await murid.updateOne(
          { username, "absen.year": { $ne: year } },
          {
            $push: {
              absen: {
                year: year.toString(),
                month: [{ nama: month, data: [req.body.date] }],
              },
            },
          }
        );
        if (!notExist.modifiedCount) {
          updateMonth = await murid.updateOne(
            {
              username,
              absen: {
                $elemMatch: {
                  year,
                  "month.nama": { $ne: month },
                },
              },
            },
            {
              $push: {
                "absen.$.month": { nama: month, data: [req.body.date] },
              },
            }
          );
        }
        if (!updateMonth.modifiedCount) {
          updateAbsen = await murid.updateOne(
            {
              username,
            },
            {
              $push: {
                "absen.$[absen].month.$[month].data": req.body.date,
              },
            },
            {
              arrayFilters: [
                {
                  "absen.year": year,
                },
                {
                  "month.nama": month,
                },
              ],
            }
          );
        }
        res.json({ message: "sukses" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // -------------- ENDPOINT GURU -----------------
    app.get("/api/guru/profile/:username", async (req, res) => {
      const { username } = req.params;
      try {
        const hasilGuru = await guru.findOne({ username });
        res.json({ data: hasilGuru });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    app.post("/api/guru/login", async (req, res) => {
      const { username, password } = req.body;
      const error = {
        username: "",
        password: "",
      };

      try {
        const hasilGuru = await guru.findOne({ username });
        if (!hasilGuru) {
          error.username = "Username tidak ditemukan";
          throw error;
        }
        const match = await bcrypt.compare(password, hasilGuru.password);
        if (!match) {
          error.password = "Password salah";
          throw error;
        }
        res.json({ data: { username, nama: hasilGuru.nama } });
      } catch (error) {
        res.status(401).json(error);
      }
    });
    app.get("/api/guru/kelas/:username", async (req, res) => {
      const { username } = req.params;
      const hasilKelas = await kelas.find({ id_guru: username }).toArray();
      const jadwal = [];
      hasilKelas.forEach((kelas) =>
        kelas.jadwal.forEach((item) => jadwal.push(item))
      );
      res.json({ data: jadwal });
    });

    app.put("/api/guru/profile/:username", async (req, res) => {
      const { username } = req.params;
      const { nama, alamat, no_hp } = req.body;
      try {
        const hasilUpdate = await guru.updateOne(
          { username },
          { $set: { nama, alamat, no_hp } }
        );
        res.json({ data: "", message: "Data berhasil diperbarui" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    // -------------- ENDPOINT ADMIN -----------------
    app.post("/admin/login", async (req, res) => {
      const { username, password } = req.body;
      const error = {
        username: "",
        password: "",
      };
      try {
        const main = await admin.findOne({ username });
        if (!main) {
          error.username = "Username tidak ditemukan";
          throw error;
        }
        const match = await bcrypt.compare(password, main.password);
        if (!match) {
          error.password = "Password salah";
          throw error;
        }
        res.json({ data: { username } });
      } catch (error) {
        res.status(401).json(error);
      }
    });
    app.get("/api/admin/murid", async (req, res) => {
      const hasilMurid = await murid
        .find()
        .sort({ tanggal_buat: -1 })
        .toArray();
      res.json({ data: hasilMurid });
    });
    app.get("/api/admin/murid/:username", async (req, res) => {
      const id = req.params.username;
      const hasilMurid = await murid.findOne({ username: id });
      res.json({ data: hasilMurid });
    });
    app.post("/api/admin/murid", async (req, res) => {
      try {
        const hasilMurid = await murid.insertOne(req.body);
        res.json({ data: hasilMurid });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.put("/api/admin/murid/:username", async (req, res) => {
      const id = req.params.username;
      const { username, nama, alamat, no_hp, kategori, kelas } = req.body;
      try {
        const hasilMurid = await murid.findOneAndUpdate(
          { username: id },
          { $set: { username, nama, alamat, no_hp, kategori, kelas } }
        );
        res.json({ data: hasilMurid });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.put("/api/admin/murid/:username/status", async (req, res) => {
      const { username } = req.params;
      const { status, id_kelas } = req.body;
      try {
        const updateMurid = await murid.updateOne(
          { username },
          { $set: { status, absen: [] } }
        );
        const updateKelas = await kelas.updateOne(
          { _id: ObjectId(id_kelas) },
          { $push: { murid: username } }
        );
        res.json({ message: "sukses" });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.delete("/api/admin/murid/:username", async (req, res) => {
      try {
        const username = req.params.username;
        const deleteMurid = await murid.deleteOne({ username });
        const popMurid = await kelas.updateOne(
          { murid: username },
          { $pull: { murid: username } }
        );
        res.json({ data: deleteMurid });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/guru", async (req, res) => {
      const hasilGuru = await guru.find().toArray();
      res.json({ data: hasilGuru });
    });
    app.post("/api/admin/guru", async (req, res) => {
      try {
        const { username, nama, alamat, no_hp, password } = req.body;
        const salt = await bcrypt.genSalt();
        const hashed = await bcrypt.hash(password, salt);
        const hasilGuru = await guru.insertOne({
          username,
          nama,
          alamat,
          no_hp,
          password: hashed,
        });
        res.json({ data: hasilGuru });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/guru/:username", async (req, res) => {
      const username = req.params.username;
      const hasilGuru = await guru.findOne({ username: username });
      res.json({ data: hasilGuru });
    });
    app.put("/api/admin/guru/:username", async (req, res) => {
      const id = req.params.username;
      const { username, nama, alamat, no_hp } = req.body;
      try {
        const hasilGuru = await guru.findOneAndUpdate(
          { username: id },
          { $set: { username, nama, alamat, no_hp } }
        );
        res.json({ data: hasilGuru });
      } catch (error) {
        res.json({ data: error });
      }
    });
    app.delete("/api/admin/guru/:username", async (req, res) => {
      try {
        const username = req.params.username;
        const hasilGuru = await guru.deleteOne({ username });
        res.json({ data: hasilGuru });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/berita", async (req, res) => {
      const hasilBerita = await berita.find().toArray();
      res.json({ data: hasilBerita });
    });
    app.get("/api/admin/berita/:slug", async (req, res) => {
      try {
        const slug = req.params.slug;
        const hasilBerita = await berita.findOne({ slug });
        res.json({ data: hasilBerita });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.post("/api/admin/berita", async (req, res) => {
      const { judul, deskripsi, tanggal_buat } = req.body;
      const slug = slugify(judul, { lower: true });
      const hasilBerita = await berita.insertOne({
        slug,
        judul,
        deskripsi,
        tanggal_buat,
      });
      res.json({ data: hasilBerita });
    });
    app.put("/api/admin/berita/:slug", async (req, res) => {
      const slug = req.params.slug;
      try {
        const { judul, deskripsi } = req.body;
        const newSlug = slugify(judul, { lower: true });
        const hasilBerita = await berita.updateOne(
          { slug },
          { $set: { slug: newSlug, judul, deskripsi } }
        );
        res.json({ data: hasilBerita });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.delete("/api/admin/berita/:slug", async (req, res) => {
      const slug = req.params.slug;
      try {
        const hasilBerita = await berita.deleteOne({ slug });
        res.json({ data: hasilBerita });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/kategori", async (req, res) => {
      try {
        if (req.query.page) {
          const hasilKategori = await kategori
            .find()
            .limit(parseInt(req.query.page.size))
            .toArray();
          res.json({ data: hasilKategori });
        } else {
          const hasilKategori = await kategori.find().toArray();
          res.json({ data: hasilKategori });
        }
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/kategori/:slug", async (req, res) => {
      const { slug } = req.params;
      try {
        const hasilKategori = await kategori.findOne({ slug });
        res.json({ data: hasilKategori });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.post(
      "/api/admin/kategori",
      upload.single("image"),
      async (req, res) => {
        const { nama_kategori, deskripsi, biaya } = req.body;
        const slug = slugify(req.body.nama_kategori, { lower: true });
        try {
          const hasilKategori = await kategori.insertOne({
            nama_kategori,
            slug,
            deskripsi,
            biaya,
            image: { name: `${slug}-${req.file.originalname}` },
          });
          res.json({ data: hasilKategori });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    app.put(
      "/api/admin/kategori/:slug",
      upload.single("image"),
      async (req, res) => {
        const { slug } = req.params;
        const { nama_kategori, deskripsi, biaya } = req.body;
        const newSlug = slugify(nama_kategori, { lower: true });
        try {
          if (req.file) {
            const hasilKategori = await kategori.updateOne(
              { slug },
              {
                $set: {
                  slug: newSlug,
                  nama_kategori,
                  deskripsi,
                  biaya,
                  image: { name: `${newSlug}-${req.file.originalname}` },
                },
              }
            );
            res.json({ data: hasilKategori });
          } else {
            const hasilKategori = await kategori.updateOne(
              { slug },
              {
                $set: {
                  slug: newSlug,
                  nama_kategori,
                  deskripsi,
                  biaya,
                },
              }
            );
            res.json({ data: hasilKategori });
          }
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      }
    );
    app.delete("/api/admin/kategori/:slug", async (req, res) => {
      const { slug } = req.params;
      try {
        const hasilKategori = await kategori.deleteOne({
          slug,
        });
        res.json({ data: hasilKategori });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/kelas", async (req, res) => {
      const fields = {};
      if (req.query.filter) {
        Object.keys(req.query.filter).forEach((param) => {
          if (param === "id_kategori" && req.query.filter[param]) {
            fields[param] = ObjectId(req.query.filter[param]);
          }
        });
      }
      try {
        const hasilKelas = await kelas
          .aggregate([
            { $match: fields },
            {
              $lookup: {
                from: "guru",
                localField: "id_guru",
                foreignField: "username",
                as: "guru",
              },
            },
            {
              $lookup: {
                from: "kategori",
                localField: "id_kategori",
                foreignField: "_id",
                as: "kategori",
              },
            },
            { $unwind: "$guru" },
            { $unwind: "$kategori" },
            {
              $project: {
                "guru.username": 1,
                "guru.nama": 1,
                "kategori._id": 1,
                "kategori.nama_kategori": 1,
                hari: 1,
                keterangan: 1,
                max_murid: 1,
                murid: 1,
              },
            },
          ])
          .toArray();
        const filterKelas = hasilKelas.filter(
          (kelas) => parseInt(kelas.max_murid) > kelas.murid.length
        );
        res.json({ data: filterKelas });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("/api/admin/kelas/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const hasilKelas = await kelas
          .aggregate([
            { $match: { _id: ObjectId(id) } },
            {
              $lookup: {
                from: "guru",
                localField: "id_guru",
                foreignField: "username",
                as: "guru",
              },
            },
            {
              $lookup: {
                from: "kategori",
                localField: "id_kategori",
                foreignField: "_id",
                as: "kategori",
              },
            },
            { $unwind: "$guru" },
            { $unwind: "$kategori" },
            {
              $project: {
                "guru.username": 1,
                "guru.nama": 1,
                "kategori._id": 1,
                "kategori.nama_kategori": 1,
                jadwal: 1,
                hari: 1,
                keterangan: 1,
                max_murid: 1,
              },
            },
          ])
          .toArray();
        res.json({ data: hasilKelas.length ? hasilKelas[0] : {} });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.post("/api/admin/kelas", async (req, res) => {
      const { keterangan, id_guru, id_kategori, jadwal, hari, max_murid } =
        req.body;
      try {
        const hasilKelas = await kelas.insertOne({
          keterangan,
          id_guru,
          id_kategori: ObjectId(id_kategori),
          jadwal,
          hari,
          max_murid,
        });
        res.json({ data: hasilKelas });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.put("/api/admin/kelas/:id", async (req, res) => {
      const { keterangan, id_guru, id_kategori, jadwal, hari, max_murid } =
        req.body;
      try {
        const hasilKelas = await kelas.updateOne(
          { _id: ObjectId(req.params.id) },
          {
            $set: {
              keterangan,
              id_guru,
              id_kategori: ObjectId(id_kategori),
              jadwal,
              hari,
              max_murid,
            },
          }
        );
        res.json({ data: hasilKelas });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.delete("/api/admin/kelas/:id", async (req, res) => {
      try {
        const hasilKelas = await kelas.deleteOne({
          _id: ObjectId(req.params.id),
        });
        res.json({ data: hasilKelas });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "build", "index.html"));
    });
  } catch (err) {
    console.log(err);
  }
};
run();
