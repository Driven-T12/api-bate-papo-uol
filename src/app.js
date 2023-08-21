import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import { MongoClient } from "mongodb"
import Joi from "joi"
import dayjs from "dayjs"

const app = express()

// Configurações
app.use(cors())
app.use(express.json())
dotenv.config()

// Conexão com o banco de dados
const mongoClient = new MongoClient(process.env.DATABASE_URL)

try {
    mongoClient.connect()
    console.log("MongoDB conectado!")
} catch (err) {
    console.log(err.message)
}

const db = mongoClient.db()

// Schemas
const participantSchema = Joi.object({ name: Joi.string().required() })

const messageSchema = Joi.object({
    from: Joi.string().required(),
    to: Joi.string().required(),
    text: Joi.string().required(),
    type: Joi.required().valid("message", "private_message")
})

// Rotas
app.post("/participants", async (req, res) => {
    const { name } = req.body

    const validation = participantSchema.validate(req.body, { abortEarly: false })
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message)
        return res.status(422).send(errors)
    }

    try {
        const participant = await db.collection("participants").findOne({ name })
        if (participant) return res.status(409).send("Este nome de usuário já existe!")

        const timestamp = Date.now()
        await db.collection("participants").insertOne({ name, lastStatus: timestamp })

        const message = {
            from: name,
            to: 'Todos',
            text: 'entra na sala...',
            type: 'status',
            time: dayjs(timestamp).format("HH:mm:ss")
        }

        await db.collection("messages").insertOne(message)
        res.sendStatus(201)
    } catch (err) {
        res.status(500).send(err.message)
    }
})

app.get("/participants", async (req, res) => {
    try {
        const participants = await db.collection("participants").find().toArray()
        res.send(participants)
    } catch (err) {
        res.status(500).send(err.message)
    }
})

app.post("/messages", async (req, res) => {
    const { user } = req.headers

    const validation = messageSchema.validate({ ...req.body, from: user }, { abortEarly: false })
    if (validation.error) {
        const errors = validation.error.details.map(detail => detail.message)
        return res.status(422).send(errors)
    }

    try {
        const participant = await db.collection("participants").findOne({ name: user })
        if (!participant) return res.status(422).send("Você precisa entrar na sala antes de enviar uma mensagem")


        const message = {
            ...req.body,
            from: user,
            time: dayjs().format("HH:mm:ss")
        }

        await db.collection("messages").insertOne(message)
        res.sendStatus(201)

    } catch (err) {
        res.status(500).send(err.message)
    }
})

app.get("/messages", async (req, res) => {
    const { user } = req.headers
    const { limit } = req.query
    const numberLimit = Number(limit)

    if (limit !== undefined && (numberLimit <= 0 || isNaN(numberLimit))) {
        return res.status(422).send("Insira um limite válido")
    }

    try {
        const messages = await db.collection("messages")
            .find({ $or: [{ from: user }, { to: user }, { to: "Todos" }, { type: "message" }] })
            .sort({ time: -1 })
            .limit(limit === undefined ? 0 : numberLimit)
            .toArray()

        res.send(messages)
    } catch (err) {
        res.status(500).send(err.message)
    }
})

// Deixa o app ligado, escutando, à espera de requisições
const PORT = 5000
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`))