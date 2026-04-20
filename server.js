
const express = require('express');
const mongoose = require('mongoose');
const { ethers } = require('ethers');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const cors = require('cors');

const { Signature, User } = require('./modal');

const app = express();
app.use(cors())
app.use(express.json());

const PORT = 8080;

const swaggerSpec = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ethereum Auth API',
      version: '1.0.0',
      description: 'APIs for Ethereum nonce generation and signature verification'
    },
    servers: [
      {
        url: `http://localhost:${PORT}`
      },

      {
        url: 'https://web3-auth-mjwy.onrender.com'
      }
    ],
    components: {
      schemas: {
        NonceRequest: {
          type: 'object',
          required: ['walletAddress'],
          properties: {
            walletAddress: {
              type: 'string',
              example: '0x1234567890abcdef1234567890abcdef12345678'
            }
          }
        },
        NonceResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Sign this message to login. Nonce: abc123xyz789'
            }
          }
        },
        VerifyRequest: {
          type: 'object',
          required: ['walletAddress', 'signature', 'message'],
          properties: {
            walletAddress: {
              type: 'string',
              example: '0x1234567890abcdef1234567890abcdef12345678'
            },
            signature: {
              type: 'string',
              example: '0x...'
            },
            message: {
              type: 'string',
              example: 'Sign this message to login. Nonce: abc123xyz789'
            }
          }
        },
        VerifyResponse: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              example: 'Login success ✅'
            },
            user: {
              type: 'object',
              properties: {
                _id: {
                  type: 'string',
                  example: '6804ee8852e8b1e1ce4d1234'
                },
                walletAddress: {
                  type: 'string',
                  example: '0x1234567890abcdef1234567890abcdef12345678'
                },
                createdAt: {
                  type: 'string',
                  format: 'date-time'
                },
                updatedAt: {
                  type: 'string',
                  format: 'date-time'
                }
              }
            }
          }
        }
      }
    }
  },
  apis: [__filename]
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// DB Connection
const dbConnection = async () => {
  try {
    await mongoose.connect(
      "mongodb://arvind_db_user:vTrPdY8YCcwuEizr@ac-56elnco-shard-00-00.pcjaexa.mongodb.net:27017,ac-56elnco-shard-00-01.pcjaexa.mongodb.net:27017,ac-56elnco-shard-00-02.pcjaexa.mongodb.net:27017/?ssl=true&replicaSet=atlas-c3hnv6-shard-0&authSource=admin&appName=Cluster0"
    );
    console.log("Database connected ✅");
  } catch (err) {
    console.error("DB ERROR 👉", err.message);
  }
};

// Generate nonce
const generateNonce = (length = 16) => {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }

  return result;
};


// ================================
// 🔐 STEP 1: Get Message (Nonce)
// ================================
/**
 * @swagger
 * /auth/nonce:
 *   post:
 *     summary: Generate a nonce message for wallet login
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/NonceRequest'
 *     responses:
 *       200:
 *         description: Nonce message generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NonceResponse'
 *       400:
 *         description: Wallet address required
 *       500:
 *         description: Server error
 */
app.post('/auth/nonce', async (req, res) => {
  try {
    const { walletAddress } = req.body;

    if (!walletAddress) {
      return res.status(400).json({ message: 'Wallet address required' });
    }

    const nonce = generateNonce();

    await Signature.findOneAndUpdate(
      { walletAddress },
      { nonce },
      { upsert: true, new: true }
    );

    const message = `Sign this message to login. Nonce: ${nonce} ${walletAddress.toLowerCase()}`;

    return res.json({ message , nonce });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// ================================
// 🔐 STEP 2: Verify Signature
// ================================
/**
 * @swagger
 * /auth/verify:
 *   post:
 *     summary: Verify Ethereum signed message and login user
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyRequest'
 *     responses:
 *       200:
 *         description: Signature verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/VerifyResponse'
 *       400:
 *         description: Missing fields or invalid nonce
 *       401:
 *         description: Invalid signature
 *       500:
 *         description: Server error
 */
app.post('/auth/verify', async (req, res) => {
  try {
    const { walletAddress, signature, message } = req.body;

    if (!walletAddress || !signature || !message) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const record = await Signature.findOne({ walletAddress });

    if (!record) {
      return res.status(400).json({ message: "Nonce not found" });
    }

    // Recover wallet address
    const recoveredAddress = ethers.verifyMessage(message, signature);

    if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(401).json({ message: "Invalid signature" });
    }

    // Check nonce
    if (!message.includes(record.nonce)) {
      return res.status(400).json({ message: "Invalid nonce" });
    }

    // Delete nonce after use
    await Signature.deleteOne({ walletAddress });

    // Create user if not exists
    let user = await User.findOne({ walletAddress });

    if (!user) {
      user = await User.create({ walletAddress });
    }

    return res.json({
      message: "Login success ✅",
      user
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});


// ================================
// 🚀 Start Server
// ================================
app.listen(PORT, async () => {
  await dbConnection();
  console.log(`Server running on port ${PORT}`);
});
