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
    type: mongoose.Schema.Types.Mixed,
    default: () => ({
      theme: "dark",
      accent: "#5e8ee7",
      chatBackground: "",
      notifications: true,
      soundEnabled: true,
      enterToSend: true,
      showLastSeen: true,
      fontSize: "medium",
      compactMode: false,
      bubbleStyle: "modern",
      animationsEnabled: true,
      videoQuality: "sd",
      videoFps: 30,
      voiceQuality: "medium",
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      autoDownload: { photo: true, video: true, voice: true, file: true, onWifiOnly: false, maxSize: 10 },
      readReceipts: true,
      typingIndicators: true,
      onlineStatus: true,
      keepOnline: false,
      autoplayVideos: true,
      autoplayGifs: true,
      loopAnimatedStickers: true,
      messageTextSize: 14,
      bubbleCorners: "rounded",
      nightModeAuto: false
    })
  },

  blocked: [{ type: String, index: true }],
  contacts: [{ type: String, index: true }],

  chatSettings: { type: mongoose.Schema.Types.Mixed, default: {} },

  createdAt: { type: Date, default: Date.now }
});

UserSchema.index({ username: 1, sessionToken: 1 });
UserSchema.index({ presence: 1, lastSeen: -1 });
UserSchema.index(
  { firstName: "text", lastName: "text", username: "text" },
  { default_language: "russian", name: "user_text_idx" }
);

module.exports = mongoose.model("User", UserSchema);
