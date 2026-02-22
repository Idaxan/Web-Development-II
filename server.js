const express = require("express");
const app = express();
const fs = require("fs");
const data = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
const { Sequelize, DataTypes, Op} = require("sequelize");

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

const Category = conn.define("category", {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    }
});

const subcategory = conn.define("subcategory", {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique : true
    }
});

const product = conn.define("product", {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
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




// crud sequelize
app.use(express.json());

// get all products

app.get("/productDB", async (req, res) => {
    // Hemos quitado 'subcategory' temporalmente por la limitación de la base de datos
    const { category, search } = req.query; 
    let whereClause = {};

    if (category) {
        whereClause.categoryId = await FindCategoryId(category);
    }
    if (search) {
        whereClause.name = { [Sequelize.Op.like]: `%${search}%` };
    }

    const products = await product.findAll({ where: whereClause });
    res.json(products);
});

// create
app.post("/productDB", async (req, res) => {
    try {
        const { name, price, currency, stock, rating, categoryId } = req.body;
        const newProduct = await product.create({ name, price, currency, stock, rating, categoryId });
        res.status(201).json(newProduct);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// update
app.put("/productDB/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { name, price, currency, stock, rating, categoryId } = req.body;
        const [updated] = await product.update({ name, price, currency, stock, rating, categoryId }, { where: { id } });
        if (updated) {
            res.json({ message: "Product updated successfully" });
        } else {
            res.status(404).json({ error: "Product not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// delete
app.delete("/productDB/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await product.destroy({ where: { id } });
        if (deleted) {
            res.json({ message: "Product deleted successfully" });
        } else {
            res.status(404).json({ error: "Product not found" });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});



// Define associations
subcategory.belongsTo(Category, { foreignKey: "categoryId" });
Category.hasMany(subcategory, { foreignKey: "categoryId" });

product.belongsTo(Category, { foreignKey: "categoryId" });
Category.hasMany(product,{foreignKey: "categoryId"});

async function FillInCategories(){
    const { products } = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
    let categories = [...new Set(products.map(product => product.category))];
    const categorySorted = categories.sort();
    for ( const category of categorySorted) {
       await Category.create({ name: category });
    }
}

async function FillInSubCategories(){
    const { products } = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
    const subcategories = new Map();
    for (const product of products) {
        subcategories.set(product.subcategory, product.category);
    }
    console.log(subcategories);
    for (const subCategory of subcategories) {
        await subcategory.create({
            name: subCategory[0],
            categoryId: (await Category.findOne({ where: { name: subCategory[1] } }))?.id
        });
    }
}

function FindCategoryId(categoryName) {
    return Category.findOne({ where: { name: categoryName } })
        .then(category => category ? category.id : null)
        .catch(error => {
            console.error("Error finding category:", error);
            return null;
        });
}

async function FillInProducts(){
    const { products } = JSON.parse(fs.readFileSync("./products.json", { encoding: "utf-8" }));
    for (const productData of products) {
        const category = await Category.findOne({ where: { name: productData.category } });
        if (category) {
            await product.create({
                id: productData.id,
                name: productData.name,
                price: productData.price,
                currency: productData.currency,
                stock: productData.stock,
                rating: productData.rating,
                categoryId: await FindCategoryId(productData.category)
            });
        }
    }
}

async function AppInit() {
    await connectDB(); // 1. Conectar a la BD
    
    await conn.sync({ alter: true }); // 2. Esperar a que se creen las tablas
    console.log("Database & tables created!");

    console.log("Llenando base de datos...");
    await FillInCategories();    // Categorías primero (son los "padres")
    await FillInSubCategories(); // Subcategorías después
    await FillInProducts();      // Productos de último
    console.log("Base de datos llena!");
}

// AppInit(); 

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

app.listen(9000, () => console.log("Server running on port 9000"));