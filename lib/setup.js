const fs = require("fs");
const os = require("os");
const contents = fs.readFileSync(".env.example", "utf8");

function deserialize(env) {
  return env
    .split(/\r?\n/)
    .filter((line) => line.length && !line.startsWith("#"))
    .map((line) => {
      const [key, value] = line.split("=");
      return { key, value };
    });
}

function serialize(env) {
  env.map(({ key, value }) => `${key}=${value}`).join(os.EOL);
}

const config = deserialize(contents);

exports.config = config;

console.log(config);