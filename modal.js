const mongoose = require('mongoose');

// Signature Schema (nonce store)
const signatureSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    index: true
  },
  nonce: {
    type: String,
    required: true
  }
}, { timestamps: true });

// User Schema
const userSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    unique: true
  },
  name: String,
  email: String
}, { timestamps: true });

const Signature = mongoose.model('Signature', signatureSchema);
const User = mongoose.model('User', userSchema);

module.exports = {
  Signature,
  User
};