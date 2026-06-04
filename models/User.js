const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  password: { type: String, required: true },
  firstName: { type: String, default: "", maxlength: 64 },
  lastName: { type: String, default: "", maxlength: 64 },
  bio: { type: String, default: "", maxlength: 200 },
  avatar: { type: String, default: "" },
  avatarColor: { type: String, default: "#5e8ee7" },

  presence: { type: String, enum: ["online", "offline", "away"], default: "offline", index: true },
  lastSeen: { type: Date, default: Date.now },

  sessionToken: { type: String, default: null, index: true },

  settings: {
    theme: { type: String, default: "dark" },
    accent: { type: String, default: "#5e8ee7" },
    chatBackground: { type: String, default: "" },
    notifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    enterToSend: { type: Boolean, default: true },
    showLastSeen: { type: Boolean, default: true }
  },

  blocked: [{ type: String, index: true }],
  contacts: [{ type: String }],

  chatSettings: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", UserSchema);
