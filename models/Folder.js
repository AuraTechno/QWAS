const mongoose = require("mongoose");

const FolderSchema = new mongoose.Schema({
  owner: { type: String, required: true, index: true },
  title: { type: String, required: true, maxlength: 32 },
  icon: { type: String, default: "folder" },
  color: { type: String, default: "#5e8ee7" },
  chatIds: [{ type: String }],
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Folder", FolderSchema);
