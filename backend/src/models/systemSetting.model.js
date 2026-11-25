const mongoose = require('mongoose');
const { withSeedMarker } = require('../utils/schema.js');

const systemSettingSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true },
  description: { type: String },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedAt: { type: Date, default: Date.now },
});

withSeedMarker(systemSettingSchema);

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
