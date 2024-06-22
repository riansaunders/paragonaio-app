import fs from "fs";
import crypto from "crypto";

import path from "path";

const dir = path.join(__dirname, "encrypted");
const outDir = path.join(__dirname, "decrypted");
const allEncrypted = fs.readdirSync(dir);

for (let file of allEncrypted) {
  const key = `tHAa2do4OaLRQwynP8hu2OVnvLJ6ZSow`;
  const iv = `Gd2t5CdqmFsFHNib`;
  const buf = fs.readFileSync(path.join(dir, file));

  let decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(key), iv);
  let decrypted = decipher.update(buf);

  decrypted = Buffer.concat([decrypted, decipher.final()]);

  fs.writeFileSync(
    path.join(outDir, `${file.split(".")[0]}.json`),
    decrypted.toString("utf-8")
  );
}
