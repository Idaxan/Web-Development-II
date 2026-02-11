const express = require("express");
const app = express();
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
const { Sequelize, DataTypes } = require("sequelize");

const conn = new Sequelize("products_inventory", "root", "root", {
    host: "localhost",
    dialect: "mysql"
});

const connectDB = async () => {
    try {
        await conn.authenticate();
        console.log("Connection has been established successfully.");
    } catch (error) {
        console.error("Unable to connect to the database:", error);
    }
};

const category = conn.define("category", {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

const product = conn.define("product", {
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    price:{
        type: DataTypes.DOUBLE.UNSIGNED,
        allowNull: false,
        defaultValue: 0.0
    },
    currency:{
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: "USD"
    },
    stock:{
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: false,
        defaultValue: 0
    },
    rating:{
        type: DataTypes.FLOAT.UNSIGNED,
        allowNull: false,
        defaultValue: 1.0
    }
});

conn.sync({ force: true }).then(() => {
    console.log("Database & tables created!");



product.belongsTo(category, { foreignKey: "categoryId" });
category.hasMany(product,{foreignKey: "categoryId"});

connectDB();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// middleware 
const readData = () => {
    return JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
};


const ProductExists = (req, res, next) => {
    const data = readData();
    const { id } = req.params;
    const product = data.products.find(p => p.id == id);

    if (!product) {
        return res.status(404).json({ error: "Product not found" });
    }
    
    req.product = product;
    req.allData = data;
    next();
}; 

const validatePayload = (req, res, next) => {
    const { name, price, category } = req.body;
    
    if (!name || !price || !category) {
        return res.status(400).json({ 
            error: "Missing required fields: name, price, and category are mandatory." 
        });
    }
    next();
};


app.get("/products", (req, res) => {
    const { category, subcategory, search } = req.query;
    let filteredProducts = data.products;

    if (category) {
        filteredProducts = filteredProducts.filter(p => 
            p.category?.toLowerCase() === category.toLowerCase()
        );
    }

    if (subcategory) {
        filteredProducts = filteredProducts.filter(p => 
            p.subcategory?.toLowerCase() === subcategory.toLowerCase()
        );
    }

    if (search) {
        const searchTerm = search.toLowerCase();
        filteredProducts = filteredProducts.filter(p => 
            p.name?.toLowerCase().includes(searchTerm) || 
            p.description?.toLowerCase().includes(searchTerm)
        );
    }

    res.json(filteredProducts);
});

app.get("/products/:id", ProductExists, (req, res) => {
    res.json(req.product);
});

app.post("/products", validatePayload, (req, res) => {
    const filedata = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
    const {body} = req;
    filedata.products.push(body);
    if(!body){
        return res.status(400).json({ error: "Request body is required" });
    }

    fs.writeFileSync("./products.json", JSON.stringify(filedata, null, 2), (err) => {
        if (err) {
            return res.status(500).json({ error: "Failed to write data" });
        }

        res.status(201).json({ message: "Data written successfully" });
    });
    res.json(body);
});

app.put("/products/:id", validatePayload, ProductExists, (req, res) => {
    const filedata = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
    const { id } = req.params;
    const { body } = req;
    const productIndex = filedata.products.findIndex(p => p.id == id);

    if (productIndex === -1) {
        return res.status(404).json({ error: "Product not found" });
    }

    filedata.products[productIndex] = { ...filedata.products[productIndex], ...body };
    fs.writeFileSync("./products.json", JSON.stringify(filedata, null, 2));
    res.json({ message: "Product updated successfully" });
});

app.delete("/products/:id", ProductExists, (req, res) => {
    const data = req.allData;
    data.products = data.products.filter(p => p.id != req.params.id);
    
    writeData(data);
    res.status(204).send();
});

app.listen(9000, () => console.log("Server running on port 9000"));});