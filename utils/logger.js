// Простой логгер с уровнями. Без внешних зависимостей, чтобы не падать в бутстрапе.
const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel = levels[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? levels.info;

function ts() {
  return new Date().toISOString();
}

function fmt(level, args) {
  const out = args.map(a => {
    if (a instanceof Error) return a.stack || a.message;
    if (typeof a === "object") {
      try { return JSON.stringify(a); } catch { return String(a); }
    }
    return String(a);
  }).join(" ");
  return `[${ts()}] [${level.toUpperCase()}] ${out}`;
}

function log(level, args) {
  if (levels[level] > currentLevel) return;
  const line = fmt(level, args);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

module.exports = {
  error: (...args) => log("error", args),
  warn:  (...args) => log("warn",  args),
  info:  (...args) => log("info",  args),
  debug: (...args) => log("debug", args)
};
